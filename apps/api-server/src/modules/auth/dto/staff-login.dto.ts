import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StaffLoginDto {
  @ApiProperty({ example: 'reception@grandpilot.hotel' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Staff@123' })
  @IsString()
  @MinLength(6)
  password: string;
}
