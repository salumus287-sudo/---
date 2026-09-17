const fs = require("fs");
const path = require("path");

module.exports = function registerDrackPlusDownloads(app) {
  const MEDIA_DIR = path.join(__dirname, "public", "authorized-media");
  const DATA_FILE = path.join(__dirname, "authorized-media.json");

  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
  }

  function loadMedia() {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  app.get("/api/drack-plus-music/downloads", (req, res) => {
    const media = loadMedia();

    const result = media.map(item => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      artwork: item.artwork || "",
      audio: Array.isArray(item.audio) ? item.audio : [],
      video: Array.isArray(item.video) ? item.video : []
    }));

    res.json({
      ok: true,
      count: result.length,
      items: result
    });
  });

  app.get("/api/drack-plus-music/download-options/:id", (req, res) => {
    const media = loadMedia();
    const item = media.find(x => String(x.id) === String(req.params.id));

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "Media haipatikani kwenye authorized catalog."
      });
    }

    res.json({
      ok: true,
      title: item.title,
      artist: item.artist,
      audio: Array.isArray(item.audio) ? item.audio : [],
      video: Array.isArray(item.video) ? item.video : []
    });
  });

  app.get("/drack-plus-music/download/:id", (req, res) => {
    const media = loadMedia();
    const item = media.find(x => String(x.id) === String(req.params.id));

    if (!item) {
      return res.status(404).send("Media haipatikani.");
    }

    const type = req.query.type === "video" ? "video" : "audio";
    const quality = String(req.query.quality || "");

    const list = type === "video" ? item.video : item.audio;
    const selected = list.find(x => String(x.quality) === quality);

    if (!selected || !selected.file) {
      return res.status(404).send("Quality/file haipatikani.");
    }

    const safeFile = path.basename(selected.file);
    const filePath = path.join(MEDIA_DIR, safeFile);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File haipo kwenye server.");
    }

    const ext = path.extname(filePath).toLowerCase();

    const mime = {
      ".mp3": "audio/mpeg",
      ".m4a": "audio/mp4",
      ".wav": "audio/wav",
      ".mp4": "video/mp4",
      ".webm": "video/webm"
    }[ext] || "application/octet-stream";

    const downloadName =
      `${item.artist} - ${item.title} - ${quality}${ext}`
        .replace(/[\/\\:*?"<>|]/g, "_");

    res.setHeader("Content-Type", mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadName}"`
    );

    res.sendFile(filePath);
  });

  app.get("/drack-plus-music/download-manager", (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DRACK+ Download Manager</title>

<style>
*{box-sizing:border-box}
body{
margin:0;
font-family:Arial,sans-serif;
background:#080808;
color:#fff;
}
.header{
padding:18px;
background:linear-gradient(135deg,#111,#220000);
border-bottom:1px solid #333;
}
.header h1{
margin:0;
font-size:22px;
}
.header p{
margin:7px 0 0;
color:#aaa;
font-size:13px;
}
.wrap{
max-width:900px;
margin:auto;
padding:15px;
}
.card{
background:#111;
border:1px solid #292929;
border-radius:16px;
padding:14px;
margin-bottom:12px;
}
.row{
display:flex;
gap:12px;
align-items:center;
}
.cover{
width:65px;
height:65px;
border-radius:10px;
object-fit:cover;
background:#222;
}
.info{
flex:1;
min-width:0;
}
.title{
font-weight:bold;
font-size:16px;
white-space:nowrap;
overflow:hidden;
text-overflow:ellipsis;
}
.artist{
color:#aaa;
font-size:13px;
margin-top:5px;
}
button{
border:0;
border-radius:10px;
padding:11px 14px;
font-weight:bold;
cursor:pointer;
}
.download{
background:#d60000;
color:white;
}
.option{
margin-top:12px;
padding-top:12px;
border-top:1px solid #292929;
}
.option button{
margin:5px 5px 0 0;
background:#222;
color:white;
border:1px solid #444;
}
.option button:hover{
background:#333;
}
.badge{
display:inline-block;
font-size:11px;
padding:4px 7px;
border-radius:8px;
background:#222;
color:#aaa;
margin-top:6px;
}
.empty{
text-align:center;
padding:50px 20px;
color:#888;
}
.note{
font-size:12px;
color:#888;
line-height:1.5;
margin-top:18px;
}
.progress{
height:7px;
background:#222;
border-radius:10px;
overflow:hidden;
margin-top:10px;
display:none;
}
.progress span{
display:block;
height:100%;
width:0%;
background:#e00000;
}
</style>
</head>

<body>

<div class="header">
<h1>🎧 DRACK+ DOWNLOAD MANAGER</h1>
<p>Audio • Video • Quality • Size</p>
</div>

<div class="wrap">

<div id="list">
<div class="empty">⏳ Inapakia media...</div>
</div>

<div class="note">
🔒 Downloads kwenye sehemu hii ni za media ambazo zimeongezwa kwenye
DRACK HUB authorized catalog na zina ruhusa ya kusambazwa.
</div>

</div>

<script>
async function loadDownloads(){
  const box=document.getElementById("list");

  try{
    const r=await fetch("/api/drack-plus-music/downloads");
    const data=await r.json();

    if(!data.ok || !data.items.length){
      box.innerHTML=
        '<div class="empty">📂 Hakuna media iliyo kwenye authorized download catalog bado.</div>';
      return;
    }

    box.innerHTML=data.items.map(item=>{
      const art=item.artwork
        ? '<img class="cover" src="'+esc(item.artwork)+'">'
        : '<div class="cover"></div>';

      return \`
      <div class="card">
        <div class="row">
          \${art}
          <div class="info">
            <div class="title">\${esc(item.title)}</div>
            <div class="artist">\${esc(item.artist)}</div>
            <span class="badge">AUTHORIZED MEDIA</span>
          </div>
          <button class="download"
            onclick="showOptions('\${esc(item.id)}')">
            📥
          </button>
        </div>

        <div id="options-\${esc(item.id)}"></div>
      </div>
      \`;
    }).join("");

  }catch(e){
    box.innerHTML=
      '<div class="empty">❌ Imeshindikana kupakia download catalog.</div>';
  }
}

async function showOptions(id){
  const box=document.getElementById("options-"+id);

  if(box.innerHTML){
    box.innerHTML="";
    return;
  }

  box.innerHTML='<div class="option">⏳ Inapakia options...</div>';

  try{
    const r=await fetch(
      "/api/drack-plus-music/download-options/"+encodeURIComponent(id)
    );

    const data=await r.json();

    if(!data.ok){
      box.innerHTML='<div class="option">❌ '+esc(data.error)+'</div>';
      return;
    }

    let html='<div class="option"><b>🎵 AUDIO</b><br>';

    if(data.audio.length){
      data.audio.forEach(x=>{
        html+=\`
        <button onclick="downloadFile('\${esc(id)}','audio','\${esc(x.quality)}')">
          🎵 \${esc(x.quality)} • \${esc(x.size || "")}
        </button>
        \`;
      });
    }else{
      html+="<small>Hakuna audio option.</small>";
    }

    html+="<br><br><b>🎬 VIDEO</b><br>";

    if(data.video.length){
      data.video.forEach(x=>{
        html+=\`
        <button onclick="downloadFile('\${esc(id)}','video','\${esc(x.quality)}')">
          🎬 \${esc(x.quality)} • \${esc(x.size || "")}
        </button>
        \`;
      });
    }else{
      html+="<small>Hakuna video option.</small>";
    }

    html+=\`
      <div class="progress" id="progress-\${esc(id)}">
        <span></span>
      </div>
    \`;

    box.innerHTML=html;

  }catch(e){
    box.innerHTML=
      '<div class="option">❌ Hitilafu wakati wa kupata options.</div>';
  }
}

function downloadFile(id,type,quality){
  const progress=document.getElementById("progress-"+id);

  if(progress){
    progress.style.display="block";
    const bar=progress.querySelector("span");

    let n=0;
    const timer=setInterval(()=>{
      n+=10;
      bar.style.width=n+"%";

      if(n>=90){
        clearInterval(timer);
      }
    },100);
  }

  const url=
    "/api/drack-plus-music/download/"
    +encodeURIComponent(id)
    +"?type="+encodeURIComponent(type)
    +"&quality="+encodeURIComponent(quality);

  window.location.href=url;

  setTimeout(()=>{
    if(progress){
      progress.style.display="none";
      progress.querySelector("span").style.width="0%";
    }
  },1500);
}

function esc(v){
 return String(v ?? "")
 .replace(/&/g,"&amp;")
 .replace(/</g,"&lt;")
 .replace(/>/g,"&gt;")
 .replace(/"/g,"&quot;")
 .replace(/'/g,"&#039;");
}

loadDownloads();
</script>

</body>
</html>`);
  });

  console.log("✅ DRACK+ DOWNLOAD MANAGER imeunganishwa.");
};
