import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RevokeGrantDto {
  @ApiProperty({ example: 'EARLY_CHECKOUT', description: 'Reason for revocation' })
  @IsString()
  reason: string;
}

export class RestrictCallingDto {
  @ApiProperty({ example: true, description: 'Set to true to restrict, false to unrestrict' })
  @IsBoolean()
  restricted: boolean;
}
