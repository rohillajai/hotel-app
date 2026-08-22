import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { BadRequestException, PayloadTooLargeException, NotFoundException } from '@nestjs/common';
import { DocumentsService } from '../documents.service';
import { StorageService } from '../storage.service';
import { PRISMA_TOKEN } from '../../database/database.module';

vi.mock('@hotel-app/config', () => ({
  loadConfig: () => ({
    S3_KYC_BUCKET: 'test-kyc-bucket',
    S3_ASSETS_BUCKET: 'test-assets-bucket',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_SIGNED_URL_EXPIRES_SECONDS: 900,
    AWS_REGION: 'ap-south-1',
    AWS_ACCESS_KEY_ID: 'test',
    AWS_SECRET_ACCESS_KEY: 'test',
  }),
}));

function makeDb() {
  return {
    identityRecord: {
      findUnique: vi.fn(() => Promise.resolve({ id: 'identity-001', tenantId: 'tenant-001' })),
    },
    dataSubjectRecord: {
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'dsr-001', ...args.data, createdAt: new Date() }),
      ),
      findFirst: vi.fn(() =>
        Promise.resolve({
          id: 'dsr-001',
          subjectId: 'identity-001',
          tenantId: 'tenant-001',
          purposeCategory: 'KYC_DOCUMENT',
          dataRef: 'kyc/tenant-001/identity-001/doc.jpg',
          erasedAt: null,
        }),
      ),
      findMany: vi.fn(() => Promise.resolve([])),
    },
    retentionRule: {
      findFirst: vi.fn(() => Promise.resolve({ retentionDays: 365, statutory: true })),
    },
  };
}

function makeStorage() {
  return {
    uploadKycDocument: vi.fn(() => Promise.resolve('kyc/tenant-001/identity-001/uuid.jpg')),
    getKycSignedUrl: vi.fn(() => Promise.resolve('https://s3.example.com/signed-url')),
    deleteKycDocument: vi.fn(() => Promise.resolve()),
  };
}

const validFile = {
  buffer: Buffer.from('fake-jpg-content'),
  mimetype: 'image/jpeg',
  originalname: 'aadhaar.jpg',
  size: 1024,
};

describe('DocumentsService', () => {
  let service: DocumentsService;
  let db: ReturnType<typeof makeDb>;
  let storage: ReturnType<typeof makeStorage>;

  beforeEach(async () => {
    db = makeDb();
    storage = makeStorage();

    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PRISMA_TOKEN, useValue: db },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = module.get(DocumentsService);
    // Force-inject storage service
    (service as unknown as { storageService: typeof storage }).storageService = storage;
  });

  describe('uploadKycDocument()', () => {
    it('uploads file to S3 and creates data_subject_record', async () => {
      const result = await service.uploadKycDocument({
        tenantId: 'tenant-001',
        identityId: 'identity-001',
        file: validFile,
      });

      expect(storage.uploadKycDocument).toHaveBeenCalledOnce();
      expect(db.dataSubjectRecord.create).toHaveBeenCalledOnce();
      const createData = db.dataSubjectRecord.create.mock.calls[0]![0].data;
      expect(createData.purposeCategory).toBe('KYC_DOCUMENT');
      expect(createData.tenantId).toBe('tenant-001');
      expect(createData.subjectId).toBe('identity-001');
      expect(result.id).toBe('dsr-001');
      expect(result.contentType).toBe('image/jpeg');
    });

    it('sets expiresAt based on retention rule', async () => {
      await service.uploadKycDocument({
        tenantId: 'tenant-001',
        identityId: 'identity-001',
        file: validFile,
      });

      const createData = db.dataSubjectRecord.create.mock.calls[0]![0].data;
      const expiresAt = new Date(createData.expiresAt as string);
      const now = new Date();
      const diffDays = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(360);
      expect(diffDays).toBeLessThan(370);
    });

    it('rejects invalid MIME types', async () => {
      await expect(
        service.uploadKycDocument({
          tenantId: 'tenant-001',
          identityId: 'identity-001',
          file: { ...validFile, mimetype: 'text/html' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects files larger than 5 MB', async () => {
      await expect(
        service.uploadKycDocument({
          tenantId: 'tenant-001',
          identityId: 'identity-001',
          file: { ...validFile, size: 6 * 1024 * 1024 },
        }),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
    });

    it('throws NotFoundException when identity does not exist', async () => {
      (db.identityRecord as any).findUnique = vi.fn(() => Promise.resolve(null));

      await expect(
        service.uploadKycDocument({
          tenantId: 'tenant-001',
          identityId: 'nonexistent',
          file: validFile,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getDocumentSignedUrl()', () => {
    it('returns a signed URL and expiry time', async () => {
      const result = await service.getDocumentSignedUrl({
        tenantId: 'tenant-001',
        identityId: 'identity-001',
        documentId: 'dsr-001',
      });

      expect(result.url).toContain('signed-url');
      expect(result.expiresIn).toBe(900);
      expect(storage.getKycSignedUrl).toHaveBeenCalledWith(
        'kyc/tenant-001/identity-001/doc.jpg',
      );
    });

    it('throws NotFoundException when document is erased', async () => {
      (db.dataSubjectRecord as any).findFirst = vi.fn(() => Promise.resolve(null));

      await expect(
        service.getDocumentSignedUrl({
          tenantId: 'tenant-001',
          identityId: 'identity-001',
          documentId: 'dsr-001',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
