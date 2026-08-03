import { Router, type Router as ExpressRouter } from "express";

import { validateRequest } from "../../shared/middleware/validate-request.middleware.js";
import { loginSchema, refreshSchema } from "./auth.schemas.js";
import { loginController, refreshController } from "./auth.controller.js";

export const authRouter: ExpressRouter = Router();

authRouter.post("/auth/login", validateRequest(loginSchema), loginController);
authRouter.post("/auth/refresh", validateRequest(refreshSchema), refreshController);
