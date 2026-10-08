import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { CreateUserRequest, UpdateUserRequest, User } from "@whatsapp-crm/shared-types";
import { CreateUserRequestSchema, UpdateUserRequestSchema } from "@whatsapp-crm/shared-types";
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

  @Roles("tenant_admin")
  @Patch(":id")
  update(
    @CurrentTenant() tenantId: string | null,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<User> {
    if (!tenantId) {
      throw new ForbiddenException("This account is not associated with a tenant");
    }
    const parsed: UpdateUserRequest = UpdateUserRequestSchema.parse(body);
    return this.usersService.updateInTenant(tenantId, id, parsed);
  }
}
