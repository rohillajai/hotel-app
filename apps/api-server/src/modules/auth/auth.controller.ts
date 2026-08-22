import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from './auth.types';
import { GuestAuthService } from './guest-auth.service';
import { StaffAuthService } from './staff-auth.service';
import { TokenService } from './token.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { StaffLoginDto } from './dto/staff-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly guestAuthService: GuestAuthService,
    private readonly staffAuthService: StaffAuthService,
    private readonly tokenService: TokenService,
  ) {}

  // ── Guest OTP ──────────────────────────────────────────────────────────────

  @Public()
  @Post('guest/otp/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to guest mobile number' })
  @ApiResponse({ status: 200, description: 'OTP sent (or bypassed in dev)' })
  @ApiResponse({ status: 429, description: 'Too many OTP requests' })
  async sendOtp(@Body() dto: SendOtpDto) {
    await this.guestAuthService.sendOtp(dto.mobile);
    return { message: 'OTP sent. Valid for 10 minutes.' };
  }

  @Public()
  @Post('guest/otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and issue tokens' })
  @ApiResponse({ status: 200, description: 'Tokens issued' })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    const result = await this.guestAuthService.verifyOtp(dto.mobile, dto.otp, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    return result;
  }

  // ── Staff / Admin login ────────────────────────────────────────────────────

  @Public()
  @Post('staff/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff / admin email + password login' })
  @ApiResponse({ status: 200, description: 'Tokens issued' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async staffLogin(@Body() dto: StaffLoginDto, @Req() req: Request) {
    return this.staffAuthService.login(dto.email, dto.password, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
  }

  // ── Token refresh ──────────────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  @ApiResponse({ status: 200, description: 'New token pair issued' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.tokenService.refreshAccessToken(dto.refresh_token, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke current refresh token (logout)' })
  async logout(
    @Body() dto: RefreshTokenDto,
    @CurrentUser() _user: AuthenticatedUser,
  ) {
    await this.tokenService.revokeToken(dto.refresh_token);
    return { message: 'Logged out successfully.' };
  }
}
