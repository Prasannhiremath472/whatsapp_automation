import { Injectable, NotFoundException } from '@nestjs/common';
import type { ApiKey, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import type { ApiKeyDto, ApiKeyWithSecretDto, ApiScope, CreateApiKeyRequest } from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const API_KEY_PREFIX = 'gk_live_';

export const hashApiKey = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/** gk_live_ + 32 random letters/digits (about 190 bits). */
export function generateApiKey(): string {
  const bytes = randomBytes(32);
  let body = '';
  for (const b of bytes) body += ALPHABET[b % ALPHABET.length];
  return `${API_KEY_PREFIX}${body}`;
}

export function toApiKeyDto(k: ApiKey): ApiKeyDto {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes as unknown as ApiScope[],
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    requestCount: k.requestCount,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  };
}

export interface VerifiedKey {
  id: string;
  tenantId: string;
  name: string;
  scopes: ApiScope[];
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<ApiKeyDto[]> {
    const rows = await this.prisma.apiKey.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    return rows.map(toApiKeyDto);
  }

  /** The secret is returned here once; only its hash is stored. */
  async create(tenantId: string, userId: string, input: CreateApiKeyRequest): Promise<ApiKeyWithSecretDto> {
    const secret = generateApiKey();
    const created = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name: input.name,
        prefix: secret.slice(0, API_KEY_PREFIX.length + 8),
        keyHash: hashApiKey(secret),
        scopes: input.scopes as unknown as Prisma.InputJsonValue,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
        createdByUserId: userId,
      },
    });
    return { ...toApiKeyDto(created), secret };
  }

  async revoke(tenantId: string, id: string): Promise<ApiKeyDto> {
    const key = await this.prisma.apiKey.findFirst({ where: { id, tenantId } });
    if (!key) throw new NotFoundException('API key not found');
    if (key.revokedAt) return toApiKeyDto(key);
    return toApiKeyDto(await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } }));
  }

  /** Returns the key's details when `secret` is a valid, unrevoked, unexpired key; otherwise null. */
  async verify(secret: string): Promise<VerifiedKey | null> {
    if (!secret.startsWith(API_KEY_PREFIX) || secret.length > 100) return null;
    const key = await this.prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(secret) } });
    if (!key || key.revokedAt) return null;
    if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null;
    return { id: key.id, tenantId: key.tenantId, name: key.name, scopes: key.scopes as unknown as ApiScope[] };
  }

  /** Records that the key was used (best effort; never blocks a request). */
  touch(id: string): void {
    void this.prisma.apiKey
      .update({ where: { id }, data: { lastUsedAt: new Date(), requestCount: { increment: 1 } } })
      .catch(() => undefined);
  }
}
