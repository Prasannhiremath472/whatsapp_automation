import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import type { CreateUserRequest, UpdateUserRequest, User } from '@whatsapp-crm/shared-types';
import { DatabaseService } from '../database/database.service';

const BCRYPT_ROUNDS = 10;

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
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * tenant_admin creates a user (agent by default) in THEIR OWN tenant.
   * `callerTenantId` MUST be derived server-side from the caller's JWT by
   * the controller — never accept tenantId from the request body. This is
   * the primary tenant-isolation-on-write enforcement point for M1.
   */
  async createInTenant(callerTenantId: string, input: CreateUserRequest): Promise<User> {
    const existing = await this.db.query<UserRow[]>(
      'SELECT * FROM users WHERE tenantId = ? AND email = ? LIMIT 1',
      [callerTenantId, input.email],
    );
    if (existing.length > 0) {
      throw new ConflictException('A user with this email already exists in this tenant');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO users (id, tenantId, email, passwordHash, role, displayName, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW(3), NOW(3))`,
      [id, callerTenantId, input.email, passwordHash, input.role ?? 'agent', input.displayName],
    );

    const [created] = await this.db.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [id]);
    return toPublicUser(created);
  }

  async listInTenant(tenantId: string): Promise<User[]> {
    const rows = await this.db.query<UserRow[]>(
      'SELECT * FROM users WHERE tenantId = ? ORDER BY createdAt DESC',
      [tenantId],
    );
    return rows.map(toPublicUser);
  }

  async updateInTenant(tenantId: string, userId: string, input: UpdateUserRequest): Promise<User> {
    const existingRows = await this.db.query<UserRow[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
    const existing = existingRows[0];
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    if (existing.tenantId !== tenantId) {
      // Enforce same-tenant only — never let a tenant_admin touch another
      // tenant's users, even if they know the user id.
      throw new ForbiddenException('Cannot modify a user outside your tenant');
    }

    const setClauses: string[] = [];
    const params: (string | number)[] = [];

    if (input.isActive !== undefined) {
      setClauses.push('isActive = ?');
      params.push(input.isActive ? 1 : 0);
    }
    if (input.displayName !== undefined) {
      setClauses.push('displayName = ?');
      params.push(input.displayName);
    }

    if (setClauses.length > 0) {
      params.push(userId);
      await this.db.execute(`UPDATE users SET ${setClauses.join(', ')}, updatedAt = NOW(3) WHERE id = ?`, params);
    }

    const [updated] = await this.db.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [userId]);
    return toPublicUser(updated);
  }
}
