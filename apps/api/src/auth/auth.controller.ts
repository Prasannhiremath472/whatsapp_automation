import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthResponse } from '@whatsapp-crm/shared-types';
import { LoginRequestSchema, RegisterRequestSchema } from '@whatsapp-crm/shared-types';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtClaims } from '@whatsapp-crm/shared-types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Bootstrap-only escape hatch: creates the first super_admin when the DB
   * has zero users. Marked @Public() because it must be reachable with no
   * JWT at all. AuthService.registerFirstSuperAdmin throws
   * ForbiddenException once any user already exists — this is NOT a
   * general-purpose "create any user" endpoint. Further users are created
   * via POST /tenants (tenant_admin, super_admin-only) and POST /users
   * (agent, tenant_admin-only), both under auth guards.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: unknown): Promise<AuthResponse> {
    const parsed = RegisterRequestSchema.parse(body);
    return this.authService.registerFirstSuperAdmin(parsed);
  }

  @Get('me')
  me(@CurrentUser() claims: JwtClaims) {
    return this.authService.getProfile(claims.sub);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown): Promise<AuthResponse> {
    const parsed = LoginRequestSchema.parse(body);
    return this.authService.login(parsed.email, parsed.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string): Promise<AuthResponse> {
    return this.authService.refresh(refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body('refreshToken') refreshToken: string): Promise<void> {
    await this.authService.logout(refreshToken);
  }
}
