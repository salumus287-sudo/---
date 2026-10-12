"use strict";

const { createClient } = require("@supabase/supabase-js");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");

const COOKIE_NAME = "drack_admin_session";
const SESSION_DURATION = 8 * 60 * 60 * 1000;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const BUCKET = "drack-media";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const configured = Boolean(supabaseUrl && supabaseKey);

const supabase = configured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

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

function registerDrackCloudinary(app) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_FILE_SIZE,
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

  // STORAGE STATUS
  app.get("/api/drack-media/status", (req, res) => {
    return res.json({
      success: true,
      storageConfigured: configured,
      provider: "supabase",
      maxFileSizeMB: 50,
      supportedTypes: ["audio", "video"]
    });
  });

  // UPLOAD: ADMIN LOGIN REQUIRED
  app.post(
    "/api/admin/drack-media/upload",
    requireAdminSession,
    upload.single("media"),
    async (req, res) => {
      if (!configured) {
        return res.status(503).json({
          success: false,
          message: "Supabase haijasanidiwa kwenye Render."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Chagua faili la audio au video kwanza."
        });
      }

      const mime = String(req.file.mimetype || "").toLowerCase();
      const isVideo = mime.startsWith("video/");
      const title = String(req.body.title || "").trim().slice(0, 120);
      const artist = String(req.body.artist || "").trim().slice(0, 100);

      if (!title) {
        return res.status(400).json({
          success: false,
          message: "Andika jina la wimbo au video kwanza."
        });
      }

      const originalExt = path.extname(req.file.originalname || "")
        .toLowerCase();

      const ext = /^\.[a-z0-9]{1,10}$/i.test(originalExt)
        ? originalExt
        : "";

      const safeTitle = title
        .normalize("NFKC")
        .replace(/[\\/\\?#%:*|"<>\\x00-\\x1F]/g, "")
        .replace(/\\s+/g, " ")
        .trim()
        .slice(0, 100) || "DRACK-MEDIA";

      const safeArtist = artist
        .normalize("NFKC")
        .replace(/[\\/\\?#%:*|"<>\\x00-\\x1F]/g, "")
        .replace(/\\s+/g, " ")
        .trim()
        .slice(0, 80);

      const metadataToken = Buffer.from(
        JSON.stringify({ title: safeTitle, artist: safeArtist })
      ).toString("base64url");

      const storagePath =
        `${Date.now()}-${crypto.randomUUID()}--${metadataToken}${ext}`;

      const downloadName =
        `${safeTitle}${safeArtist ? " - " + safeArtist : ""}${ext}`;

      try {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, req.file.buffer, {
            contentType: mime,
            cacheControl: "3600",
            upsert: false
          });

        if (error) {
          console.error("DRACK SUPABASE UPLOAD:", error.message);

          return res.status(502).json({
            success: false,
            message:
              "Upload imeshindwa. Hakiki Supabase, bucket na file size."
          });
        }

        const { data: publicData } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(data.path);

        return res.status(201).json({
          success: true,
          media: {
            name: `${safeTitle}${ext}`,
            title: safeTitle,
            artist: safeArtist,
            downloadName,
            type: isVideo ? "video" : "audio",
            url: publicData.publicUrl,
            publicId: data.path,
            format: ext.replace(".", ""),
            bytes: req.file.size
          }
        });
      } catch (error) {
        console.error("DRACK SUPABASE UPLOAD:", error.message);

        return res.status(502).json({
          success: false,
          message: "Hitilafu imetokea wakati wa kupakia faili."
        });
      }
    }
  );

  console.log(
    configured
      ? "DRACK SUPABASE STORAGE: CONFIGURED"
      : "DRACK SUPABASE STORAGE: WAITING FOR ENVIRONMENT VARIABLES"
  );

  app.get('/api/drack-media/list', async (req, res) => {
    try {
      if (!configured || !supabase) {
        return res.status(503).json({ success: false, message: 'Hifadhi ya media haijasanidiwa.' });
      }

      const type = req.query.type === 'video' ? 'video' : 'audio';
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });

      if (error) throw error;

      const audioExt = /\.(mp3|m4a|aac|ogg|wav|flac|opus|wma)$/i;
      const videoExt = /\.(mp4|m4v|webm|mov|mkv|3gp|avi)$/i;

      const files = (data || []).filter(file => {
        if (!file.name || file.name.startsWith('.')) return false;
        return type === 'video' ? videoExt.test(file.name) : audioExt.test(file.name);
      });

      const media = await Promise.all(files.map(async file => {
        const ext = path.extname(file.name);
        let title = "";
        let artist = "";
        let downloadName = file.name;

        const marker = file.name.indexOf("--");

        if (marker >= 0) {
          const token = file.name.slice(marker + 2, file.name.length - ext.length);

          try {
            const metadata = JSON.parse(
              Buffer.from(token, "base64url").toString("utf8")
            );

            if (metadata && typeof metadata.title === "string") {
              title = metadata.title;
              artist = typeof metadata.artist === "string" ? metadata.artist : "";
              downloadName =
                `${title}${artist ? " - " + artist : ""}${ext}`;
            }
          } catch {
            // Faili za zamani zinaweza kuwa na muundo tofauti.
          }
        }

        const { data: signed, error: signError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(file.name, 3600, { download: downloadName });

        if (signError || !signed) return null;

        return {
          name: title ? `${title}${ext}` : file.name,
          title: title || "",
          artist,
          type,
          size: file.metadata && file.metadata.size ? file.metadata.size : 0,
          createdAt: file.created_at || null,
          url: signed.signedUrl
        };
      }));

      const available = media.filter(Boolean);
      res.json({ success: true, total: available.length, media: available });
    } catch (error) {
      console.error('DRACK media list error:', error.message);
      res.status(500).json({ success: false, message: 'Imeshindikana kupata faili. Kagua mipangilio ya Supabase.' });
    }
  });

}

module.exports = registerDrackCloudinary;
