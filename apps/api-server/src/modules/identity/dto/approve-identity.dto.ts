import { IsISO8601, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveIdentityDto {
  @ApiProperty({ example: '2026-08-22T14:00:00Z', description: 'Check-in datetime' })
  @IsISO8601()
  check_in_dt: string;

  @ApiProperty({ example: '2026-08-24T11:00:00Z', description: 'Check-out datetime' })
  @IsISO8601()
  check_out_dt: string;

  @ApiPropertyOptional({ example: '201', description: 'Room number override' })
  @IsOptional()
  @IsString()
  room_number?: string;
}

export class RejectIdentityDto {
  @ApiProperty({ example: 'Duplicate booking reference', description: 'Reason for rejection' })
  @IsString()
  reason: string;
}

export class MergeIdentityDto {
  @ApiProperty({ description: 'ID of the canonical (existing) record to merge into' })
  @IsString()
  target_id: string;
}
