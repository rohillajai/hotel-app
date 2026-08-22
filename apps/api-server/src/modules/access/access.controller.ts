import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessService } from './access.service';
import { RevokeGrantDto, RestrictCallingDto } from './dto/revoke-grant.dto';

@ApiTags('grants')
@ApiBearerAuth()
@Controller({ path: 'grants', version: '1' })
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  @Get(':id')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Get grant details' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getGrant(@Param('id', ParseUUIDPipe) id: string) {
    const grant = await this.accessService.getActiveGrant(id);
    if (!grant) {
      // Try finding by grantId directly (the param may be grantId not subjectId)
      return this.accessService.getActiveGrant(id);
    }
    return grant;
  }

  @Patch(':id/revoke')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Revoke grant (immediate checkout)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Already revoked' })
  async revokeGrant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeGrantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accessService.revokeGrant(id, dto.reason, user.identityId);
  }

  @Patch(':id/restrict-calling')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Restrict or unrestrict calling for a grant subject' })
  @ApiResponse({ status: 200 })
  async restrictCalling(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RestrictCallingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // id here is the subjectId (guest identity)
    await this.accessService.restrictCalling(id, dto.restricted, user.identityId);
    return { message: dto.restricted ? 'Calling restricted.' : 'Calling unrestricted.' };
  }

  @Get('subject/:subjectId')
  @Roles('ADMIN', 'STAFF', 'GUEST')
  @ApiOperation({ summary: 'Get active grant for a subject (guest can get own)' })
  @ApiResponse({ status: 200 })
  async getActiveGrant(
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Guests can only get their own grant
    const effectiveSubject =
      user.entityType === 'GUEST' ? user.identityId : subjectId;
    return this.accessService.getActiveGrant(effectiveSubject);
  }
}
