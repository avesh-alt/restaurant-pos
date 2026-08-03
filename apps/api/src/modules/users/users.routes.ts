import { Router, type Router as ExpressRouter } from "express";
import { listUsersController, createUserController, updateUserController } from "./users.controller.js";

export const usersAdminRouter: ExpressRouter = Router();

usersAdminRouter.get("/users", listUsersController);
usersAdminRouter.post("/users", createUserController);
usersAdminRouter.patch("/users/:userId", updateUserController);
