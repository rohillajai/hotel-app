import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateServiceRequestDto {
  @ApiProperty({ enum: ['HOUSEKEEPING', 'ROOM_SERVICE'] })
  @IsEnum(['HOUSEKEEPING', 'ROOM_SERVICE'])
  department: string;

  @ApiProperty({ enum: ['LAUNDRY', 'FOOD_ORDER', 'CLEANING', 'TOWELS', 'AMENITIES'] })
  @IsString()
  category: string;

  @ApiPropertyOptional({ example: { items: ['Extra towels', 'Pillows'] } })
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

export class UpdateServiceRequestStatusDto {
  @ApiProperty({ enum: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] })
  @IsEnum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}
