import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import * as crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import type { AuthResponse, JwtClaims, User } from "@whatsapp-crm/shared-types";
import { DatabaseService } from "../database/database.service";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BCRYPT_ROUNDS = 10;

interface UserRow extends RowDataPacket {
  id: string;
  tenantId: string | null;
  email: string;
  passwordHash: string;
  role: string;
  displayName: string;
  isActive: number; // MySQL tinyint(1)
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RefreshTokenRow extends RowDataPacket {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

function toPublicUser(user: UserRow): User {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role as User["role"],
    displayName: user.displayName,
    isActive: !!user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * BOOTSTRAP ESCAPE HATCH (POST /auth/register):
   * Creates the very first user in a fresh deployment, WITHOUT
   * authentication, but ONLY when zero users exist in the whole database.
   * The created user is always forced to role=super_admin, tenantId=null.
   * Once at least one user exists anywhere, this throws — all further user
   * creation goes through POST /tenants (creates tenant_admin) or
   * POST /users (tenant_admin creates agent), both of which require auth.
   */
  async registerFirstSuperAdmin(params: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<AuthResponse> {
    const [{ count }] = await this.db.query<(RowDataPacket & { count: number })[]>(
      "SELECT COUNT(*) as count FROM users",
    );
    if (count > 0) {
      throw new ForbiddenException(
        "Bootstrap registration is only available when no users exist yet. " +
          "Ask an existing super_admin to create your account.",
      );
    }

    const existingRows = await this.db.query<UserRow[]>(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [params.email],
    );
    if (existingRows.length > 0) {
      throw new ConflictException("Email already in use");
    }

    const passwordHash = await bcrypt.hash(params.password, BCRYPT_ROUNDS);
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO users (id, tenantId, email, passwordHash, role, displayName, isActive, createdAt, updatedAt)
       VALUES (?, NULL, ?, ?, 'super_admin', ?, 1, NOW(3), NOW(3))`,
      [id, params.email, passwordHash, params.displayName],
    );

    const [user] = await this.db.query<UserRow[]>("SELECT * FROM users WHERE id = ?", [id]);
    return this.issueTokens(user);
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const rows = await this.db.query<UserRow[]>(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    const user = rows[0];
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.db.execute("UPDATE users SET lastLoginAt = NOW(3) WHERE id = ?", [user.id]);

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.db.query<RefreshTokenRow[]>(
      "SELECT * FROM refresh_tokens WHERE tokenHash = ? LIMIT 1",
      [tokenHash],
    );
    const record = stored[0];

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const userRows = await this.db.query<UserRow[]>("SELECT * FROM users WHERE id = ?", [record.userId]);
    const user = userRows[0];
    if (!user) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // Rotate: revoke the old token, issue a brand new access + refresh pair.
    await this.db.execute("UPDATE refresh_tokens SET revokedAt = NOW(3) WHERE id = ?", [record.id]);

    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.db.execute(
      "UPDATE refresh_tokens SET revokedAt = NOW(3) WHERE tokenHash = ? AND revokedAt IS NULL",
      [tokenHash],
    );
  }

  private async issueTokens(user: UserRow): Promise<AuthResponse> {
    const claims: JwtClaims = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role as JwtClaims["role"],
      email: user.email,
    };

    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.get<string>("JWT_ACCESS_SECRET"),
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const refreshToken = crypto.randomBytes(48).toString("hex");
    const tokenHash = hashToken(refreshToken);
    await this.db.execute(
      `INSERT INTO refresh_tokens (id, userId, tokenHash, expiresAt, createdAt)
       VALUES (?, ?, ?, ?, NOW(3))`,
      [randomUUID(), user.id, tokenHash, new Date(Date.now() + REFRESH_TOKEN_TTL_MS)],
    );

    return {
      accessToken,
      refreshToken,
      user: toPublicUser(user),
    };
  }
}
