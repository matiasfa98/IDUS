// src/routes/attachments.js
import express from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  buildSignedUpload,
  fetchResourceMetadata,
  isMimeAllowed,
  SIZE_LIMITS,
} from "../services/cloudinary.js";
import { uploadSignLimiter } from "../middleware/rateLimit.js";

export const attachmentsRouter = express.Router();

// ── Schemas ──────────────────────────────────────────
const signSchema = z.object({
  kind: z.enum(["image", "file"]),
  size: z.number().int().positive(),
  mimeType: z.string().min(3).max(120),
  originalName: z.string().max(255).optional(),
});

const confirmSchema = z.object({
  kind: z.enum(["image", "file"]),
  publicId: z.string().min(3).max(300),
});

// ── POST /attachments/sign ───────────────────────────
// Client asks: "I want to upload an image/file of X bytes with Y mime type."
// Server validates, then returns signed upload params.
attachmentsRouter.post(
  "/sign",
  requireAuth,
  uploadSignLimiter,
  validate(signSchema),
  async (req, res, next) => {
    try {
      const { kind, size, mimeType } = req.body;

      // Size check
      const limit = SIZE_LIMITS[kind];
      if (!limit) {
        return res.status(400).json({
          error: "UNSUPPORTED_KIND",
          message: `kind must be "image" or "file"`,
        });
      }
      if (size > limit) {
        return res.status(413).json({
          error: "FILE_TOO_LARGE",
          message: `Max ${limit} bytes for ${kind}. Received ${size}.`,
          maxBytes: limit,
        });
      }

      // MIME allowlist
      if (!isMimeAllowed(kind, mimeType)) {
        return res.status(415).json({
          error: "UNSUPPORTED_MIME",
          message: `MIME type ${mimeType} is not allowed for ${kind}.`,
        });
      }

      const signed = buildSignedUpload({
        kind,
        userId: String(req.userId),
      });

      res.json({
        uploadUrl: signed.uploadUrl,
        resourceType: signed.resourceType,
        params: signed.params,
        // Client should read these to know the caps
        limits: { maxBytes: limit },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /attachments/confirm ────────────────────────
// After Cloudinary upload succeeds, the client calls this to prove the
// publicId exists and get back canonical URLs + metadata.
attachmentsRouter.post(
  "/confirm",
  requireAuth,
  validate(confirmSchema),
  async (req, res, next) => {
    try {
      const { kind, publicId } = req.body;

      // Ownership check: the publicId must live under our per-user folder.
      const expectedPrefix = `attachments/${
        kind === "image" ? "image" : "raw"
      }/${req.userId}/`;
      if (!publicId.startsWith(expectedPrefix)) {
        return res.status(403).json({
          error: "NOT_YOUR_RESOURCE",
          message: `publicId must start with "${expectedPrefix}".`,
        });
      }

      const meta = await fetchResourceMetadata(publicId, kind);
      if (!meta) {
        return res.status(404).json({
          error: "RESOURCE_NOT_FOUND",
          message: "Cloudinary has no such resource in your account.",
        });
      }

      res.json({
        attachment: {
          kind,
          url: meta.url,
          thumbUrl: meta.thumbUrl,
          mimeType: meta.mimeType,
          size: meta.size,
          width: meta.width,
          height: meta.height,
          cloudinaryPublicId: publicId,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);