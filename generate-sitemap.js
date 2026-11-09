"use strict";

const fs = require("fs");
const path = require("path");

try {
  require("dotenv").config();
} catch (_) {}

const { createClient } = require("@supabase/supabase-js");

const BASE = "https://drack-hub-gldg.onrender.com";
const PUBLIC_DIR = path.join(__dirname, "public");
const OUTPUT = path.join(PUBLIC_DIR, "sitemap.xml");

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slug(title, artist = "") {
  return `${title}-${artist}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function readUploadedSongMetadata(fileName) {
  const ext = path.extname(fileName);
  const marker = fileName.indexOf("--");

  if (marker < 0) return null;

  try {
    const token = fileName.slice(
      marker + 2,
      fileName.length - ext.length
    );

    const metadata = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8")
    );

    if (!metadata || typeof metadata.title !== "string") {
      return null;
    }

    return {
      title: metadata.title.trim(),
      artist:
        typeof metadata.artist === "string"
          ? metadata.artist.trim()
          : ""
    };
  } catch (_) {
    return null;
  }
}

function isExcluded(fileName, relativePath) {
  const lower = relativePath.toLowerCase();
  const parts = lower.split("/");

  if (parts.some(part =>
    part.includes("backup") ||
    part.includes("before-") ||
    part.startsWith("admin")
  )) return true;

  const excludedNames = [
    "admin.html",
    "login.html",
    "register.html",
    "drack-decoder-test.html",
    "404.html",
    "offline.html",
    "payment-demo.html"
  ];

  if (excludedNames.includes(fileName.toLowerCase())) return true;

  if (
    lower.includes("/test/") ||
    lower.includes("/private/")
  ) return true;

  return false;
}

function collectPublicPages(directory, urls) {
  if (!fs.existsSync(directory)) return;

  for (const item of fs.readdirSync(directory, {
    withFileTypes: true
  })) {
    const fullPath = path.join(directory, item.name);
    const relative = path.relative(PUBLIC_DIR, fullPath)
      .split(path.sep)
      .join("/");

    if (item.isDirectory()) {
      collectPublicPages(fullPath, urls);
      continue;
    }

    if (!item.isFile() || !item.name.toLowerCase().endsWith(".html")) {
      continue;
    }

    if (isExcluded(item.name, relative)) {
      console.log("SKIPPED:", relative);
      continue;
    }

    const content = fs.readFileSync(fullPath, "utf8");

    if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(content)) {
      console.log("NOINDEX - SKIPPED:", relative);
      continue;
    }

    let urlPath = "/" + relative;

    if (item.name.toLowerCase() === "index.html") {
      urlPath = relative === "index.html"
        ? "/"
        : "/" + path.dirname(relative) + "/";
    }

    urls.add(BASE + urlPath);
  }
}

async function getUploadedSongUrls() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log("INFO: Supabase haijasanidiwa kwenye mazingira haya.");
    return [];
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const urls = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage
      .from("drack-media")
      .list("", {
        limit,
        offset,
        sortBy: {
          column: "created_at",
          order: "desc"
        }
      });

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const file of data) {
      if (!file.name) continue;

      const metadata = readUploadedSongMetadata(file.name);
      if (!metadata || !metadata.title) continue;

      const songSlug = slug(metadata.title, metadata.artist);

      if (songSlug) {
        urls.push(`${BASE}/uploaded-music/${songSlug}`);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return urls;
}

async function main() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    throw new Error("Folder la public halipo.");
  }

  const urls = new Set([
    BASE + "/",
    BASE + "/music"
  ]);

  // Kusanya kurasa zote za HTML zilizopo public.
  collectPublicPages(PUBLIC_DIR, urls);

  // Ongeza kurasa za katalogi ya muziki.
  const musicFile = path.join(__dirname, "music-data.json");

  if (fs.existsSync(musicFile)) {
    const songs = JSON.parse(fs.readFileSync(musicFile, "utf8"));

    for (const song of songs) {
      const songSlug = slug(song.title, song.artist);

      if (songSlug) {
        urls.add(`${BASE}/music/${songSlug}`);
      }
    }
  }

  // Ongeza nyimbo zilizopakiwa Supabase.
  try {
    const uploadedUrls = await getUploadedSongUrls();

    for (const url of uploadedUrls) {
      urls.add(url);
    }

    console.log("Nyimbo za Supabase:", uploadedUrls.length);
  } catch (error) {
    console.error("ONYO SUPABASE:", error.message);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls].sort().map(url => `  <url>
    <loc>${escapeXml(url)}</loc>
  </url>`).join("\n")}
</urlset>`;

  fs.writeFileSync(OUTPUT, xml, "utf8");

  console.log("--------------------------------");
  console.log("DRACK HUB SITEMAP IMETENGENEZWA");
  console.log("JUMLA YA URL:", urls.size);
  console.log("--------------------------------");
}

main().catch(error => {
  console.error("SITEMAP ERROR:", error);
  process.exitCode = 1;
});
