"use strict";

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const BASE = "https://drack-hub-gldg.onrender.com";
const BUCKET = "drack-media";
const SITEMAP = path.join(__dirname, "public", "sitemap.xml");

function slug(title, artist) {
  return String((artist || "") + " " + (title || ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function metadataFromName(name) {
  const ext = path.extname(name);
  const marker = name.indexOf("--");
  if (marker < 0 || !ext) return null;

  try {
    const token = name.slice(marker + 2, name.length - ext.length);
    const data = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    if (!data || typeof data.title !== "string" || !data.title.trim()) return null;

    return {
      title: data.title.trim(),
      artist: typeof data.artist === "string" ? data.artist.trim() : ""
    };
  } catch {
    return null;
  }
}

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  })[char]);
}

function existingUrls() {
  if (!fs.existsSync(SITEMAP)) return [BASE + "/"];

  const xml = fs.readFileSync(SITEMAP, "utf8");
  const urls = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map(match => match[1].trim())
    .filter(Boolean)
    .map(value => value
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"));

  return urls.length ? urls : [BASE + "/"];
}

module.exports = function registerDynamicSitemap(app) {
  app.get("/sitemap.xml", async (req, res) => {
    let urls;

    try {
      urls = existingUrls();
    } catch (error) {
      console.error("SITEMAP READ ERROR:", error.message);
      urls = [BASE + "/"];
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });

        let offset = 0;

        while (true) {
          const { data, error } = await supabase.storage.from(BUCKET).list("", {
            limit: 1000,
            offset,
            sortBy: { column: "created_at", order: "desc" }
          });

          if (error) throw error;

          const files = data || [];

          for (const file of files) {
            if (!file.name ||
                file.name.startsWith(".") ||
                !/\.(mp3|m4a|aac|ogg|wav|flac|opus|wma)$/i.test(file.name)) {
              continue;
            }

            const metadata = metadataFromName(file.name);
            if (!metadata) continue;

            const songSlug = slug(metadata.title, metadata.artist);
            if (songSlug) urls.push(BASE + "/uploaded-music/" + songSlug);
          }

          if (files.length < 1000) break;
          offset += files.length;
        }
      } catch (error) {
        console.error("SITEMAP SUPABASE ERROR:", error.message);
      }
    }

    const unique = [...new Set(urls)];
    const body = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      unique.map(url => "<url><loc>" + xmlEscape(url) + "</loc></url>").join("") +
      "</urlset>";

    res.set("Cache-Control", "public, max-age=300");
    res.type("application/xml").send(body);
  });
};
