import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminThrottle } from '../common/decorators/throttle-profiles.decorator';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { parseIsoDate } from '../common/utils/dates';
import { AuditService } from './audit.service';
import { ListAuditQueryDto } from './dto/list-audit-query.dto';

@ApiTags('admin / audit')
@ApiBearerAuth()
@AdminThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.manager)
@Controller('admin/audit-log')
export class AuditAdminController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries with filters' })
  list(@Query() query: ListAuditQueryDto) {
    return this.auditService.list({
      entity: query.entity,
      entityId: query.entityId,
      actorType: query.actorType,
      action: query.action,
      from: query.from ? parseIsoDate(query.from, 'from') : undefined,
      to: query.to
        ? new Date(
            parseIsoDate(query.to, 'to').getTime() + 24 * 60 * 60 * 1000 - 1,
          )
        : undefined,
      limit: query.limit,
    });
  }
}
