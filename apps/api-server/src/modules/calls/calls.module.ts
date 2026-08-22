import { Module } from '@nestjs/common';
import { CallsService } from './calls.service';
import { CallsController, InternalCallLogsController } from './calls.controller';

@Module({
  controllers: [CallsController, InternalCallLogsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
