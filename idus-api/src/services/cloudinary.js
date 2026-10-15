// src/services/cloudinary.js
import { v2 as cloudinary } from "cloudinary";
import { config } from "../config.js";

// Configure once at import time.
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
});

// ── Validation rules ─────────────────────────────────

const IMAGE_MIME_ALLOW = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const FILE_MIME_ALLOW = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

export const SIZE_LIMITS = {
  image: 10 * 1024 * 1024, // 10 MB
  file: 25 * 1024 * 1024,  // 25 MB
};

export function isMimeAllowed(kind, mimeType) {
  if (kind === "image") return IMAGE_MIME_ALLOW.has(mimeType);
  if (kind === "file") return FILE_MIME_ALLOW.has(mimeType);
  return false;
}

export function resourceTypeFor(kind) {
  if (kind === "image") return "image";
  if (kind === "file") return "raw";
  throw new Error(`Unsupported attachment kind: ${kind}`);
}

// ── Signed upload payload ────────────────────────────

/**
 * Build the params the client must send to Cloudinary alongside the file.
 * The signature covers these params + api_secret, so nothing can be tampered
 * with client-side.
 *
 * @param {object} opts
 * @param {"image"|"file"} opts.kind
 * @param {string} opts.userId
 * @param {string} [opts.preset] — Cloudinary upload preset name
 * @returns {{ uploadUrl: string, params: Record<string,string|number>, resourceType: string }}
 */
export function buildSignedUpload({ kind, userId, preset = "idus_signed" }) {
  const resourceType = resourceTypeFor(kind);
  const timestamp = Math.floor(Date.now() / 1000);

  // Folder structure: one per user, one per resource type.
  // "attachments/<resourceType>/<userId>" keeps things organized.
  const folder = `attachments/${resourceType}/${userId}`;

  const paramsToSign = {
    folder,
    timestamp,
    upload_preset: preset,
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    config.cloudinary.apiSecret
  );

  const uploadUrl = `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/${resourceType}/upload`;

  return {
    uploadUrl,
    resourceType,
    params: {
      ...paramsToSign,
      api_key: config.cloudinary.apiKey,
      signature,
    },
  };
}

/**
 * Verify a publicId exists in our Cloudinary account and fetch its metadata.
 * Used by /attachments/confirm so the client can't fabricate URLs.
 *
 * @param {string} publicId
 * @param {"image"|"file"} kind
 * @returns {Promise<{ url, thumbUrl, size, mimeType, width, height, format } | null>}
 */
export async function fetchResourceMetadata(publicId, kind) {
  const resourceType = resourceTypeFor(kind);

  try {
    const res = await cloudinary.api.resource(publicId, {
      resource_type: resourceType,
    });

    const url = res.secure_url ?? res.url ?? null;

    // For images, generate a thumbnail by inserting a transformation in the URL.
    // For raw files, no thumbnail.
    let thumbUrl = null;
    if (kind === "image" && url) {
      thumbUrl = cloudinary.url(res.public_id, {
        secure: true,
        resource_type: "image",
        transformation: [
          { width: 400, height: 400, crop: "limit" },
          { quality: "auto", fetch_format: "auto" },
        ],
      });
    }

    return {
      url,
      thumbUrl,
      size: res.bytes ?? null,
      width: res.width ?? null,
      height: res.height ?? null,
      format: res.format ?? null,
      mimeType: res.resource_type === "image"
        ? `image/${res.format}`
        : guessMimeFromFormat(res.format),
    };
  } catch (err) {
    // cloudinary throws 404 for unknown public ids
    console.warn("[cloudinary] resource not found:", publicId, err.message);
    return null;
  }
}

function guessMimeFromFormat(format) {
  if (!format) return "application/octet-stream";
  const map = {
    pdf: "application/pdf",
    zip: "application/zip",
    txt: "text/plain",
    csv: "text/csv",
    md: "text/markdown",
  };
  return map[format.toLowerCase()] ?? "application/octet-stream";
}