import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() — marks a route as publicly accessible (no JWT required).
 * Used with JwtAuthGuard.
 *
 * Usage:
 *   @Public()
 *   @Post('auth/guest/otp/send')
 *   sendOtp() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
