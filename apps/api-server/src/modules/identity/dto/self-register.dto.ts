import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SelfRegisterDto {
  @ApiProperty({ example: 'BK-20260822-001', description: 'Booking reference ID' })
  @IsString()
  @IsNotEmpty()
  booking_ref: string;

  @ApiProperty({ example: 'Raj Kumar', description: 'Guest full name' })
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @ApiPropertyOptional({ example: '201', description: 'Room number (if known)' })
  @IsOptional()
  @IsString()
  room_number?: string;
}
