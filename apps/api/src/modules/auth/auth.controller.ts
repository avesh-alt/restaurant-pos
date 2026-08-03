import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { AppError } from "../../shared/errors/app-error.js";
import { authTokenTtl } from "./auth.constants.js";
import { AuthRepository } from "./auth.repository.js";
import { loginSchema, refreshSchema } from "./auth.schemas.js";
import { hashToken, issueAuthTokens, verifyRefreshToken } from "./auth.service.js";
import type { AuthenticatedUser } from "./auth.types.js";

const authRepository = new AuthRepository();
type LoginInput = z.infer<typeof loginSchema>;
type RefreshInput = z.infer<typeof refreshSchema>;

function buildAuthenticatedUser(user: {
  id: string;
  restaurantId: string | null;
  branchId: string | null;
  role: AuthenticatedUser["role"];
  email: string;
}): AuthenticatedUser {
  if (user.role !== "SUPER_ADMIN" && !user.restaurantId) {
    throw new AppError("User is not assigned to a restaurant.", 403, "USER_RESTAURANT_REQUIRED");
  }

  return {
    id: user.id,
    restaurantId: user.restaurantId ?? undefined,
    branchId: user.branchId ?? undefined,
    role: user.role,
    email: user.email,
  };
}

export async function loginController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const body = request.body as LoginInput;
    const user = await authRepository.findUserByEmail(body.email);

    if (!user) {
      throw new AppError("Invalid credentials.", 401, "INVALID_CREDENTIALS");
    }

    const passwordMatches = await bcrypt.compare(body.password, user.passwordHash);

    if (!passwordMatches) {
      throw new AppError("Invalid credentials.", 401, "INVALID_CREDENTIALS");
    }

    const authenticatedUser = buildAuthenticatedUser(user);
    const tokens = issueAuthTokens(authenticatedUser);
    const refreshTokenHash = hashToken(tokens.refreshToken);
    const refreshExpiresAt = new Date(Date.now() + authTokenTtl.refreshTokenSeconds * 1000);

    await authRepository.createRefreshSession({
      userId: user.id,
      refreshTokenHash,
      expiresAt: refreshExpiresAt,
      userAgent: request.header("user-agent"),
      ipAddress: request.ip,
    });

    response.status(200).json({
      user: authenticatedUser,
      tokens,
    });
  } catch (error) {
    next(error);
  }
}

export async function refreshController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const body = request.body as RefreshInput;
    const verified = verifyRefreshToken(body.refreshToken);
    const refreshTokenHash = hashToken(body.refreshToken);
    const session = await authRepository.findRefreshSessionByHash(refreshTokenHash);

    if (!session || session.userId !== verified.id) {
      throw new AppError("Invalid refresh token.", 401, "INVALID_REFRESH_TOKEN");
    }

    const authenticatedUser = buildAuthenticatedUser(session.user);
    const tokens = issueAuthTokens(authenticatedUser);
    const nextRefreshTokenHash = hashToken(tokens.refreshToken);
    const nextRefreshExpiresAt = new Date(Date.now() + authTokenTtl.refreshTokenSeconds * 1000);

    await authRepository.rotateRefreshSession(session.id, nextRefreshTokenHash, nextRefreshExpiresAt);

    response.status(200).json({
      user: authenticatedUser,
      tokens,
    });
  } catch (error) {
    next(error);
  }
}
