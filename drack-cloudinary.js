"use strict";

const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const crypto = require("crypto");

const COOKIE_NAME = "drack_admin_session";
const SESSION_DURATION = 8 * 60 * 60 * 1000;

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length &&
    crypto.timingSafeEqual(left, right);
}

function makeSignature(payload, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");

  for (const cookie of cookies) {
    const index = cookie.indexOf("=");

    if (index < 0) continue;

    const key = cookie.slice(0, index).trim();

    if (key === name) {
      return cookie.slice(index + 1).trim();
    }
  }

  return "";
}

function createSession(username, secret) {
  const payload = Buffer.from(JSON.stringify({
    username,
    expires: Date.now() + SESSION_DURATION
  })).toString("base64url");

  return payload + "." + makeSignature(payload, secret);
}

function verifySession(req) {
  const secret = process.env.DRACK_SESSION_SECRET;

  if (!secret) return false;

  const token = getCookie(req, COOKIE_NAME);
  const parts = token.split(".");

  if (parts.length !== 2) return false;

  const [payload, signature] = parts;

  if (!safeEqual(signature, makeSignature(payload, secret))) {
    return false;
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    return session.username === process.env.DRACK_ADMIN_USERNAME &&
      Number.isFinite(session.expires) &&
      session.expires > Date.now();
  } catch {
    return false;
  }
}

function requireAdminSession(req, res, next) {
  if (!verifySession(req)) {
    return res.status(401).json({
      success: false,
      message: "Login inahitajika. Ingia tena kwenye akaunti ya admin."
    });
  }

  next();
}

function cookieOptions(req, clear = false) {
  const secure = String(req.get("x-forwarded-proto") || "")
    .split(",")[0].trim() === "https";

  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    ...(secure ? ["Secure"] : []),
    clear ? "Max-Age=0" : `Max-Age=${SESSION_DURATION / 1000}`
  ].join("; ");
}

module.exports = function registerDrackCloudinary(app) {
  const configured = Boolean(process.env.CLOUDINARY_URL);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 100 * 1024 * 1024,
      files: 1
    },
    fileFilter: (req, file, cb) => {
      const mime = String(file.mimetype || "").toLowerCase();

      if (mime.startsWith("audio/") || mime.startsWith("video/")) {
        return cb(null, true);
      }

      cb(new Error("Ruhusiwa kupakia faili za audio au video pekee."));
    }
  });

  if (configured) {
    cloudinary.config({ secure: true });
  }

  // LOGIN
  app.post("/api/admin/login", (req, res) => {
    const expectedUsername = process.env.DRACK_ADMIN_USERNAME;
    const expectedPassword = process.env.DRACK_ADMIN_PASSWORD;
    const secret = process.env.DRACK_SESSION_SECRET;

    if (!expectedUsername || !expectedPassword || !secret) {
      return res.status(503).json({
        success: false,
        message: "Mipangilio ya admin haijakamilika kwenye Render."
      });
    }

    const { username, password } = req.body || {};

    if (
      !safeEqual(username, expectedUsername) ||
      !safeEqual(password, expectedPassword)
    ) {
      return res.status(401).json({
        success: false,
        message: "Username au password si sahihi."
      });
    }

    const token = createSession(expectedUsername, secret);
    const secure = String(req.get("x-forwarded-proto") || "")
      .split(",")[0].trim() === "https";

    res.setHeader("Set-Cookie", [
      `${COOKIE_NAME}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${SESSION_DURATION / 1000}`,
      ...(secure ? ["Secure"] : [])
    ].join("; "));

    return res.json({
      success: true,
      message: "Umeingia kwenye DRACK HUB Admin."
    });
  });

  // CHECK LOGIN
  app.get("/api/admin/session", (req, res) => {
    return res.json({
      success: true,
      authenticated: verifySession(req)
    });
  });

  // LOGOUT
  app.post("/api/admin/logout", (req, res) => {
    const secure = String(req.get("x-forwarded-proto") || "")
      .split(",")[0].trim() === "https";

    res.setHeader("Set-Cookie", [
      `${COOKIE_NAME}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      "Max-Age=0",
      ...(secure ? ["Secure"] : [])
    ].join("; "));

    return res.json({
      success: true,
      message: "Umetoka kwenye akaunti."
    });
  });

  // CLOUDINARY STATUS
  app.get("/api/drack-media/status", (req, res) => {
    res.json({
      success: true,
      cloudinaryConfigured: configured,
      maxFileSizeMB: 100,
      supportedTypes: ["audio", "video"]
    });
  });

  // UPLOAD: LOGIN REQUIRED
  app.post(
    "/api/admin/drack-media/upload",
    requireAdminSession,
    upload.single("media"),
    async (req, res) => {
      if (!configured) {
        return res.status(503).json({
          success: false,
          message: "Cloudinary haijasanidiwa kwenye server."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Chagua faili la audio au video kwanza."
        });
      }

      const isVideo = req.file.mimetype
        .toLowerCase()
        .startsWith("video/");

      try {
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({
            resource_type: "video",
            folder: "drack-hub/media",
            use_filename: false,
            unique_filename: true,
            overwrite: false
          }, (error, uploaded) => {
            if (error) return reject(error);
            resolve(uploaded);
          });

          stream.end(req.file.buffer);
        });

        return res.status(201).json({
          success: true,
          media: {
            name: req.file.originalname,
            type: isVideo ? "video" : "audio",
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            bytes: result.bytes
          }
        });
      } catch (error) {
        console.error("DRACK CLOUDINARY UPLOAD:", error.message);

        return res.status(502).json({
          success: false,
          message: "Upload imeshindwa. Hakiki mipangilio ya Cloudinary."
        });
      }
    }
  );

  console.log(
    configured
      ? "DRACK CLOUDINARY: CONFIGURED"
      : "DRACK CLOUDINARY: WAITING FOR CLOUDINARY_URL"
  );
};
