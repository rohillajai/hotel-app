import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  Version,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@ApiBearerAuth()
@Controller({ path: 'identities/:identityId/documents', version: '1' })
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // ─── Upload KYC document ───────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Upload ID document for KYC (JPEG/PNG/PDF, max 5 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Document uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type' })
  @ApiResponse({ status: 413, description: 'File too large (>5 MB)' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB hard limit at multer level
    }),
  )
  async upload(
    @Param('identityId', ParseUUIDPipe) identityId: string,
    @UploadedFile() file: Express.Multer.File,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Guests can upload their own docs; staff/admin can upload for any identity
    const effectiveIdentityId =
      user.entityType === 'GUEST' ? user.identityId : identityId;

    return this.documentsService.uploadKycDocument({
      tenantId,
      identityId: effectiveIdentityId,
      file: {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
      },
    });
  }

  // ─── Get signed URL for a specific document ────────────────────────────────

  @Get(':docId/url')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Get short-lived signed URL for a KYC document (staff/admin only)' })
  @ApiResponse({ status: 200, description: 'Signed URL (expires in 15 min)' })
  @ApiResponse({ status: 404, description: 'Document not found or erased' })
  async getSignedUrl(
    @Param('identityId', ParseUUIDPipe) identityId: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @TenantId() tenantId: string,
  ) {
    return this.documentsService.getDocumentSignedUrl({
      tenantId,
      identityId,
      documentId: docId,
    });
  }

  // ─── List documents for an identity ────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'List KYC documents for an identity (metadata only)' })
  @ApiResponse({ status: 200 })
  async list(
    @Param('identityId', ParseUUIDPipe) identityId: string,
    @TenantId() tenantId: string,
  ) {
    return this.documentsService.listDocuments(tenantId, identityId);
  }
}
