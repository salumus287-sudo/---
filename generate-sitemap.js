const fs = require("fs");

const BASE = "https://drack-hub-gldg.onrender.com";

function slug(title, artist) {
  return String(artist + " " + title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const songs = JSON.parse(
  fs.readFileSync("./music-data.json", "utf8")
);

const urls = [
  `${BASE}/`,
  `${BASE}/music`
];

for (const song of songs) {
  urls.push(`${BASE}/music/${slug(song.title, song.artist)}`);
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url}</loc>
  </url>`).join("\n")}
</urlset>
`;

fs.writeFileSync("./public/sitemap.xml", xml);

console.log(`✅ Sitemap generated: ${urls.length} URLs`);
