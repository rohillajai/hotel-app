import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ServiceRequestsService } from './service-requests.service';
import {
  CreateServiceRequestDto,
  UpdateServiceRequestStatusDto,
} from './dto/service-request.dto';

@ApiTags('service-requests')
@ApiBearerAuth()
@Controller({ path: 'service-requests', version: '1' })
export class ServiceRequestsController {
  constructor(private readonly svc: ServiceRequestsService) {}

  @Post()
  @Roles('GUEST')
  @ApiOperation({ summary: 'Place a service request (guest)' })
  async create(
    @Body() dto: CreateServiceRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @TenantId() tenantId: string,
  ) {
    return this.svc.create({
      tenantId,
      guestId: user.identityId,
      department: dto.department,
      category: dto.category,
      details: dto.details ?? {},
      roomIdentifier: user.room ?? 'Unknown',
    });
  }

  @Get()
  @ApiOperation({ summary: 'List service requests (guest: own; staff: by department)' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @TenantId() tenantId: string,
    @Query('department') department?: string,
  ) {
    if (user.entityType === 'GUEST') {
      return this.svc.listForGuest(user.identityId);
    }
    // Staff/admin — filter by department
    return this.svc.listForDepartment(tenantId, department ?? '');
  }

  @Patch(':id')
  @Roles('STAFF', 'ADMIN')
  @ApiOperation({ summary: 'Update service request status (staff)' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceRequestStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @TenantId() tenantId: string,
  ) {
    return this.svc.updateStatus(id, tenantId, dto.status, user.identityId);
  }
}
