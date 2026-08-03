import { Router, type Router as ExpressRouter } from "express";
import { adminStatsController } from "./admin-stats.controller.js";

export const adminStatsRouter: ExpressRouter = Router();

adminStatsRouter.get("/stats", adminStatsController);
