import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { loadConfig } from '@hotel-app/config';

/**
 * StorageService — S3 (or MinIO in dev) abstraction for document storage.
 *
 * Two buckets by design (REQ-RET-04):
 *   - KYC bucket: government-issued IDs, separate retention timer
 *   - Assets bucket: general docs, avatars, etc.
 *
 * All uploads are private — no public access. Reading requires a signed URL.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly config = loadConfig();

  constructor() {
    this.s3 = new S3Client({
      region: this.config.AWS_REGION,
      ...(this.config.S3_ENDPOINT
        ? {
            endpoint: this.config.S3_ENDPOINT,
            forcePathStyle: true, // required for MinIO
          }
        : {}),
      ...(this.config.AWS_ACCESS_KEY_ID && this.config.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: this.config.AWS_ACCESS_KEY_ID,
              secretAccessKey: this.config.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }

  /**
   * Upload a document to the KYC bucket.
   * Returns the S3 key (not a URL — never expose direct S3 access).
   */
  async uploadKycDocument(params: {
    tenantId: string;
    identityId: string;
    fileKey: string; // e.g. 'uuid.jpg'
    body: Buffer;
    contentType: string;
  }): Promise<string> {
    const key = `kyc/${params.tenantId}/${params.identityId}/${params.fileKey}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.S3_KYC_BUCKET,
        Key: key,
        Body: params.body,
        ContentType: params.contentType,
        ServerSideEncryption: 'AES256',
        Metadata: {
          'tenant-id': params.tenantId,
          'identity-id': params.identityId,
        },
      }),
    );

    this.logger.log(`KYC document uploaded: ${key}`);
    return key;
  }

  /**
   * Generate a short-lived signed URL for reading a KYC document.
   * Configured expiry: S3_SIGNED_URL_EXPIRES_SECONDS (default 15 min).
   * Only staff/admin should call this — guest never gets a signed URL to their own ID doc.
   */
  async getKycSignedUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.S3_KYC_BUCKET,
      Key: key,
    });

    return getSignedUrl(this.s3, command, {
      expiresIn: this.config.S3_SIGNED_URL_EXPIRES_SECONDS,
    });
  }

  /**
   * Delete a document from the KYC bucket.
   * Called by the erasure job when retention expires.
   */
  async deleteKycDocument(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.config.S3_KYC_BUCKET,
        Key: key,
      }),
    );
    this.logger.log(`KYC document deleted: ${key}`);
  }
}
