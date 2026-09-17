const https = require("https");

const MUSICCLOUD_API = "https://api.musiccloud.io";

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function musicCloudRequest(path, body) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.MUSICCLOUD_API_KEY;

    if (!apiKey) {
      return reject(new Error("MUSICCLOUD_API_KEY haipo kwenye .env"));
    }

    const payload = JSON.stringify(body);

    const request = https.request(
      MUSICCLOUD_API + path,
      {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "User-Agent": "DRACK-HUB/2.0"
        }
      },
      response => {
        let data = "";

        response.on("data", chunk => {
          data += chunk;
        });

        response.on("end", () => {
          try {
            const json = JSON.parse(data);

            if (response.statusCode < 200 || response.statusCode >= 300) {
              return reject(
                new Error(
                  json?.message ||
                  json?.error ||
                  `MusicCloud HTTP ${response.statusCode}`
                )
              );
            }

            resolve(json);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

async function searchMusicCloud(query) {
  const data = await musicCloudRequest("/api/v1/cc/resolve", {
    query: query
  });

  const tracks = [];

  function addTrack(track) {
    if (!track || !track.jamendoId) return;

    const id = String(track.jamendoId);

    if (tracks.some(item => item.jamendoId === id)) return;

    tracks.push({
      id,
      jamendoId: id,
      title: track.title || "Unknown Track",
      artist: track.artistName || "Unknown Artist",
      album: track.albumName || "",
      artwork: track.artworkUrl || "",
      duration: track.durationMs || 0,
      license: track.licenseCcurl || "",
      downloadAllowed: track.downloadAllowed === true,
      downloadUrl: track.downloadUrl || "",
      shareUrl: track.shareUrl || "",
      audioUrl:
        `${MUSICCLOUD_API}/api/v1/cc/audio/${encodeURIComponent(id)}?format=mp32`,
      downloadApiUrl:
        `${MUSICCLOUD_API}/api/v1/cc/download/${encodeURIComponent(id)}?format=mp32`
    });
  }

  if (data?.track) {
    addTrack(data.track);
  }

  if (Array.isArray(data?.candidates)) {
    for (const candidate of data.candidates) {
      if (candidate?.track) addTrack(candidate.track);
    }
  }

  if (Array.isArray(data?.tracks)) {
    for (const track of data.tracks) {
      addTrack(track);
    }
  }

  return tracks;
}

module.exports = function registerDrackPlusMusic(app) {

  app.get("/api/drack-plus-music/search", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();

      if (!q) {
        return res.json({
          ok: true,
          results: []
        });
      }

      const results = await searchMusicCloud(q);

      res.json({
        ok: true,
        source: "MusicCloud Creative Commons / Jamendo",
        query: q,
        results
      });

    } catch (error) {
      console.error(
        "DRACK+ MUSIC SEARCH ERROR:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message || "Music search failed"
      });
    }
  });

  app.get("/drack-plus-music", (req, res) => {

    res.send(`<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"
>

<title>DRACK+ MUSIC</title>

<style>

*{
  box-sizing:border-box;
}

html,
body{
  margin:0;
  padding:0;
  width:100%;
  min-height:100%;
  background:#080808;
  color:#fff;
  font-family:Arial,Helvetica,sans-serif;
}

body{
  overflow-x:hidden;
}

.header{
  position:sticky;
  top:0;
  z-index:50;
  background:#090909;
  border-bottom:1px solid #252525;
  padding:14px;
}

.top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}

.logo{
  font-size:20px;
  font-weight:800;
}

.back{
  color:#aaa;
  text-decoration:none;
  font-size:13px;
}

.container{
  width:min(100%,900px);
  margin:auto;
  padding:18px 14px 160px;
}

.hero{
  text-align:center;
  padding:18px 0 20px;
}

.hero h1{
  margin:0;
  font-size:28px;
}

.hero p{
  color:#999;
  font-size:13px;
}

.search{
  display:grid;
  grid-template-columns:1fr 110px;
  gap:8px;
}

.search input{
  width:100%;
  padding:14px;
  border-radius:10px;
  border:1px solid #333;
  background:#111;
  color:#fff;
  outline:none;
}

.search button{
  border:0;
  border-radius:10px;
  background:#fff;
  color:#000;
  font-weight:800;
}

.quick{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
  margin-top:10px;
}

.quick button{
  background:#151515;
  color:#ddd;
  border:1px solid #292929;
  padding:7px 10px;
  border-radius:999px;
}

#status{
  color:#aaa;
  font-size:13px;
  margin:18px 0 10px;
}

.card{
  background:#111;
  border:1px solid #252525;
  border-radius:14px;
  padding:12px;
  margin:10px 0;
}

.card-main{
  display:flex;
  gap:12px;
  align-items:center;
}

.cover{
  width:70px;
  height:70px;
  border-radius:10px;
  object-fit:cover;
  background:#222;
}

.info{
  min-width:0;
  flex:1;
}

.title{
  font-size:15px;
  font-weight:800;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.artist{
  color:#aaa;
  margin-top:5px;
  font-size:13px;
}

.meta{
  color:#777;
  margin-top:5px;
  font-size:11px;
}

.actions{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
  margin-top:12px;
}

.actions button,
.actions a{
  border:1px solid #333;
  background:#181818;
  color:#fff;
  padding:9px 11px;
  border-radius:9px;
  text-decoration:none;
  font-size:12px;
}

.actions .play{
  background:#fff;
  color:#000;
  font-weight:800;
}

.empty{
  text-align:center;
  padding:35px 15px;
  color:#777;
}

.player{
  position:fixed;
  left:0;
  right:0;
  bottom:0;
  z-index:100;
  background:#0d0d0d;
  border-top:1px solid #333;
  padding:12px;
  display:none;
  box-shadow:0 -8px 30px rgba(0,0,0,.5);
}

.player.show{
  display:block;
}

.player-top{
  display:flex;
  align-items:center;
  gap:10px;
  margin-bottom:8px;
}

.player-art{
  width:46px;
  height:46px;
  border-radius:8px;
  object-fit:cover;
  background:#222;
}

.player-info{
  flex:1;
  min-width:0;
}

.player-title{
  font-size:13px;
  font-weight:800;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.player-sub{
  color:#888;
  font-size:11px;
  margin-top:3px;
}

.close{
  border:0;
  background:#222;
  color:#fff;
  border-radius:8px;
  padding:8px 10px;
}

audio{
  width:100%;
  height:42px;
}

.player-tools{
  display:flex;
  gap:7px;
  margin-top:8px;
}

.player-tools button,
.player-tools a{
  flex:1;
  text-align:center;
  border:1px solid #333;
  background:#181818;
  color:#fff;
  padding:8px;
  border-radius:8px;
  text-decoration:none;
  font-size:12px;
}

.note{
  margin-top:18px;
  padding:12px;
  border:1px solid #222;
  border-radius:10px;
  color:#777;
  font-size:11px;
  line-height:1.5;
}

</style>
</head>

<body>

<header class="header">

  <div class="top">

    <div class="logo">
      🎵 DRACK+ MUSIC
    </div>

    <a class="back" href="/">
      ← DRACK HUB
    </a>

  </div>

</header>

<main class="container">

  <section class="hero">

    <h1>DRACK+ MUSIC</h1>

    <p>
      Full-length Creative Commons audio
    </p>

  </section>

  <div class="search">

    <input
      id="searchInput"
      type="search"
      placeholder="Tafuta wimbo au msanii..."
      autocomplete="off"
    >

    <button onclick="searchMusic()">
      SEARCH
    </button>

  </div>

  <div class="quick">

    <button onclick="quickSearch('africa')">
      Africa
    </button>

    <button onclick="quickSearch('hip hop')">
      Hip Hop
    </button>

    <button onclick="quickSearch('afrobeat')">
      Afrobeat
    </button>

    <button onclick="quickSearch('reggae')">
      Reggae
    </button>

    <button onclick="quickSearch('instrumental')">
      Instrumental
    </button>

  </div>

  <div id="status">
    Andika jina la wimbo au msanii.
  </div>

  <section id="results"></section>

  <div class="note">
    🎧 DRACK+ MUSIC hutumia Creative Commons/Jamendo
    kwa full-length audio. Nyimbo zinazoonekana hapa
    zinategemea catalogue na ruhusa za chanzo.
    Download itaonekana tu pale track inaporuhusiwa.
  </div>

</main>

<div id="player" class="player">

  <div class="player-top">

    <img id="playerArt" class="player-art" src="" alt="">

    <div class="player-info">

      <div id="playerTitle" class="player-title">
        DRACK PLAYER
      </div>

      <div id="playerArtist" class="player-sub">
        Audio only
      </div>

    </div>

    <button class="close" onclick="closePlayer()">
      ✕
    </button>

  </div>

  <audio
    id="audioPlayer"
    controls
    preload="none"
  ></audio>

  <div class="player-tools">

    <button id="qualityBtn" onclick="changeQuality()">
      QUALITY: 256K
    </button>

    <a
      id="downloadBtn"
      href="#"
      target="_blank"
      rel="noopener"
      style="display:none"
    >
      ⬇ DOWNLOAD
    </a>

  </div>

</div>

<script>

const input =
  document.getElementById("searchInput");

const results =
  document.getElementById("results");

const statusBox =
  document.getElementById("status");

const audio =
  document.getElementById("audioPlayer");

let currentSong = null;

let currentQuality = "mp32";

function escapeHTML(value){

  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");

}

function quickSearch(value){

  input.value = value;

  searchMusic();

}

async function searchMusic(){

  const q = input.value.trim();

  if(!q){

    statusBox.textContent =
      "Andika jina la wimbo au msanii.";

    return;

  }

  statusBox.textContent =
    "🔎 Inatafuta full audio: " + q + "...";

  results.innerHTML = "";

  try{

    const response = await fetch(
      "/api/drack-plus-music/search?q=" +
      encodeURIComponent(q)
    );

    const data = await response.json();

    if(!data.ok){

      throw new Error(
        data.error || "Search failed"
      );

    }

    if(!data.results.length){

      results.innerHTML =
        '<div class="empty">' +
        'Hakuna Creative Commons tracks zilizopatikana.' +
        '</div>';

      statusBox.textContent =
        "Hakuna full tracks zilizopatikana.";

      return;

    }

    statusBox.textContent =
      data.results.length +
      " full tracks zimepatikana.";

    data.results.forEach(song => {

      const card =
        document.createElement("article");

      card.className = "card";

      const artwork =
        song.artwork ||
        "https://via.placeholder.com/300?text=DRACK";

      const download =
        song.downloadAllowed
          ? '<a href="' +
            escapeHTML(song.downloadApiUrl) +
            '" target="_blank" rel="noopener">' +
            '⬇ DOWNLOAD' +
            '</a>'
          : "";

      card.innerHTML =

        '<div class="card-main">' +

          '<img class="cover" src="' +
            escapeHTML(artwork) +
            '" alt="">' +

          '<div class="info">' +

            '<div class="title">' +
              escapeHTML(song.title) +
            '</div>' +

            '<div class="artist">' +
              escapeHTML(song.artist) +
            '</div>' +

            '<div class="meta">' +
              escapeHTML(song.album || "Creative Commons") +
            '</div>' +

          '</div>' +

        '</div>' +

        '<div class="actions">' +

          '<button class="play" onclick="playAudio(' +
            JSON.stringify(song).replace(/"/g,"&quot;") +
          ')">' +

            '▶️ PLAY FULL' +

          '</button>' +

          download +

          (song.license
            ? '<a href="' +
              escapeHTML(song.license) +
              '" target="_blank" rel="noopener">' +
              '📜 LICENSE' +
              '</a>'
            : "") +

          (song.shareUrl
            ? '<a href="' +
              escapeHTML(song.shareUrl) +
              '" target="_blank" rel="noopener">' +
              '🔗 SOURCE' +
              '</a>'
            : "") +

        '</div>';

      results.appendChild(card);

    });

  }catch(error){

    console.error(
      "DRACK+ MUSIC:",
      error
    );

    statusBox.textContent =
      "❌ Search imekataa.";

    results.innerHTML =
      '<div class="empty">' +
      '❌ ' +
      escapeHTML(error.message) +
      '</div>';

  }

}

function openPlayer(song){

  currentSong = song;

  document
    .getElementById("player")
    .classList.add("show");

  document
    .getElementById("playerTitle")
    .textContent =
      song.title || "DRACK PLAYER";

  document
    .getElementById("playerArtist")
    .textContent =
      (song.artist || "Unknown Artist") +
      " • FULL AUDIO";

  document
    .getElementById("playerArt")
    .src =
      song.artwork || "";

  updateDownload(song);

}

function updateDownload(song){

  const button =
    document.getElementById("downloadBtn");

  if(song.downloadAllowed){

    button.href =
      song.downloadApiUrl +
      "&format=" +
      encodeURIComponent(currentQuality);

    button.style.display =
      "block";

  }else{

    button.style.display =
      "none";

  }

}

function playAudio(song){

  openPlayer(song);

  currentQuality = "mp32";

  document
    .getElementById("qualityBtn")
    .textContent =
      "QUALITY: 256K";

  audio.src =
    song.audioUrl;

  audio.load();

  audio.play().catch(() => {});

}

function changeQuality(){

  if(!currentSong) return;

  const wasPlaying =
    !audio.paused;

  const position =
    audio.currentTime || 0;

  currentQuality =
    currentQuality === "mp32"
      ? "mp31"
      : "mp32";

  document
    .getElementById("qualityBtn")
    .textContent =
      currentQuality === "mp32"
        ? "QUALITY: 256K"
        : "QUALITY: 96K";

  audio.src =
    "https://api.musiccloud.io/api/v1/cc/audio/" +
    encodeURIComponent(currentSong.jamendoId) +
    "?format=" +
    encodeURIComponent(currentQuality);

  audio.load();

  audio.currentTime = position;

  if(wasPlaying){

    audio.play().catch(() => {});

  }

  updateDownload(currentSong);

}

function closePlayer(){

  audio.pause();

  audio.removeAttribute("src");

  audio.load();

  document
    .getElementById("player")
    .classList.remove("show");

  currentSong = null;

}

input.addEventListener(
  "keydown",
  event => {

    if(event.key === "Enter"){

      searchMusic();

    }

  }
);

</script>

</body>
</html>`);

  });

  console.log("========================================");
  console.log("✅ DRACK+ MUSIC AUDIO-ONLY READY");
  console.log("🎧 MusicCloud Creative Commons");
  console.log("🎵 Full-length audio");
  console.log("🚫 Video removed");
  console.log("========================================");
};
