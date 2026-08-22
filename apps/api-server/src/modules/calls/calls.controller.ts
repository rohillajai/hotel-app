import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { loadConfig } from '@hotel-app/config';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CallsService } from './calls.service';

const config = loadConfig();

/**
 * Internal call-log endpoint — called by the signaling server.
 * Protected by X-Internal-Secret header (not JWT — server-to-server).
 */
@ApiTags('calls')
@Controller({ path: 'internal/call-logs', version: '1' })
export class InternalCallLogsController {
  constructor(private readonly callsService: CallsService) {}

  @Public() // No JWT — uses shared secret instead
  @Post()
  @ApiOperation({ summary: 'Log call metadata (internal — signaling server only)' })
  async createLog(
    @Body() body: Record<string, unknown>,
    @Headers('x-internal-secret') secret: string,
  ) {
    if (config.SIGNALING_INTERNAL_SECRET && secret !== config.SIGNALING_INTERNAL_SECRET) {
      throw new ForbiddenException('Invalid internal secret.');
    }

    return this.callsService.createLog({
      tenantId: body['tenant_id'] as string,
      callerId: body['caller_id'] as string,
      calleeDept: (body['callee_dept'] as string) ?? null,
      calleeId: (body['callee_id'] as string) ?? null,
      roomIdentifier: (body['room_identifier'] as string) ?? null,
      callId: body['call_id'] as string,
      initiatedAt: new Date(body['initiated_at'] as string),
      answeredAt: body['answered_at'] ? new Date(body['answered_at'] as string) : null,
      endedAt: body['ended_at'] ? new Date(body['ended_at'] as string) : null,
      durationSecs: (body['duration_secs'] as number) ?? null,
      outcome: (body['outcome'] as 'ANSWERED' | 'MISSED' | 'REJECTED' | 'FAILED') ?? null,
      turnRelayed: (body['turn_relayed'] as boolean) ?? false,
    });
  }
}

/**
 * Public-facing call log endpoint for admin — requires JWT + ADMIN role.
 */
@ApiTags('calls')
@ApiBearerAuth()
@Controller({ path: 'calls', version: '1' })
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get()
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'List call metadata logs (admin/staff)' })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'room', required: false })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @TenantId() tenantId: string,
    @Query('department') department?: string,
    @Query('room') room?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.callsService.listByTenant(
      tenantId,
      {
        department: department || undefined,
        roomIdentifier: room || undefined,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
      },
      cursor || undefined,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
