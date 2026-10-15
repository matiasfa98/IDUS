import mongoose from "mongoose";
import { config } from "../config.js";

let connected = false;

export async function connectMongo() {
  if (connected) return;
  mongoose.set("strictQuery", true);

  await mongoose.connect(config.mongoUri, {
    autoIndex: config.env !== "production",
    serverSelectionTimeoutMS: 10_000,
  });

  connected = true;
  console.log("[mongo] connected to Atlas");
}

export async function disconnectMongo() {
  await mongoose.disconnect();
  connected = false;
}