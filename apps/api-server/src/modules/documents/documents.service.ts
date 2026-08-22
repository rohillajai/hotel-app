import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@hotel-app/db';
import { PRISMA_TOKEN } from '../database/database.module';
import { StorageService } from './storage.service';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB (REQ-CI-02)

export interface UploadedDocument {
  id: string;
  s3Key: string;
  identityId: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(PRISMA_TOKEN) private readonly db: PrismaClient,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Upload an ID document for KYC purposes.
   *
   * Steps:
   *   1. Validate MIME type and size
   *   2. Upload to S3 KYC bucket (encrypted at rest)
   *   3. Create data_subject_records row with purpose KYC_DOCUMENT
   *      and expires_at = NOW + retention_rule.retention_days
   *   4. Return the upload metadata (never the S3 key to the guest)
   */
  async uploadKycDocument(params: {
    tenantId: string;
    identityId: string;
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number };
  }): Promise<UploadedDocument> {
    const { file, tenantId, identityId } = params;

    // Validate
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type '${file.mimetype}'. Allowed: JPEG, PNG, PDF.`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new PayloadTooLargeException(
        `File size ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the 5 MB limit.`,
      );
    }

    // Verify identity exists
    const identity = await this.db.identityRecord.findUnique({
      where: { id: identityId },
      select: { id: true, tenantId: true },
    });
    if (!identity || identity.tenantId !== tenantId) {
      throw new NotFoundException('Identity record not found.');
    }

    // Determine file extension
    const ext = this.getExtension(file.mimetype);
    const fileKey = `${randomUUID()}.${ext}`;

    // Upload to S3
    const s3Key = await this.storageService.uploadKycDocument({
      tenantId,
      identityId,
      fileKey,
      body: file.buffer,
      contentType: file.mimetype,
    });

    // Look up retention rule for KYC_DOCUMENT
    const retentionDays = await this.getRetentionDays(tenantId, 'KYC_DOCUMENT');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);

    // Create data_subject_records entry
    const dsr = await this.db.dataSubjectRecord.create({
      data: {
        tenantId,
        subjectId: identityId,
        purposeCategory: 'KYC_DOCUMENT',
        dataRef: s3Key,
        expiresAt,
        erasureBlocked: false,
      },
    });

    this.logger.log(`KYC doc uploaded: identity=${identityId}, dsr=${dsr.id}, key=${s3Key}`);

    return {
      id: dsr.id,
      s3Key,
      identityId,
      contentType: file.mimetype,
      sizeBytes: file.size,
      createdAt: dsr.createdAt,
    };
  }

  /**
   * Get a signed URL for a KYC document.
   * Only staff/admin should call this (enforced by controller-level @Roles).
   */
  async getDocumentSignedUrl(params: {
    tenantId: string;
    identityId: string;
    documentId: string;
  }): Promise<{ url: string; expiresIn: number }> {
    const dsr = await this.db.dataSubjectRecord.findFirst({
      where: {
        id: params.documentId,
        subjectId: params.identityId,
        tenantId: params.tenantId,
        purposeCategory: 'KYC_DOCUMENT',
        erasedAt: null,
      },
    });

    if (!dsr) {
      throw new NotFoundException('Document not found or has been erased.');
    }

    const url = await this.storageService.getKycSignedUrl(dsr.dataRef);
    return { url, expiresIn: 900 }; // 15 min
  }

  /**
   * List all KYC documents for an identity (metadata only — no signed URLs).
   */
  async listDocuments(tenantId: string, identityId: string) {
    return this.db.dataSubjectRecord.findMany({
      where: {
        tenantId,
        subjectId: identityId,
        purposeCategory: 'KYC_DOCUMENT',
        erasedAt: null,
      },
      select: {
        id: true,
        dataRef: true,
        expiresAt: true,
        erasureBlocked: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private getExtension(mimetype: string): string {
    switch (mimetype) {
      case 'image/jpeg': return 'jpg';
      case 'image/png': return 'png';
      case 'application/pdf': return 'pdf';
      default: return 'bin';
    }
  }

  private async getRetentionDays(
    tenantId: string,
    category: 'KYC_DOCUMENT' | 'BOOKING_PROFILE' | 'CALL_METADATA' | 'SERVICE_REQUEST',
  ): Promise<number> {
    // Tenant-specific rule first, then platform default
    const rule = await this.db.retentionRule.findFirst({
      where: {
        purposeCategory: category,
        OR: [{ tenantId }, { tenantId: null }],
      },
      orderBy: { tenantId: 'desc' }, // prefer tenant-specific (non-null) over platform default
    });
    return rule?.retentionDays ?? 365; // fallback to 1 year if no rule configured
  }
}
