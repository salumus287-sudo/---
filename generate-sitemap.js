"use strict";

const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const BASE = "https://drack-hub-gldg.onrender.com";
const BUCKET = "drack-media";

function slug(title, artist) {
  return String((artist || "") + " " + (title || ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  })[char]);
}

function readUploadedSongMetadata(fileName) {
  const ext = require("path").extname(fileName);
  const marker = fileName.indexOf("--");

  if (marker < 0) return null;

  try {
    const token = fileName.slice(marker + 2, fileName.length - ext.length);
    const metadata = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8")
    );

    if (!metadata || typeof metadata.title !== "string") return null;

    const title = metadata.title.trim();
    const artist =
      typeof metadata.artist === "string" ? metadata.artist.trim() : "";

    if (!title) return null;

    return { title, artist };
  } catch {
    return null;
  }
}

async function getUploadedSongUrls() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log(
      "INFO: Supabase haijasanidiwa kwenye mazingira haya; sitemap itaendelea na katalogi iliyopo."
    );
    return [];
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const urls = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list("", {
        limit: 1000,
        offset,
        sortBy: { column: "created_at", order: "desc" }
      });

    if (error) throw error;

    const files = data || [];

    for (const file of files) {
      if (
        !file.name ||
        !/\.(mp3|m4a|aac|ogg|wav|flac|opus|wma)$/i.test(file.name)
      ) {
        continue;
      }

      const metadata = readUploadedSongMetadata(file.name);
      if (!metadata) continue;

      const songSlug = slug(metadata.title, metadata.artist);
      if (songSlug) {
        urls.push(`${BASE}/uploaded-music/${songSlug}`);
      }
    }

    if (files.length < 1000) break;
    offset += files.length;
  }

  return urls;
}

async function main() {
  const songs = JSON.parse(
    fs.readFileSync("./music-data.json", "utf8")
  );

  const urls = new Set([
    `${BASE}/`,
    `${BASE}/music`
  ]);

  for (const song of songs) {
    const songSlug = slug(song.title, song.artist);
    if (songSlug) {
      urls.add(`${BASE}/music/${songSlug}`);
    }
  }

  try {
    const uploadedUrls = await getUploadedSongUrls();

    for (const url of uploadedUrls) {
      urls.add(url);
    }

    console.log(`INFO: Nyimbo zilizopakiwa zilizoongezwa: ${uploadedUrls.length}`);
  } catch (error) {
    console.error(
      "ONYO: Imeshindikana kusoma nyimbo za Supabase; katalogi ya zamani itahifadhiwa.",
      error.message
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls].map(url => `  <url>
    <loc>${escapeXml(url)}</loc>
  </url>`).join("\n")}
</urlset>`;

  fs.writeFileSync("./public/sitemap.xml", xml);

  console.log(`SAWA: Sitemap imetengenezwa; jumla ya URL: ${urls.size}`);
}

main().catch(error => {
  console.error("HATUA IMESHINDWA:", error.message);
  process.exitCode = 1;
});
