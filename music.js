const musicData = require("./music-data.json");

function musicSlug(title, artist) {
  return String(artist + " " + title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function registerMusic(app) {

  app.get("/api/music", (req, res) => {
    const q = String(req.query.q || "").trim().toLowerCase();

    let songs = musicData;

    if (q) {
      songs = musicData.filter(song =>
        String(song.title || "").toLowerCase().includes(q) ||
        String(song.artist || "").toLowerCase().includes(q) ||
        String(song.genre || "").toLowerCase().includes(q)
      );
    }

    res.json({
      success: true,
      total: songs.length,
      songs: songs.map(song => ({
        ...song,
        slug: musicSlug(song.title, song.artist)
      }))
    });
  });

  app.get("/music", (req, res) => {

    const cards = musicData.map(song => {
      const slug = musicSlug(song.title, song.artist);

      return `
        <div style="
          background:#171717;
          padding:18px;
          margin:12px 0;
          border-radius:15px;
        ">
          <div style="font-size:42px">🎵</div>

          <h2>${esc(song.title)}</h2>

          <p>🎤 ${esc(song.artist)}</p>

          <p>
            ${esc(song.genre)} • ${esc(song.year)}
          </p>

          <a
            href="/music/${slug}"
            style="
              display:inline-block;
              background:#e50914;
              color:white;
              padding:10px 15px;
              border-radius:8px;
              text-decoration:none;
              font-weight:bold;
            "
          >
            ▶ FUNGUA WIMBO
          </a>
        </div>
      `;
    }).join("");

    res.send(`
<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>DRACK HUB MUSIC - Muziki Tanzania</title>

<meta name="description"
content="DRACK HUB MUSIC - Nyimbo, wasanii na taarifa za muziki.">

<meta name="robots" content="index,follow">

<link rel="canonical"
href="https://drack-hub-gldg.onrender.com/music">

<style>
body{
  margin:0;
  background:#090909;
  color:white;
  font-family:Arial,sans-serif;
}

main{
  max-width:850px;
  margin:auto;
  padding:20px;
}

a{
  color:white;
}

input{
  width:100%;
  padding:15px;
  box-sizing:border-box;
  border:0;
  border-radius:10px;
  background:#222;
  color:white;
  margin:15px 0;
}
</style>
</head>

<body>

<main>

<p>
<a href="/">← Rudi DRACK HUB</a>
</p>

<h1>🎵 DRACK HUB MUSIC</h1>

<p>Tafuta nyimbo na wasanii.</p>

<input
id="search"
placeholder="🔎 Tafuta wimbo au msanii..."
>

<div id="songs">
${cards}
</div>

<script>
const input = document.getElementById("search");
const songs = document.querySelectorAll("#songs > div");

input.addEventListener("input", function(){

  const q = this.value.toLowerCase();

  songs.forEach(song => {

    song.style.display =
      song.innerText.toLowerCase().includes(q)
      ? "block"
      : "none";

  });

});
</script>

</main>

</body>
</html>
`);
  });

  app.get("/music/:slug", (req, res) => {

    const slug = String(req.params.slug || "").toLowerCase();

    const song = musicData.find(
      item => musicSlug(item.title, item.artist) === slug
    );

    if (!song) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="sw">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport"
                content="width=device-width,initial-scale=1">
          <title>Music Haijapatikana - DRACK HUB</title>
        </head>

        <body style="
          background:#090909;
          color:white;
          font-family:Arial;
          padding:30px;
        ">

        <h1>🎵 Music haijapatikana</h1>

        <p>Wimbo huu haujapatikana DRACK HUB.</p>

        <a href="/music" style="color:#ff3333">
          ← Rudi DRACK MUSIC
        </a>

        </body>
        </html>
      `);
    }

    const title = esc(song.title);
    const artist = esc(song.artist);
    const genre = esc(song.genre);
    const year = esc(song.year);
    const description = esc(song.description);
    const source = esc(song.source);

    const canonical =
      "https://drack-hub-gldg.onrender.com/music/" +
      musicSlug(song.title, song.artist);

    res.send(`
<!DOCTYPE html>
<html lang="sw">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>${title} - ${artist} | DRACK HUB</title>

<meta
name="description"
content="${title} - ${artist}. ${description}"
>

<meta name="robots"
content="index,follow">

<link
rel="canonical"
href="${canonical}"
>

<meta
property="og:title"
content="${title} - ${artist} | DRACK HUB"
>

<meta
property="og:description"
content="${description}"
>

<meta
property="og:type"
content="music.song"
>

<style>

body{
  margin:0;
  background:#090909;
  color:white;
  font-family:Arial,sans-serif;
}

main{
  max-width:850px;
  margin:auto;
  padding:20px;
}

.card{
  margin-top:20px;
  background:#181818;
  border-radius:20px;
  padding:30px;
  text-align:center;
}

.icon{
  font-size:70px;
}

h1{
  font-size:34px;
}

.artist{
  font-size:20px;
  opacity:.8;
}

.tag{
  display:inline-block;
  background:#e50914;
  padding:7px 12px;
  border-radius:20px;
  margin:5px;
}

.description{
  line-height:1.7;
  opacity:.9;
}

.listen{
  display:inline-block;
  background:#e50914;
  color:white;
  text-decoration:none;
  padding:14px 22px;
  border-radius:10px;
  font-weight:bold;
  margin-top:15px;
}

</style>

</head>

<body>

<main>

<p>
<a href="/music"
style="color:white">
← Rudi DRACK MUSIC
</a>
</p>

<div class="card">

<div class="icon">🎵</div>

<h1>${title}</h1>

<div class="artist">
🎤 ${artist}
</div>

<div>
<span class="tag">${genre}</span>
<span class="tag">${year}</span>
</div>

<p class="description">
${description}
</p>

<a
class="listen"
href="${source}"
target="_blank"
rel="noopener noreferrer"
>
▶ TAZAMA / SIKILIZA
</a>

</div>

</main>

</body>
</html>
`);
  });

  app.get("/music-sitemap.xml", (req, res) => {

    const urls = musicData.map(song => {

      const slug =
        musicSlug(song.title, song.artist);

      return `
<url>
  <loc>
    https://drack-hub-gldg.onrender.com/music/${slug}
  </loc>
</url>`;

    }).join("");

    res.type("application/xml").send(`
<?xml version="1.0" encoding="UTF-8"?>

<urlset
xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

<url>
<loc>https://drack-hub-gldg.onrender.com/music</loc>
</url>

${urls}

</urlset>
`);
  });

}

module.exports = registerMusic;
