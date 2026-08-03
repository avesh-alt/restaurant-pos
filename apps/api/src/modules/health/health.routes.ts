import { Router, type Router as ExpressRouter } from "express";

import { healthController } from "./health.controller.js";

export const healthRouter: ExpressRouter = Router();

healthRouter.get("/health", healthController);
