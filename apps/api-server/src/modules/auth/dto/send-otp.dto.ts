import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({ example: '+919876543210', description: 'E.164 format mobile number' })
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'mobile must be a valid E.164 phone number (e.g. +919876543210)',
  })
  mobile: string;
}
