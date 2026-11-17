import { BadRequestException, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import type { MediaAssetDto } from '@whatsapp-crm/shared-types';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { MediaService } from './media.service';

/** Public origin of this API as the browser/Meta see it (behind Hostinger's proxy). */
function originOf(req: Request): string {
  const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() || req.get('host') || '';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  // Meta only accepts https links, so anything that is not a local dev server is https.
  const proto = local ? forwardedProto || req.protocol : 'https';
  return `${proto}://${host}`;
}

/**
 * POST /api/v1/media — the browser sends the raw image bytes as the request
 * body (Content-Type image/jpeg or image/png, parsed in configureApp), with
 * the original file name in ?filename=.
 */
@Controller('media')
@Roles('tenant_admin', 'agent')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  async upload(
    @TenantId() tenantId: string,
    @Req() req: Request,
    @Query('filename') filename?: string,
  ): Promise<MediaAssetDto> {
    if (typeof filename !== 'undefined' && typeof filename !== 'string') throw new BadRequestException('Invalid filename');
    const asset = await this.media.createImage(tenantId, filename, req.body);
    return {
      id: asset.id,
      url: `${originOf(req)}/files/${asset.id}`,
      filename: asset.filename,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
    };
  }
}

/**
 * GET /files/:id — unauthenticated and unversioned on purpose: Meta downloads
 * header images from this link when it sends a template. The random UUID is
 * the access control, and only images uploaded through POST /media exist here.
 */
@Controller('files')
export class PublicFilesController {
  constructor(private readonly media: MediaService) {}

  @Public()
  @Get(':id')
  @Header('Cache-Control', 'public, max-age=86400')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const asset = await this.media.findPublic(id);
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Content-Length', String(asset.data.length));
    res.setHeader('Content-Disposition', `inline; filename="${asset.filename}"`);
    res.end(Buffer.from(asset.data));
  }
}
