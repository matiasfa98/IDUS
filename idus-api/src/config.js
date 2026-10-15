import dotenv from "dotenv";
dotenv.config();

function required(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  apiUrl: process.env.API_URL ?? "http://localhost:4000",
  webUrl: process.env.WEB_URL ?? "http://localhost:3000",

  mongoUri: required("MONGODB_URI"),

  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
    refreshTtl: process.env.JWT_REFRESH_TTL ?? "30d",
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  },

  cookie: {
    domain: process.env.COOKIE_DOMAIN ?? "localhost",
    secure: process.env.COOKIE_SECURE === "true",
  },
  clerk: {
  publishableKey: required("CLERK_PUBLISHABLE_KEY"),
  secretKey: required("CLERK_SECRET_KEY"),
  webhookSecret: required("CLERK_WEBHOOK_SIGNING_SECRET"),
},
};