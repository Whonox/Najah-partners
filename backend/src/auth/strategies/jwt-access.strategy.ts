import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedActor, JwtPayload } from '../auth.types';

/**
 * Vérifie l'access token porté par l'en-tête `Authorization: Bearer <token>`.
 * Le refresh token, lui, ne passe jamais par ici (cookie httpOnly, route dédiée).
 */
@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthenticatedActor {
    return {
      id: payload.sub,
      actorType: payload.actorType,
      role: payload.role,
    };
  }
}
