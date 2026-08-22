import { IsString, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'mobile must be a valid E.164 phone number',
  })
  mobile: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'otp must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'otp must be 6 digits' })
  otp: string;
}
