import type { NextFunction, Request, Response } from "express";

import { createTenantContext, normalizeTenantId, tenantHeaders, type TenantContext } from "@restaurant-pos/shared";
import { AppError } from "../errors/app-error.js";

declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}

export function tenantContextMiddleware(request: Request, _response: Response, next: NextFunction): void {
  const restaurantId = normalizeTenantId(request.header(tenantHeaders.restaurantId));
  const branchId = normalizeTenantId(request.header(tenantHeaders.branchId));

  const tenantContext = createTenantContext({
    restaurantId,
    branchId,
  });

  if (!tenantContext) {
    next(new AppError("Missing tenant context.", 400, "TENANT_CONTEXT_REQUIRED"));
    return;
  }

  request.tenantContext = tenantContext;
  next();
}
