import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import type { CreateUserRequest, UpdateUserRequest, User } from "@whatsapp-crm/shared-types";
import {
  ChangePasswordRequestSchema,
  CreateUserRequestSchema,
  ResetPasswordRequestSchema,
  UpdateMyProfileRequestSchema,
  UpdateUserRequestSchema,
} from "@whatsapp-crm/shared-types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { JwtClaims } from "@whatsapp-crm/shared-types";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * tenantId comes ONLY from @CurrentTenant() (the caller's JWT), never
   * from the request body — see UsersService.createInTenant() for why.
   */
  @Roles("tenant_admin")
  @Post()
  create(@CurrentTenant() tenantId: string | null, @Body() body: unknown): Promise<User> {
    if (!tenantId) {
      throw new ForbiddenException("This account is not associated with a tenant");
    }
    const parsed: CreateUserRequest = CreateUserRequestSchema.parse(body);
    return this.usersService.createInTenant(tenantId, parsed);
  }

  @Roles("tenant_admin", "agent")
  @Get()
  findAll(@CurrentTenant() tenantId: string | null): Promise<User[]> {
    if (!tenantId) {
      throw new ForbiddenException("This account is not associated with a tenant");
    }
    return this.usersService.listInTenant(tenantId);
  }

  /** The signed-in user edits their own profile. Declared before ":id" so "me" is not read as an id. */
  @Roles("tenant_admin", "agent")
  @Patch("me")
  updateMe(@CurrentUser() claims: JwtClaims, @Body() body: unknown): Promise<User> {
    return this.usersService.updateMyProfile(claims.sub, UpdateMyProfileRequestSchema.parse(body));
  }

  @Roles("tenant_admin", "agent")
  @Post("me/password")
  @HttpCode(204)
  async changeMyPassword(@CurrentUser() claims: JwtClaims, @Body() body: unknown): Promise<void> {
    await this.usersService.changeMyPassword(claims.sub, ChangePasswordRequestSchema.parse(body));
  }

  @Roles("tenant_admin")
  @Patch(":id")
  update(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() claims: JwtClaims,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<User> {
    if (!tenantId) {
      throw new ForbiddenException("This account is not associated with a tenant");
    }
    const parsed: UpdateUserRequest = UpdateUserRequestSchema.parse(body);
    return this.usersService.updateInTenant(tenantId, id, parsed, claims.sub);
  }

  @Roles("tenant_admin")
  @Post(":id/reset-password")
  @HttpCode(204)
  async resetPassword(
    @CurrentTenant() tenantId: string | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<void> {
    if (!tenantId) {
      throw new ForbiddenException("This account is not associated with a tenant");
    }
    await this.usersService.resetPasswordInTenant(tenantId, id, ResetPasswordRequestSchema.parse(body).newPassword);
  }
}
