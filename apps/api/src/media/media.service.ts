import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MediaAsset } from '@prisma/client';
import { MEDIA_MAX_BYTES } from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';

/** Uploads kept per business, so one account cannot fill the database. */
export const MAX_ASSETS_PER_TENANT = 200;

/** Matches the id in one of our public file links, e.g. https://api.example.com/files/<uuid>. */
const FILE_URL_RE = /\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;

/** Detects the real image type from the file's first bytes; the client-declared type is not trusted. */
export function sniffImageType(data: Buffer): 'image/jpeg' | 'image/png' | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  return null;
}

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async createImage(tenantId: string, rawName: string | undefined, data: unknown): Promise<MediaAsset> {
    if (!Buffer.isBuffer(data) || data.length === 0) {
      throw new BadRequestException('Send the image as a JPEG or PNG file');
    }
    if (data.length > MEDIA_MAX_BYTES) throw new BadRequestException('The image must be 5 MB or smaller');
    const mimeType = sniffImageType(data);
    if (!mimeType) throw new BadRequestException('Only JPG and PNG images are supported');

    const existing = await this.prisma.mediaAsset.count({ where: { tenantId } });
    if (existing >= MAX_ASSETS_PER_TENANT) {
      throw new BadRequestException(`You have reached the limit of ${MAX_ASSETS_PER_TENANT} uploaded images`);
    }

    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const base = (rawName ?? 'image').replace(/\.[^.]*$/, '').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'image';
    return this.prisma.mediaAsset.create({
      data: { tenantId, filename: `${base}.${ext}`, mimeType, sizeBytes: data.length, data },
    });
  }

  /** Public lookup: the unguessable id is the capability Meta uses to download the image. */
  async findPublic(id: string): Promise<MediaAsset> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('File not found');
    return asset;
  }

  /**
   * Bytes of an image referenced by one of this business's own file links, or
   * null when the link points somewhere else (an external image).
   */
  async findOwnedByUrl(tenantId: string, url: string): Promise<MediaAsset | null> {
    const id = FILE_URL_RE.exec(url)?.[1];
    if (!id) return null;
    return this.prisma.mediaAsset.findFirst({ where: { id, tenantId } });
  }
}
