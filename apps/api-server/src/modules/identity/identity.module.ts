import { Module, forwardRef } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { AccessModule } from '../access/access.module';

@Module({
  imports: [forwardRef(() => AccessModule)],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
