import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import {
  SNSClient,
  PublishCommand,
  type PublishCommandInput,
} from '@aws-sdk/client-sns';
import { loadConfig } from '@hotel-app/config';
import type { SnsPublisher } from '@hotel-app/core';

import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantContext } from '../../common/decorators/tenant-context';
import { AuthController } from './auth.controller';
import { GuestAuthService } from './guest-auth.service';
import { StaffAuthService } from './staff-auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

const config = loadConfig();

/** Build an SnsPublisher that wraps the real @aws-sdk/client-sns client */
function createSnsPublisher(): SnsPublisher {
  const client = new SNSClient({
    region: config.AWS_REGION,
    ...(config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: config.AWS_ACCESS_KEY_ID,
            secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });

  return {
    async publish(params: PublishCommandInput) {
      const result = await client.send(new PublishCommand(params));
      return { MessageId: result.MessageId };
    },
  };
}

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: config.JWT_SECRET,
      signOptions: { expiresIn: config.JWT_ACCESS_EXPIRES_IN },
    }),
  ],
  controllers: [AuthController],
  providers: [
    // Infrastructure
    JwtStrategy,
    { provide: 'SNS_PUBLISHER', useValue: createSnsPublisher() },

    // Services
    TokenService,
    OtpService,
    GuestAuthService,
    StaffAuthService,

    // Request-scoped tenant context
    TenantContext,

    // Global guards (applied to all routes in this app)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
  exports: [JwtModule, TokenService, TenantContext],
})
export class AuthModule {}
