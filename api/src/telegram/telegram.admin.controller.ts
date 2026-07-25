import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminThrottle } from '../common/decorators/throttle-profiles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { RequestUser } from '../common/types/request-user';
import { CreateTelegramInviteDto } from './dto/create-telegram-invite.dto';
import { UpdateTelegramRecipientDto } from './dto/update-telegram-recipient.dto';
import { TelegramInvitesService } from './telegram-invites.service';
import { TelegramRecipientsService } from './telegram-recipients.service';

@ApiTags('admin / telegram')
@ApiBearerAuth()
@AdminThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@Controller('admin/telegram')
export class TelegramAdminController {
  constructor(
    private readonly recipients: TelegramRecipientsService,
    private readonly invites: TelegramInvitesService,
  ) {}

  @Get('recipients')
  @ApiOperation({ summary: 'List Telegram notification recipients' })
  listRecipients() {
    return this.recipients.list();
  }

  @Patch('recipients/:id')
  @ApiOperation({ summary: 'Update recipient (name / role / active)' })
  updateRecipient(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTelegramRecipientDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.recipients.update(id, dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Delete('recipients/:id')
  @ApiOperation({ summary: 'Delete recipient' })
  deleteRecipient(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.recipients.remove(id, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Get('invites')
  @ApiOperation({ summary: 'List Telegram invites' })
  @ApiQuery({ name: 'pending', required: false, type: Boolean })
  listInvites(@Query('pending') pending?: string) {
    const pendingOnly =
      pending === '1' || pending === 'true' || pending === 'yes';
    return this.invites.list(pendingOnly);
  }

  @Post('invites')
  @ApiOperation({ summary: 'Generate one-time invite code' })
  createInvite(
    @Body() dto: CreateTelegramInviteDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invites.create(dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Delete('invites/:id')
  @ApiOperation({ summary: 'Revoke unused invite' })
  revokeInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invites.revoke(id, {
      type: ActorType.admin,
      id: user.id,
    });
  }
}
