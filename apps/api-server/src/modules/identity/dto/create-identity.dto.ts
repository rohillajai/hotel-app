import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateIdentityDto {
  @ApiProperty({ enum: ['GUEST', 'STAFF', 'ADMIN'], example: 'STAFF' })
  @IsEnum(['GUEST', 'STAFF', 'ADMIN'])
  entity_type: 'GUEST' | 'STAFF' | 'ADMIN';

  @ApiProperty({
    example: { full_name: 'Raj Kumar', email: 'raj@hotel.com', department: 'RECEPTION' },
    description: 'Profile data — schema varies by entity_type',
  })
  @IsObject()
  profile: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Room number for guests' })
  @IsOptional()
  @IsString()
  room_number?: string;
}
