import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/app-error.js";
import { verifyAccessToken } from "../../modules/auth/auth.service.js";

export function requireSuperAdmin(request: Request, _response: Response, next: NextFunction): void {
  const authHeader = request.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    next(new AppError("Authentication required.", 401, "UNAUTHORIZED"));
    return;
  }

  try {
    const payload = verifyAccessToken(authHeader.slice(7));
    if (payload.role !== "SUPER_ADMIN") {
      next(new AppError("Super admin access required.", 403, "FORBIDDEN"));
      return;
    }
    next();
  } catch {
    next(new AppError("Invalid or expired token.", 401, "UNAUTHORIZED"));
  }
}
