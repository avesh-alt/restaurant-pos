import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { billingRouter } from "./modules/billing/billing.routes.js";
import { branchesRouter } from "./modules/branches/branches.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { menuRouter } from "./modules/menu/menu.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { tablesRouter } from "./modules/tables/tables.routes.js";
import { adminStatsRouter } from "./modules/admin-stats/admin-stats.routes.js";
import { restaurantsAdminRouter } from "./modules/restaurants/restaurants.routes.js";
import { usersAdminRouter } from "./modules/users/users.routes.js";
import { errorHandler } from "./shared/middleware/error-handler.js";
import { requireSuperAdmin } from "./shared/middleware/require-super-admin.middleware.js";
import { tenantContextMiddleware } from "./shared/middleware/tenant-context.middleware.js";

export function createApp(): Express {
  const app = express();
  const allowedOrigins = new Set(
    [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4173",
      "http://127.0.0.1:4173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
      "http://localhost:5175",
      "http://127.0.0.1:5175",
      "http://localhost:5176",
      "http://127.0.0.1:5176",
      "http://localhost:5177",
      "http://127.0.0.1:5177",
      ...(env.CORS_ORIGIN ? env.CORS_ORIGIN.split(",").map((value) => value.trim()) : []),
    ].filter((value) => value.length > 0),
  );

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }

        callback(null, allowedOrigins.has(origin));
      },
      credentials: true,
    }),
  );
  app.use(express.json());

  app.use("/api", authRouter);
  app.use("/api", healthRouter);
  app.use("/api/admin", requireSuperAdmin);
  app.use("/api/admin", adminStatsRouter);
  app.use("/api/admin", restaurantsAdminRouter);
  app.use("/api/admin", usersAdminRouter);
  app.use("/api/v1", tenantContextMiddleware);
  app.use("/api/v1", branchesRouter);
  app.use("/api/v1", billingRouter);
  app.use("/api/v1", menuRouter);
  app.use("/api/v1", tablesRouter);
  app.use("/api/v1", ordersRouter);

  app.get("/api/v1", (_request, response) => {
    response.status(200).json({
      status: "ok",
      version: "v1",
    });
  });

  app.use(errorHandler);

  return app;
}
