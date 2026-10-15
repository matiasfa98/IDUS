import express from "express";
import { verifyWebhook } from "@clerk/express/webhooks";
import { User } from "../models/User.js";
import { generatePermanentId } from "../utils/permanentId.js";

export const webhooksRouter = express.Router();

webhooksRouter.post(
  "/clerk",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("[webhook] hit");
    try {
      const evt = await verifyWebhook(req);
      console.log("[webhook] received", evt.type);

      if (evt.type === "user.created") {
        const { id, username, first_name, last_name } = evt.data;
        await User.updateOne(
          { clerkId: id },
          {
            $setOnInsert: {
              clerkId: id,
              permanentId: await generatePermanentId(),
              username: username ?? null,
              fullName: [first_name, last_name].filter(Boolean).join(" "),
            },
          },
          { upsert: true }
        );
      }

      if (evt.type === "user.updated") {
        const { id, username, first_name, last_name } = evt.data;
        await User.updateOne(
          { clerkId: id },
          {
            $set: {
              username: username ?? null,
              fullName: [first_name, last_name].filter(Boolean).join(" "),
            },
          }
        );
      }

      if (evt.type === "user.deleted") {
        await User.deleteOne({ clerkId: evt.data.id });
      }

      res.status(200).json({ received: true });
    } catch (err) {
      console.error("[webhook] failed", err);
      res.status(400).json({ error: "WEBHOOK_VERIFICATION_FAILED" });
    }
  }
);