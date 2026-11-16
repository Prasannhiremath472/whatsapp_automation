import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  BulkDeleteContactsRequestSchema,
  BulkTagRequestSchema,
  CreateContactRequestSchema,
  ImportContactsRequestSchema,
  ListContactsQuerySchema,
  UpdateContactRequestSchema,
  type BulkDeleteContactsRequest,
  type BulkTagRequest,
  type ContactDto,
  type CreateContactRequest,
  type ImportContactsRequest,
  type ImportContactsResult,
  type ListContactsQuery,
  type Paginated,
  type UpdateContactRequest,
} from '@whatsapp-crm/shared-types';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ContactsService } from './contacts.service';

/** Neutralises spreadsheet formula injection and quotes the cell for CSV. */
function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

@Controller('contacts')
@Roles('tenant_admin', 'agent')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(ListContactsQuerySchema)) query: ListContactsQuery,
  ): Promise<Paginated<ContactDto>> {
    return this.contacts.list(tenantId, query);
  }

  @Get('tags')
  tags(@TenantId() tenantId: string) {
    return this.contacts.listTags(tenantId);
  }

  @Get('locations')
  locations(@TenantId() tenantId: string) {
    return this.contacts.listLocations(tenantId);
  }

  @Get('export')
  async export(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(ListContactsQuerySchema.partial())) query: Partial<ListContactsQuery>,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="genie-contacts.csv"');
    res.write('name,phone,email,tags,source,location,status,opted_out\n');
    for await (const batch of this.contacts.exportRows(tenantId, query)) {
      res.write(
        batch
          .map((c) =>
            [c.name, `+${c.phone}`, c.email, c.tags.join(';'), c.source, c.location, c.leadStatus, c.optedOut ? 'yes' : 'no']
              .map(csvCell)
              .join(','),
          )
          .join('\n') + '\n',
      );
    }
    res.end();
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<ContactDto> {
    return this.contacts.get(tenantId, id);
  }

  @Post()
  create(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(CreateContactRequestSchema)) body: CreateContactRequest,
  ): Promise<ContactDto> {
    return this.contacts.create(tenantId, body);
  }

  @Post('import')
  @HttpCode(200)
  import(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(ImportContactsRequestSchema)) body: ImportContactsRequest,
  ): Promise<ImportContactsResult> {
    return this.contacts.import(tenantId, body);
  }

  @Post('bulk-tags')
  @HttpCode(200)
  bulkTag(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(BulkTagRequestSchema)) body: BulkTagRequest,
  ): Promise<{ affected: number }> {
    return this.contacts.bulkTag(tenantId, body);
  }

  @Post('bulk-delete')
  @HttpCode(200)
  @Roles('tenant_admin')
  bulkDelete(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(BulkDeleteContactsRequestSchema)) body: BulkDeleteContactsRequest,
  ): Promise<{ deleted: number; blocked: number }> {
    return this.contacts.bulkRemove(tenantId, body.contactIds);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateContactRequestSchema)) body: UpdateContactRequest,
  ): Promise<ContactDto> {
    return this.contacts.update(tenantId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('tenant_admin')
  remove(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.contacts.remove(tenantId, id);
  }
}
