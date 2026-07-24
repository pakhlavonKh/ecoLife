import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RefreshTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return this.prisma.refreshToken.create({ data });
  }

  findByHash(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  revoke(id: string, replacedByTokenId: string | null) {
    return this.prisma.refreshToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        replacedByTokenId,
      },
    });
  }

  revokeAllForUser(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
