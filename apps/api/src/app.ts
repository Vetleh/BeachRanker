import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { attachUser } from "./auth.js";
import { config } from "./config.js";
import { errorHandler } from "./errors.js";
import { router } from "./routes.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.clientOrigin,
      credentials: true
    })
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachUser);
  app.use("/api", router);
  app.use(errorHandler);

  return app;
}
