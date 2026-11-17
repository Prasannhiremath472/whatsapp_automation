import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ANALYTICS_RANGES, type AnalyticsOverview, type AnalyticsRange } from '@whatsapp-crm/shared-types';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@Roles('tenant_admin', 'agent')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(@TenantId() tenantId: string, @Query('range') range = '7d'): Promise<AnalyticsOverview> {
    if (!(ANALYTICS_RANGES as readonly string[]).includes(range)) {
      throw new BadRequestException(`range must be one of ${ANALYTICS_RANGES.join(', ')}`);
    }
    return this.analytics.overview(tenantId, range as AnalyticsRange);
  }
}
