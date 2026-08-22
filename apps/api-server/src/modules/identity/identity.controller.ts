import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Version,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { IdentityService } from './identity.service';
import { CreateIdentityDto } from './dto/create-identity.dto';
import { SelfRegisterDto } from './dto/self-register.dto';
import {
  ApproveIdentityDto,
  RejectIdentityDto,
  MergeIdentityDto,
} from './dto/approve-identity.dto';

@ApiTags('identities')
@ApiBearerAuth()
@Controller({ path: 'identities', version: '1' })
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  // ─── Path A: Admin/staff creates identity directly (ACTIVE) ────────────────

  @Post()
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Create identity record (admin-initiated, Path A)' })
  @ApiResponse({ status: 201, description: 'Identity created and activated' })
  @ApiResponse({ status: 409, description: 'Duplicate identity found' })
  async create(
    @Body() dto: CreateIdentityDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.identityService.createIdentity({
      tenantId,
      entityType: dto.entity_type,
      profile: {
        ...dto.profile,
        ...(dto.room_number ? { room_number: dto.room_number } : {}),
      },
      createdById: user.identityId,
      registrationPath: 'A',
    });
  }

  // ─── Path B: Guest self-registration (PENDING) ─────────────────────────────

  @Post('self-register')
  @ApiOperation({ summary: 'Guest self-registration (Path B) — creates PENDING record' })
  @ApiResponse({ status: 201, description: 'Self-registration submitted' })
  @ApiResponse({ status: 409, description: 'Duplicate identity found' })
  async selfRegister(
    @Body() dto: SelfRegisterDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const profile: Record<string, unknown> = {
      ...(await this.getExistingProfile(user.identityId)),
      booking_ref: dto.booking_ref,
      full_name: dto.full_name,
      ...(dto.room_number ? { room_number: dto.room_number } : {}),
    };

    return this.identityService.selfRegister(tenantId, user.identityId, profile);
  }

  // ─── Get single identity ───────────────────────────────────────────────────

  @Get(':id')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Get identity record by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.identityService.findByIdOrFail(id);
  }

  // ─── Approve ───────────────────────────────────────────────────────────────

  @Patch(':id/approve')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Approve a PENDING identity (check-in confirmation)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Not in PENDING status' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveIdentityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.identityService.approve(id, {
      checkInDt: new Date(dto.check_in_dt),
      checkOutDt: new Date(dto.check_out_dt),
      roomNumber: dto.room_number,
      approvedById: user.identityId,
    });
  }

  // ─── Reject ────────────────────────────────────────────────────────────────

  @Patch(':id/reject')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Reject a PENDING identity' })
  @ApiResponse({ status: 200 })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectIdentityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.identityService.reject(id, dto.reason, user.identityId);
  }

  // ─── Merge ─────────────────────────────────────────────────────────────────

  @Patch(':id/merge')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Merge a duplicate into an existing record' })
  @ApiResponse({ status: 200 })
  async merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeIdentityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.identityService.merge(id, dto.target_id, user.identityId);
  }

  // ─── List pending ──────────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'List pending identity records for the tenant' })
  @ApiResponse({ status: 200 })
  async listPending(@TenantId() tenantId: string) {
    return this.identityService.listPending(tenantId);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async getExistingProfile(identityId: string): Promise<Record<string, unknown>> {
    const record = await this.identityService.findById(identityId);
    return (record?.profile as Record<string, unknown>) ?? {};
  }
}
