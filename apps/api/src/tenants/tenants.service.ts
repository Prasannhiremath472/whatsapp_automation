import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import type { CreateTenantRequest, Tenant, UpdateTenantRequest, User } from '@whatsapp-crm/shared-types';
import { DatabaseService } from '../database/database.service';

const BCRYPT_ROUNDS = 10;

interface TenantRow extends RowDataPacket {
  id: string;
  name: string;
  slug: string;
  business_category: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface UserRow extends RowDataPacket {
  id: string;
  tenantId: string | null;
  email: string;
  role: string;
  displayName: string;
  isActive: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toPublicTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    business_category: row.business_category,
    status: row.status as Tenant['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPublicUser(row: UserRow): User {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    role: row.role as User['role'],
    displayName: row.displayName,
    isActive: !!row.isActive,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class TenantsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * super_admin only. Creates a Tenant AND its first tenant_admin user
   * together in a single transaction so a tenant never exists without an
   * owning admin (and vice versa).
   */
  async createTenantWithAdmin(input: CreateTenantRequest): Promise<{ tenant: Tenant; admin: User }> {
    const existingSlugRows = await this.db.query<TenantRow[]>('SELECT * FROM tenants WHERE slug = ? LIMIT 1', [
      input.slug,
    ]);
    if (existingSlugRows.length > 0) {
      throw new ConflictException('A tenant with this slug already exists');
    }

    const passwordHash = await bcrypt.hash(input.adminPassword, BCRYPT_ROUNDS);
    const tenantId = randomUUID();
    const adminId = randomUUID();

    await this.db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO tenants (id, name, slug, business_category, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 'pending_onboarding', NOW(3), NOW(3))`,
        [tenantId, input.name, input.slug, input.business_category ?? null],
      );

      await tx.execute(
        `INSERT INTO users (id, tenantId, email, passwordHash, role, displayName, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 'tenant_admin', ?, 1, NOW(3), NOW(3))`,
        [adminId, tenantId, input.adminEmail, passwordHash, input.adminDisplayName],
      );
    });

    const [tenant] = await this.db.query<TenantRow[]>('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    const [admin] = await this.db.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [adminId]);

    return { tenant: toPublicTenant(tenant), admin: toPublicUser(admin) };
  }

  async list(): Promise<Tenant[]> {
    const rows = await this.db.query<TenantRow[]>('SELECT * FROM tenants ORDER BY createdAt DESC');
    return rows.map(toPublicTenant);
  }

  async findById(id: string): Promise<Tenant> {
    const rows = await this.db.query<TenantRow[]>('SELECT * FROM tenants WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      throw new NotFoundException('Tenant not found');
    }
    return toPublicTenant(rows[0]);
  }

  async update(id: string, input: UpdateTenantRequest): Promise<Tenant> {
    await this.findById(id);

    const setClauses: string[] = [];
    const params: (string | null)[] = [];

    if (input.name !== undefined) {
      setClauses.push('name = ?');
      params.push(input.name);
    }
    if (input.business_category !== undefined) {
      setClauses.push('business_category = ?');
      params.push(input.business_category);
    }
    if (input.status !== undefined) {
      setClauses.push('status = ?');
      params.push(input.status);
    }

    if (setClauses.length > 0) {
      params.push(id);
      await this.db.execute(`UPDATE tenants SET ${setClauses.join(', ')}, updatedAt = NOW(3) WHERE id = ?`, params);
    }

    return this.findById(id);
  }
}
