"use strict";

const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const crypto = require("crypto");

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
    cloudinary.config({
      secure: true
    });
  }

  // Hali ya huduma: haionyeshi siri za Cloudinary.
  app.get("/api/drack-media/status", (req, res) => {
    res.json({
      success: true,
      cloudinaryConfigured: configured,
      maxFileSizeMB: 100,
      supportedTypes: ["audio", "video"]
    });
  });

  // Upload inalindwa na ufunguo tofauti wa admin.
  // Weka DRACK_MEDIA_ADMIN_KEY kwenye Render kabla ya kutumia.
  app.post("/api/admin/drack-media/upload", (req, res, next) => {
    const expected = process.env.DRACK_MATCH_ADMIN_KEY;
    const supplied = req.get("x-drack-admin-key");

    if (!expected || !supplied ||
        supplied.length !== expected.length ||
        !crypto.timingSafeEqual(
          Buffer.from(supplied),
          Buffer.from(expected)
        )) {
      return res.status(401).json({
        success: false,
        message: "Upload imezuiwa: ufunguo wa admin haujakubaliwa."
      });
    }

    if (!configured) {
      return res.status(503).json({
        success: false,
        message: "Cloudinary haijasanidiwa kwenye server."
      });
    }

    next();
  }, upload.single("media"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Chagua faili la audio au video kwanza."
      });
    }

    const isVideo = req.file.mimetype.toLowerCase().startsWith("video/");
    const resourceType = isVideo ? "video" : "video";

    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          resource_type: resourceType,
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
  });

  console.log(
    configured
      ? "DRACK CLOUDINARY: CONFIGURED"
      : "DRACK CLOUDINARY: WAITING FOR CLOUDINARY_URL"
  );
};
