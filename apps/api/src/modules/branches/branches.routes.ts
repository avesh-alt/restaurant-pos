import { Router, type Router as ExpressRouter } from "express";

import { listBranchesController } from "./branches.controller.js";

export const branchesRouter: ExpressRouter = Router();

branchesRouter.get("/branches", listBranchesController);
