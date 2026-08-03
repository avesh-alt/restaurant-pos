import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

import { AppError } from "../errors/app-error.js";

type RequestSource = "body" | "params" | "query";

export function validateRequest(schema: ZodTypeAny, source: RequestSource = "body") {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(request[source]);

    if (!parsed.success) {
      next(new AppError("Validation failed.", 400, "VALIDATION_ERROR", parsed.error.flatten()));
      return;
    }

    (request as Request & Record<RequestSource, unknown>)[source] = parsed.data;
    next();
  };
}
