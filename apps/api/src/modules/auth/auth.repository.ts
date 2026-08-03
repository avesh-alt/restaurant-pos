import type { Prisma, User } from "@prisma/client";

import { prisma } from "../../shared/database/index.js";

type RefreshSessionWithUser = Prisma.AuthSessionGetPayload<{
  include: {
    user: true;
  };
}>;

export interface RefreshSessionInput {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent: string | null | undefined;
  ipAddress: string | null | undefined;
}

export class AuthRepository {
  public async findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: {
        email,
      },
    });
  }

  public async findUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: {
        id,
      },
    });
  }

  public async createUser(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({
      data,
    });
  }

  public async findRefreshSessionByHash(refreshTokenHash: string): Promise<RefreshSessionWithUser | null> {
    return prisma.authSession.findFirst({
      where: {
        refreshTokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });
  }

  public async createRefreshSession(input: RefreshSessionInput) {
    return prisma.authSession.create({
      data: {
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  public async rotateRefreshSession(
    sessionId: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await prisma.authSession.update({
      where: {
        id: sessionId,
      },
      data: {
        refreshTokenHash,
        expiresAt,
        revokedAt: null,
      },
    });
  }

  public async revokeRefreshSession(sessionId: string): Promise<void> {
    await prisma.authSession.update({
      where: {
        id: sessionId,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
