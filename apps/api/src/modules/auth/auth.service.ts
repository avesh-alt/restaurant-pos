import { createHash } from "node:crypto";

import jwt from "jsonwebtoken";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { authTokenTtl } from "./auth.constants.js";
import type { AuthTokens, AuthenticatedUser } from "./auth.types.js";

type TokenPayload = Pick<AuthenticatedUser, "id" | "restaurantId" | "branchId" | "role" | "email"> & {
  tokenType: "access" | "refresh";
};

function signToken(payload: TokenPayload, secret: string, expiresInSeconds: number): string {
  return jwt.sign(payload, secret, {
    expiresIn: expiresInSeconds,
  });
}

export interface VerifiedRefreshTokenPayload {
  id: string;
  restaurantId?: string;
  branchId?: string;
  role: AuthenticatedUser["role"];
  email: string;
  tokenType: "refresh";
}

export interface VerifiedAccessTokenPayload {
  id: string;
  restaurantId?: string;
  branchId?: string;
  role: AuthenticatedUser["role"];
  email: string;
  tokenType: "access";
}

export function issueAuthTokens(user: AuthenticatedUser): AuthTokens {
  return {
    accessToken: signToken(
      {
        id: user.id,
        restaurantId: user.restaurantId,
        branchId: user.branchId,
        role: user.role,
        email: user.email,
        tokenType: "access",
      },
      env.JWT_SECRET,
      authTokenTtl.accessTokenSeconds,
    ),
    refreshToken: signToken(
      {
        id: user.id,
        restaurantId: user.restaurantId,
        branchId: user.branchId,
        role: user.role,
        email: user.email,
        tokenType: "refresh",
      },
      env.JWT_REFRESH_SECRET,
      authTokenTtl.refreshTokenSeconds,
    ),
    expiresIn: authTokenTtl.accessTokenSeconds,
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyRefreshToken(token: string): VerifiedRefreshTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET);

    if (typeof payload !== "object" || payload === null || payload.tokenType !== "refresh" || typeof payload.id !== "string") {
      throw new AppError("Invalid refresh token.", 401, "INVALID_REFRESH_TOKEN");
    }

    return payload as VerifiedRefreshTokenPayload;
  } catch {
    throw new AppError("Invalid refresh token.", 401, "INVALID_REFRESH_TOKEN");
  }
}

export function verifyAccessToken(token: string): VerifiedAccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);

    if (typeof payload !== "object" || payload === null || payload.tokenType !== "access" || typeof payload.id !== "string") {
      throw new AppError("Invalid access token.", 401, "INVALID_ACCESS_TOKEN");
    }

    return payload as VerifiedAccessTokenPayload;
  } catch {
    throw new AppError("Invalid access token.", 401, "INVALID_ACCESS_TOKEN");
  }
}
