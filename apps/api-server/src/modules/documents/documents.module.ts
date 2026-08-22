import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(), // Keep file in memory for S3 upload — never write to disk
    }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, StorageService],
  exports: [DocumentsService, StorageService],
})
export class DocumentsModule {}
