import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { loadConfig } from '@hotel-app/config';
import type { JwtPayload } from '../auth.types';
import { TokenService } from '../token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly tokenService: TokenService) {
    const config = loadConfig();
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.JWT_SECRET,
    });
  }

  /**
   * Called after the JWT signature is verified.
   * The return value is attached to request.user.
   */
  validate(payload: JwtPayload) {
    if (!payload.sub || !payload.tenant_id || !payload.entity_type) {
      throw new UnauthorizedException('Malformed token payload.');
    }
    return this.tokenService.payloadToUser(payload);
  }
}
