import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersRepository } from '../../users/users.repository';
import type { RequestUser } from '../../common/types/request-user';

type AccessPayload = {
  sub: string;
  email: string;
  role: RequestUser['role'];
};

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersRepository: UsersRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: AccessPayload): Promise<RequestUser> {
    const user = await this.usersRepository.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or inactive user');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };
  }
}
