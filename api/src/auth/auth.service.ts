import { createHmac, randomBytes } from 'node:crypto';
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { ActorType, User, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { UsersRepository } from '../users/users.repository';
import { RefreshTokensRepository } from './refresh-tokens.repository';

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
};

export type AuthUserView = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

@Injectable()
export class AuthService {
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;
  private readonly accessExpiresSeconds: number;

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {
    this.accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES', '15m');
    this.refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES', '7d');
    this.accessExpiresSeconds = this.parseDurationToSeconds(this.accessExpiresIn);
  }

  async login(email: string, password: string): Promise<{
    user: AuthUserView;
    tokens: AuthTokens;
  }> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.usersRepository.findByEmail(normalizedEmail);
    if (!user || !user.isActive) {
      await this.audit.write({
        actor: { type: ActorType.system },
        entity: 'auth',
        entityId: normalizedEmail,
        action: 'login_failed',
        diff: { reason: 'unknown_or_inactive' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      await this.audit.write({
        actor: { type: ActorType.system },
        entity: 'auth',
        entityId: user.id,
        action: 'login_failed',
        diff: { reason: 'bad_password', email: normalizedEmail },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const { tokens } = await this.issueTokenPair(user);
    await this.audit.write({
      actor: { type: ActorType.admin, id: user.id },
      entity: 'auth',
      entityId: user.id,
      action: 'login',
      diff: { email: user.email },
    });
    return { user: this.toUserView(user), tokens };
  }

  async refresh(rawRefreshToken: string): Promise<{ tokens: AuthTokens }> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokensRepository.findByHash(tokenHash);

    if (!stored || stored.revokedAt || stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('Invalid or inactive user');
    }

    const { tokens, refreshTokenId } = await this.issueTokenPair(stored.user);
    await this.refreshTokensRepository.revoke(stored.id, refreshTokenId);

    return { tokens };
  }

  async logout(rawRefreshToken: string): Promise<{ success: true }> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokensRepository.findByHash(tokenHash);
    if (stored && !stored.revokedAt) {
      await this.refreshTokensRepository.revoke(stored.id, null);
      await this.audit.write({
        actor: { type: ActorType.admin, id: stored.userId },
        entity: 'auth',
        entityId: stored.userId,
        action: 'logout',
      });
    }
    return { success: true };
  }

  private async issueTokenPair(
    user: User,
  ): Promise<{ tokens: AuthTokens; refreshTokenId: string }> {
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.accessExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    );

    const rawRefresh = randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(rawRefresh);
    const expiresAt = new Date(
      Date.now() + this.parseDurationToSeconds(this.refreshExpiresIn) * 1000,
    );

    const refreshRow = await this.refreshTokensRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    return {
      refreshTokenId: refreshRow.id,
      tokens: {
        accessToken,
        refreshToken: rawRefresh,
        expiresIn: this.accessExpiresSeconds,
        tokenType: 'Bearer',
      },
    };
  }

  private hashToken(raw: string): string {
    const secret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    return createHmac('sha256', secret).update(raw).digest('hex');
  }

  private toUserView(user: User): AuthUserView {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  private parseDurationToSeconds(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) {
      return 900;
    }
    const amount = Number(match[1]);
    const unit = match[2];
    switch (unit) {
      case 's':
        return amount;
      case 'm':
        return amount * 60;
      case 'h':
        return amount * 3600;
      case 'd':
        return amount * 86400;
      default:
        return 900;
    }
  }
}
