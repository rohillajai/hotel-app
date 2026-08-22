import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrgUnitDto {
  @ApiProperty({ example: 'Reception' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ['ORGANIZATION', 'DEPARTMENT', 'TEAM', 'DIVISION'] })
  @IsEnum(['ORGANIZATION', 'DEPARTMENT', 'TEAM', 'DIVISION'])
  unit_type: 'ORGANIZATION' | 'DEPARTMENT' | 'TEAM' | 'DIVISION';

  @ApiPropertyOptional({ description: 'Parent org unit ID (null = root)' })
  @IsOptional()
  @IsUUID()
  parent_id?: string;
}

export class CreateDirectoryEntryDto {
  @ApiProperty()
  @IsUUID()
  org_unit_id: string;

  @ApiProperty()
  @IsUUID()
  identity_id: string;

  @ApiProperty({ example: 'Raj Kumar' })
  @IsString()
  display_name: string;

  @ApiPropertyOptional({ example: 'Front Desk Officer' })
  @IsOptional()
  @IsString()
  designation?: string;
}

export class UpdateDirectoryEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  display_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  org_unit_id?: string;
}
