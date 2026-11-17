import axios from 'axios';
import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type MessageTemplate, type TemplateStatus } from '@prisma/client';
import {
  extractVariableNumbers,
  metaCategoryFor,
  variableCount,
  type ListTemplatesQuery,
  type SaveTemplateRequest,
  type TemplateButton,
  type TemplateDto,
} from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService, sniffImageType } from '../media/media.service';
import {
  WHATSAPP_PROVIDER,
  WhatsAppSendError,
  type WhatsAppProvider,
} from '../whatsapp-connections/whatsapp-provider.interface';

export function toTemplateDto(t: MessageTemplate): TemplateDto {
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    language: t.language,
    headerType: t.headerType,
    headerText: t.headerText,
    headerMediaUrl: t.headerMediaUrl,
    body: t.body,
    footer: t.footer,
    buttons: (t.buttons as unknown as TemplateButton[]) ?? [],
    status: t.status,
    rejectionReason: t.rejectionReason,
    bodyVariableCount: variableCount(t.body),
    headerVariableCount: t.headerText ? Math.min(1, extractVariableNumbers(t.headerText).length) : 0,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Meta's template status event names -> our status. */
function mapMetaEvent(event: string): { status: TemplateStatus; reason?: string } | null {
  switch (event.toUpperCase()) {
    case 'APPROVED':
      return { status: 'approved' };
    case 'REJECTED':
      return { status: 'rejected' };
    case 'PENDING':
    case 'IN_APPEAL':
      return { status: 'pending' };
    case 'PAUSED':
    case 'DISABLED':
    case 'FLAGGED':
      return { status: 'rejected', reason: `Meta marked this template ${event.toLowerCase()}` };
    default:
      return null;
  }
}

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  async list(tenantId: string, query: ListTemplatesQuery): Promise<TemplateDto[]> {
    const rows = await this.prisma.messageTemplate.findMany({
      where: {
        tenantId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.q ? { OR: [{ name: { contains: query.q } }, { body: { contains: query.q } }] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toTemplateDto);
  }

  private async findOwned(tenantId: string, id: string): Promise<MessageTemplate> {
    const template = await this.prisma.messageTemplate.findFirst({ where: { id, tenantId } });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async get(tenantId: string, id: string): Promise<TemplateDto> {
    return toTemplateDto(await this.findOwned(tenantId, id));
  }

  async create(tenantId: string, input: SaveTemplateRequest): Promise<TemplateDto> {
    const clash = await this.prisma.messageTemplate.findUnique({
      where: { tenantId_name_language: { tenantId, name: input.name, language: input.language } },
    });
    if (clash) throw new ConflictException('A template with this name and language already exists');

    const created = await this.prisma.messageTemplate.create({
      data: {
        tenantId,
        name: input.name,
        category: input.category,
        language: input.language,
        headerType: input.headerType,
        headerText: input.headerType === 'text' ? (input.headerText ?? null) : null,
        headerMediaUrl: input.headerType === 'image' ? (input.headerMediaUrl ?? null) : null,
        body: input.body,
        footer: input.footer || null,
        buttons: input.buttons as unknown as Prisma.InputJsonValue,
        status: 'draft',
      },
    });
    return toTemplateDto(created);
  }

  async update(tenantId: string, id: string, input: SaveTemplateRequest): Promise<TemplateDto> {
    const current = await this.findOwned(tenantId, id);
    if (current.status === 'pending' || current.status === 'approved') {
      throw new ConflictException(
        'Approved or pending templates cannot be edited. Duplicate it under a new name instead.',
      );
    }
    if (input.name !== current.name || input.language !== current.language) {
      const clash = await this.prisma.messageTemplate.findUnique({
        where: { tenantId_name_language: { tenantId, name: input.name, language: input.language } },
      });
      if (clash && clash.id !== id) throw new ConflictException('A template with this name and language already exists');
    }
    const updated = await this.prisma.messageTemplate.update({
      where: { id },
      data: {
        name: input.name,
        category: input.category,
        language: input.language,
        headerType: input.headerType,
        headerText: input.headerType === 'text' ? (input.headerText ?? null) : null,
        headerMediaUrl: input.headerType === 'image' ? (input.headerMediaUrl ?? null) : null,
        body: input.body,
        footer: input.footer || null,
        buttons: input.buttons as unknown as Prisma.InputJsonValue,
        status: 'draft',
        rejectionReason: null,
      },
    });
    return toTemplateDto(updated);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOwned(tenantId, id);
    const campaigns = await this.prisma.broadcastCampaign.count({ where: { templateId: id } });
    if (campaigns > 0) {
      throw new ConflictException('This template is used by campaigns and cannot be deleted');
    }
    await this.prisma.messageTemplate.delete({ where: { id } });
  }

  /** Submits a draft/rejected template to Meta for review. */
  async submit(tenantId: string, id: string): Promise<TemplateDto> {
    const template = await this.findOwned(tenantId, id);
    if (template.status === 'approved' || template.status === 'pending') {
      throw new ConflictException('This template has already been submitted');
    }
    const connection = await this.prisma.whatsappConnection.findUnique({ where: { tenantId } });
    if (!connection || connection.connectionStatus !== 'connected') {
      throw new BadRequestException('Connect a WhatsApp account before submitting templates');
    }

    const headerSample = template.headerType === 'image' ? await this.loadHeaderSample(tenantId, template.headerMediaUrl) : undefined;

    try {
      const result = await this.provider.submitTemplate(connection, {
        name: template.name,
        language: template.language,
        category: metaCategoryFor(template.category),
        headerType: template.headerType,
        headerText: template.headerText,
        ...(headerSample ? { headerSample } : {}),
        body: template.body,
        footer: template.footer,
        buttons: template.buttons as unknown as TemplateButton[],
      });
      const updated = await this.prisma.messageTemplate.update({
        where: { id },
        data: {
          status: result.status,
          metaTemplateId: result.metaTemplateId,
          submittedAt: new Date(),
          rejectionReason: null,
        },
      });
      return toTemplateDto(updated);
    } catch (err) {
      if (err instanceof WhatsAppSendError) {
        this.logger.warn(`Template submit failed tenantId=${tenantId} id=${id}: ${err.message}`);
        throw new BadGatewayException(err.message);
      }
      throw err;
    }
  }

  /** Meta needs the actual image as the template's sample: our own upload, or a download of an external link. */
  private async loadHeaderSample(
    tenantId: string,
    url: string | null,
  ): Promise<{ data: Buffer; mimeType: 'image/jpeg' | 'image/png'; filename: string }> {
    if (!url) {
      throw new BadRequestException('Upload a sample image for the header before submitting this template');
    }
    const own = await this.media.findOwnedByUrl(tenantId, url);
    if (own) {
      return { data: Buffer.from(own.data), mimeType: own.mimeType as 'image/jpeg' | 'image/png', filename: own.filename };
    }
    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 15_000,
        maxContentLength: 5 * 1024 * 1024,
        maxRedirects: 3,
      });
      const data = Buffer.from(res.data);
      const mimeType = sniffImageType(data);
      if (!mimeType) throw new Error('not a JPG or PNG image');
      return { data, mimeType, filename: `header.${mimeType === 'image/png' ? 'png' : 'jpg'}` };
    } catch {
      throw new BadRequestException('Could not download the header image. Upload it again (JPG or PNG, up to 5 MB).');
    }
  }

  /** Pulls the templates that exist on the WhatsApp Business Account into this tenant. */
  async syncFromMeta(tenantId: string): Promise<{ created: number; updated: number }> {
    const connection = await this.prisma.whatsappConnection.findUnique({ where: { tenantId } });
    if (!connection || connection.connectionStatus !== 'connected') {
      throw new BadRequestException('Connect a WhatsApp account first');
    }

    let remote;
    try {
      remote = await this.provider.fetchTemplates(connection);
    } catch (err) {
      if (err instanceof WhatsAppSendError) throw new BadGatewayException(err.message);
      throw err;
    }

    let created = 0;
    let updated = 0;
    for (const r of remote) {
      const existing = await this.prisma.messageTemplate.findUnique({
        where: { tenantId_name_language: { tenantId, name: r.name, language: r.language } },
      });
      const fields = {
        headerType: r.headerType,
        headerText: r.headerText ?? null,
        body: r.body,
        footer: r.footer ?? null,
        buttons: r.buttons as unknown as Prisma.InputJsonValue,
        status: r.status,
        rejectionReason: r.rejectionReason ?? null,
        metaTemplateId: r.id,
      };
      if (existing) {
        await this.prisma.messageTemplate.update({ where: { id: existing.id }, data: fields });
        updated += 1;
      } else {
        await this.prisma.messageTemplate.create({
          data: {
            tenantId,
            name: r.name,
            language: r.language,
            category: r.category === 'MARKETING' ? 'Marketing' : 'Customer Support',
            submittedAt: new Date(),
            ...fields,
          },
        });
        created += 1;
      }
    }
    return { created, updated };
  }

  /**
   * Handles Meta's `message_template_status_update` webhook (approval /
   * rejection). `wabaId` is the webhook entry id; templates are matched by
   * Meta's template id first, falling back to name + language.
   */
  async applyStatusEvent(
    wabaId: string,
    value: { event?: string; message_template_id?: number | string; message_template_name?: string; message_template_language?: string; reason?: string },
  ): Promise<void> {
    const mapped = value.event ? mapMetaEvent(value.event) : null;
    if (!mapped) return;

    const connection = await this.prisma.whatsappConnection.findFirst({ where: { wabaId }, select: { tenantId: true } });
    if (!connection) {
      this.logger.warn(`Template status event for unknown wabaId=${wabaId}; dropping`);
      return;
    }

    const metaId = value.message_template_id !== undefined ? String(value.message_template_id) : undefined;
    const template =
      (metaId ? await this.prisma.messageTemplate.findFirst({ where: { tenantId: connection.tenantId, metaTemplateId: metaId } }) : null) ??
      (value.message_template_name && value.message_template_language
        ? await this.prisma.messageTemplate.findUnique({
            where: {
              tenantId_name_language: {
                tenantId: connection.tenantId,
                name: value.message_template_name,
                language: value.message_template_language,
              },
            },
          })
        : null);
    if (!template) return;

    const reason =
      mapped.status === 'rejected'
        ? (value.reason && value.reason !== 'NONE' ? value.reason : null) ?? mapped.reason ?? 'Rejected by Meta'
        : null;
    await this.prisma.messageTemplate.update({
      where: { id: template.id },
      data: { status: mapped.status, rejectionReason: reason },
    });
    this.logger.log(`Template ${template.name} (${template.language}) -> ${mapped.status}`);
  }
}
