import { config } from "dotenv";
import path from "node:path";

config({
  path: path.resolve(process.cwd(), "..", "..", ".env"),
});

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  REDIS_URL: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
