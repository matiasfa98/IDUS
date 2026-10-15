import { Router } from "express";
import mongoose from "mongoose";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "idus-api",
    version: "0.1.0",
    mongo: mongoose.connection.readyState === 1 ? "up" : "down",
    time: new Date().toISOString(),
  });
});