import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { AccessController } from './access.controller';
import { GrantExpiryJob } from './grant-expiry.job';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AccessController],
  providers: [AccessService, GrantExpiryJob],
  exports: [AccessService],
})
export class AccessModule {}
