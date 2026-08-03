import type { Request, Response } from "express";

export function healthController(_request: Request, response: Response): void {
  response.status(200).json({
    status: "ok",
    service: "restaurant-pos-api",
  });
}
