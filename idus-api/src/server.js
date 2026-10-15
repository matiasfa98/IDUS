// src/server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "node:http";

import { config } from "./config.js";
import { connectMongo } from "./db/mongo.js";
import { healthRouter } from "./routes/health.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { challengesRouter } from "./routes/challenges.js";
import { participantsRouter } from "./routes/participants.js";
import { invitesRouter } from "./routes/invites.js";
import { idusClerk } from "./middleware/clerk.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { progressRouter } from "./routes/progress.js";
import { meRouter } from "./routes/me.js";
import { initSocket } from "./services/socket.js";
import { conversationsRouter } from "./routes/conversations.js";
import { messagesRouter } from "./routes/messages.js";
import { syncRouter } from "./routes/sync.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { presenceRouter } from "./routes/presence.js";
import { usersRouter } from "./routes/users.js";
import { contactsRouter } from "./routes/contacts.js";
import { metaphorsRouter } from "./routes/metaphors.js";

async function main() {
  await connectMongo();

  const app = express();

  app.use(helmet());

  // In dev, allow localhost anywhere (Expo web preview, browser tools, etc.).
  // In prod, restrict to the configured web URL.
  const corsOrigin =
    config.env === "production"
      ? [config.webUrl]
      : true; // reflect request origin in dev

  app.use(cors({ origin: corsOrigin, credentials: true }));

  // Webhooks FIRST — needs raw body, must not hit express.json()
  app.use("/webhooks", webhooksRouter);

  // Then JSON + Clerk
  app.use(express.json({ limit: "2mb" }));
  app.use(idusClerk);

  app.use("/health", healthRouter);

  // Dev-only token mint. Guarded by NODE_ENV in the router itself too.
  if (config.env !== "production") {
    const { devRouter } = await import("./routes/dev.js");
    app.use("/dev", devRouter);
    console.log("[api] dev routes mounted at /dev");
  }

  app.use("/challenges", challengesRouter);
  app.use("/challenges", participantsRouter);
  app.use("/challenges", progressRouter);
  app.use("/join", invitesRouter);
  app.use("/me", meRouter);
  app.use("/sync", syncRouter);
  app.use("/attachments", attachmentsRouter);
  app.use("/presence", presenceRouter);
  app.use("/users", usersRouter);
  app.use("/contacts", contactsRouter);
  app.use("/metaphors", metaphorsRouter);
  app.use("/conversations", conversationsRouter);
  app.use("/conversations", messagesRouter);



  app.use(notFoundHandler);
  app.use(errorHandler);

   const httpServer = createServer(app);

  // Attach Socket.IO to the same HTTP server.
  initSocket(httpServer);

  httpServer.listen(config.port, () => {
    console.log(`[api] http://localhost:${config.port}`);
    console.log(`[api] socket.io attached`);
  });
}

main().catch((err) => {
  console.error("[api] fatal", err);
  process.exit(1);
});