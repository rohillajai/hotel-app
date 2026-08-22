import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { DirectoryService } from './directory.service';
import {
  CreateOrgUnitDto,
  CreateDirectoryEntryDto,
  UpdateDirectoryEntryDto,
} from './dto/directory.dto';

@ApiTags('directory')
@ApiBearerAuth()
@Controller({ path: 'directory', version: '1' })
export class DirectoryController {
  constructor(private readonly directoryService: DirectoryService) {}

  // ─── Org Units ─────────────────────────────────────────────────────────────

  @Get('units')
  @ApiOperation({ summary: 'Get org unit tree for tenant' })
  async getTree(@TenantId() tenantId: string) {
    return this.directoryService.getOrgTree(tenantId);
  }

  @Post('units')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create org unit (admin only)' })
  @ApiResponse({ status: 201 })
  async createUnit(
    @Body() dto: CreateOrgUnitDto,
    @TenantId() tenantId: string,
  ) {
    return this.directoryService.createOrgUnit({
      tenantId,
      parentId: dto.parent_id,
      name: dto.name,
      unitType: dto.unit_type,
    });
  }

  // ─── Directory Entries ─────────────────────────────────────────────────────

  @Get('entries')
  @ApiOperation({ summary: 'List all active directory entries for tenant' })
  async listAll(@TenantId() tenantId: string) {
    return this.directoryService.listAll(tenantId);
  }

  @Get('entries/unit/:orgUnitId')
  @ApiOperation({ summary: 'List entries for a specific org unit (department)' })
  async listByUnit(
    @Param('orgUnitId', ParseUUIDPipe) orgUnitId: string,
    @TenantId() tenantId: string,
  ) {
    return this.directoryService.listByOrgUnit(orgUnitId, tenantId);
  }

  @Post('entries')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Add person to directory (admin only)' })
  @ApiResponse({ status: 201 })
  async createEntry(
    @Body() dto: CreateDirectoryEntryDto,
    @TenantId() tenantId: string,
  ) {
    return this.directoryService.createEntry({
      tenantId,
      orgUnitId: dto.org_unit_id,
      identityId: dto.identity_id,
      displayName: dto.display_name,
      designation: dto.designation,
    });
  }

  @Patch('entries/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update directory entry' })
  async updateEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDirectoryEntryDto,
    @TenantId() tenantId: string,
  ) {
    return this.directoryService.updateEntry(id, tenantId, {
      displayName: dto.display_name,
      designation: dto.designation,
      orgUnitId: dto.org_unit_id,
    });
  }

  @Delete('entries/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Deactivate directory entry (soft delete)' })
  async deactivateEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.directoryService.deactivateEntry(id, tenantId);
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  @Get('search')
  @ApiOperation({ summary: 'Search directory by name (Phase 2: also by designation)' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results (default 10)' })
  async search(
    @Query('q') query: string,
    @Query('limit') limit: string | undefined,
    @TenantId() tenantId: string,
  ) {
    return this.directoryService.search(tenantId, query, limit ? parseInt(limit, 10) : 10);
  }
}
