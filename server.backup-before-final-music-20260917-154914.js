require("dotenv").config();

const express = require("express");
const path = require("path");
const { importAllNews } = require("./dailynews-import");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ===============================
// DATABASE
// ===============================

let pool = null;

if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    pool.on("error", (err) => {
        console.error("DATABASE ERROR:", err.message);
    });
}

// ===============================
// WEBSITE
// ===============================

app.use(express.static(path.join(__dirname, "public")));

// ===============================
// API HEALTH
// ===============================


// ============================================================
// DRACK VISITOR TRACKER API
// ============================================================

app.post("/api/visitor/track", async (req, res) => {

    if (!pool) {
        return res.json({
            success: true,
            tracked: false
        });
    }

    try {

        const visitorId = String(req.body.visitorId || "").trim();

        if (!visitorId || visitorId.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Visitor ID si sahihi."
            });
        }

        await pool.query(`
            INSERT INTO visitors
                (visitor_id, first_seen, last_seen, visits)
            VALUES
                ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
            ON CONFLICT (visitor_id)
            DO UPDATE SET
                last_seen = CURRENT_TIMESTAMP,
                visits = visitors.visits + 1
        `, [visitorId]);

        res.json({
            success: true,
            tracked: true
        });

    } catch (error) {

        console.error("VISITOR TRACK ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Imeshindwa kurekodi visitor."
        });
    }
});

app.get("/api/health", async (req, res) => {
    let database = "NOT_CONNECTED";

    if (pool) {
        try {
            await pool.query("SELECT 1");
            database = "CONNECTED";
        } catch (error) {
            database = "ERROR";
        }
    }

    res.json({
        success: true,
        app: "DRACK HUB",
        status: "ONLINE",
        database,
        time: new Date().toISOString()
    });
});

// ===============================
// POSTS
// ===============================

app.get("/api/live-scores", async (req, res) => {
    if (!process.env.API_FOOTBALL_KEY) {
        return res.status(500).json({
            success: false,
            message: "API_FOOTBALL_KEY haijawekwa."
        });
    }

    try {
        const https = require("https");

        const data = await new Promise((resolve, reject) => {
            const request = https.request(
                "https://v3.football.api-sports.io/fixtures?live=all",
                {
                    method: "GET",
                    headers: {
                        "x-apisports-key": process.env.API_FOOTBALL_KEY
                    }
                },
                (response) => {
                    let body = "";

                    response.on("data", chunk => {
                        body += chunk;
                    });

                    response.on("end", () => {
                        try {
                            resolve({
                                status: response.statusCode,
                                data: JSON.parse(body)
                            });
                        } catch (error) {
                            reject(error);
                        }
                    });
                }
            );

            request.on("error", reject);
            request.end();
        });

        if (data.status !== 200) {
            return res.status(data.status || 500).json({
                success: false,
                message: "API-Football imerudisha error.",
                error: data.data
            });
        }

        const matches = (data.data.response || []).map(match => ({
            fixture_id: match.fixture?.id,
            status: match.fixture?.status?.short,
            elapsed: match.fixture?.status?.elapsed,
            league: {
                id: match.league?.id,
                name: match.league?.name,
                logo: match.league?.logo
            },
            home: {
                id: match.teams?.home?.id,
                name: match.teams?.home?.name,
                logo: match.teams?.home?.logo,
                score: match.goals?.home
            },
            away: {
                id: match.teams?.away?.id,
                name: match.teams?.away?.name,
                logo: match.teams?.away?.logo,
                score: match.goals?.away
            }
        }));

        res.json({
            success: true,
            count: matches.length,
            matches
        });

    } catch (error) {
        console.error("LIVE SCORES ERROR:", error.message);

        res.status(500).json({
            success: false,
            message: "Imeshindwa kupata live scores.",
            error: error.message
        });
    }
});


// ============================================================
// DRACK HUB - LIVE LEAGUE TABLE
// ============================================================

app.get("/api/league-table", async (req, res) => {

    if (!process.env.API_FOOTBALL_KEY) {
        return res.status(500).json({
            success: false,
            message: "API_FOOTBALL_KEY haijawekwa."
        });
    }

    const league = req.query.league || "39";
    const season = req.query.season || new Date().getFullYear();

    try {

        const https = require("https");

        const data = await new Promise((resolve, reject) => {

            const url =
                "https://v3.football.api-sports.io/standings" +
                "?league=" + league +
                "&season=" + season;

            const request = https.request(url, {
                method: "GET",
                headers: {
                    "x-apisports-key":
                        process.env.API_FOOTBALL_KEY
                }
            }, response => {

                let body = "";

                response.on("data", chunk => {
                    body += chunk;
                });

                response.on("end", () => {

                    try {
                        resolve({
                            status: response.statusCode,
                            data: JSON.parse(body)
                        });
                    } catch (error) {
                        reject(error);
                    }

                });

            });

            request.on("error", reject);
            request.end();

        });

        if (data.status !== 200) {
            return res.status(data.status || 500).json({
                success: false,
                message: "API-Football error.",
                error: data.data
            });
        }

        const standings =
            data.data?.response?.[0]?.league?.standings?.[0] || [];

        const leagueName =
            data.data?.response?.[0]?.league?.name ||
            "League Table";

        const table = standings.map(team => ({
            rank: team.rank,
            name: team.team?.name,
            logo: team.team?.logo,
            played: team.all?.played || 0,
            win: team.all?.win || 0,
            draw: team.all?.draw || 0,
            loss: team.all?.lose || 0,
            goalDiff: team.goalsDiff || 0,
            points: team.points || 0
        }));

        res.json({
            success: true,
            league: leagueName,
            table
        });

    } catch (error) {

        console.error(
            "LIVE TABLE ERROR:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Imeshindwa kupata msimamo.",
            error: error.message
        });

    }

});


// ============================================================
// DRACK HUB - FIXTURES
// ============================================================

app.get("/api/fixtures", async (req, res) => {
    if (!process.env.API_FOOTBALL_KEY) {
        return res.status(500).json({
            success: false,
            message: "API_FOOTBALL_KEY haijawekwa."
        });
    }

    const league = req.query.league || "39";
    const season = req.query.season || "2026";

    try {
        const https = require("https");

        const url =
            "https://v3.football.api-sports.io/fixtures" +
            "?league=" + encodeURIComponent(league) +
            "&season=" + encodeURIComponent(season) +
            "&next=20";

        const data = await new Promise((resolve, reject) => {
            const request = https.request(url, {
                method: "GET",
                headers: {
                    "x-apisports-key": process.env.API_FOOTBALL_KEY
                }
            }, response => {
                let body = "";

                response.on("data", chunk => {
                    body += chunk;
                });

                response.on("end", () => {
                    try {
                        resolve({
                            status: response.statusCode,
                            data: JSON.parse(body)
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            request.setTimeout(15000, () => {
                request.destroy(new Error("API-Football timeout"));
            });

            request.on("error", reject);
            request.end();
        });

        if (data.status !== 200) {
            return res.status(data.status || 500).json({
                success: false,
                message: "API-Football error.",
                error: data.data
            });
        }

        const fixtures = (data.data.response || []).map(match => ({
            id: match.fixture?.id,
            date: match.fixture?.date,
            status: match.fixture?.status?.short,
            league: {
                id: match.league?.id,
                name: match.league?.name,
                logo: match.league?.logo
            },
            home: {
                id: match.teams?.home?.id,
                name: match.teams?.home?.name,
                logo: match.teams?.home?.logo
            },
            away: {
                id: match.teams?.away?.id,
                name: match.teams?.away?.name,
                logo: match.teams?.away?.logo
            }
        }));

        res.json({
            success: true,
            count: fixtures.length,
            fixtures
        });

    } catch (error) {
        console.error("FIXTURES ERROR:", error.message);

        res.status(500).json({
            success: false,
            message: "Imeshindwa kupata fixtures.",
            error: error.message
        });
    }
});;


app.get("/api/posts", async (req, res) => {
    if (!pool) {
        return res.json({
            success: true,
            posts: [],
            message: "Database haijaunganishwa bado."
        });
    }

    try {
        const result = await pool.query(`
            SELECT *
            FROM posts
            ORDER BY created_at DESC
        `);

        res.json({
            success: true,
            posts: result.rows
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Imeshindwa kupata posts."
        });
    }
});

// ===============================
// NEWS SOURCES
// ===============================

app.get("/api/sources", async (req, res) => {
    if (!pool) {
        return res.json({
            success: true,
            sources: []
        });
    }

    try {
        const result = await pool.query(`
            SELECT *
            FROM news_sources
            WHERE active = TRUE
            ORDER BY created_at DESC
        `);

        res.json({
            success: true,
            sources: result.rows
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Imeshindwa kupata sources."
        });
    }
});

// ===============================
// COMMENTS
// ===============================

app.get("/api/posts/:id/comments", async (req, res) => {
    if (!pool) {
        return res.json({
            success: true,
            comments: []
        });
    }

    try {
        const result = await pool.query(
            `
            SELECT *
            FROM comments
            WHERE post_id = $1
            ORDER BY created_at ASC
            `,
            [req.params.id]
        );

        res.json({
            success: true,
            comments: result.rows
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Imeshindwa kupata comments."
        });
    }
});

// ===============================
// DEFAULT ROUTE
// ===============================


app.get("/api/youtube-videos", async (req, res) => {
    if (!process.env.YOUTUBE_API_KEY) {
        return res.status(500).json({
            success: false,
            message: "YOUTUBE_API_KEY haijawekwa."
        });
    }

    const query = req.query.q || "Tanzania news sports";
    const maxResults = Math.min(
        Math.max(parseInt(req.query.limit || "12", 10), 1),
        50
    );

    try {
        const https = require("https");

        const url =
            "https://www.googleapis.com/youtube/v3/search" +
            "?part=snippet" +
            "&type=video" +
            "&order=date" +
            "&maxResults=" + maxResults +
            "&q=" + encodeURIComponent(query) +
            "&key=" + encodeURIComponent(process.env.YOUTUBE_API_KEY);

        const data = await new Promise((resolve, reject) => {
            const request = https.get(url, response => {
                let body = "";

                response.on("data", chunk => {
                    body += chunk;
                });

                response.on("end", () => {
                    try {
                        resolve({
                            status: response.statusCode,
                            data: JSON.parse(body)
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            request.setTimeout(15000, () => {
                request.destroy(new Error("YouTube API timeout"));
            });

            request.on("error", reject);
        });

        if (data.status !== 200) {
            return res.status(data.status || 500).json({
                success: false,
                message: "YouTube API error.",
                error: data.data
            });
        }

        const videos = (data.data.items || []).map(item => ({
            id: item.id?.videoId,
            title: item.snippet?.title,
            description: item.snippet?.description,
            channel: item.snippet?.channelTitle,
            publishedAt: item.snippet?.publishedAt,
            thumbnail:
                item.snippet?.thumbnails?.high?.url ||
                item.snippet?.thumbnails?.medium?.url ||
                item.snippet?.thumbnails?.default?.url,
            url: item.id?.videoId
                ? "https://www.youtube.com/watch?v=" + item.id.videoId
                : null
        }));

        res.json({
            success: true,
            count: videos.length,
            query,
            videos
        });

    } catch (error) {
        console.error("YOUTUBE ERROR:", error.message);

        res.status(500).json({
            success: false,
            message: "Imeshindwa kupata YouTube videos.",
            error: error.message
        });
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================

// ===============================
 // ADMIN COMMENTS
// ===============================

app.get("/api/admin/comments", async (req, res) => {
    if (!pool) {
        return res.status(503).json({
            success: false,
            message: "Database haijaunganishwa."
        });
    }

    try {
        const result = await pool.query(`
            SELECT
                c.id,
                c.post_id,
                c.name,
                c.content,
                c.created_at,
                p.title AS post_title,
                COALESCE(
                    (SELECT COUNT(*)
                     FROM comment_reactions r
                     WHERE r.comment_id = c.id
                     AND r.reaction = 'like'), 0
                ) AS likes,
                COALESCE(
                    (SELECT COUNT(*)
                     FROM comment_reactions r
                     WHERE r.comment_id = c.id
                     AND r.reaction = 'dislike'), 0
                ) AS dislikes,
                COALESCE(
                    (SELECT COUNT(*)
                     FROM comment_replies cr
                     WHERE cr.comment_id = c.id), 0
                ) AS replies
            FROM comments c
            LEFT JOIN posts p ON p.id = c.post_id
            ORDER BY c.created_at DESC
        `);

        res.json({
            success: true,
            comments: result.rows
        });

    } catch (error) {
        console.error("ADMIN COMMENTS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Imeshindwa kupata admin comments."
        });
    }
});


// ===============================
// START SERVER
// ===============================


async function startDailyNewsImporter() {
    try {
        await importAllNews();
        console.log("📰 Daily News auto-import: ONLINE");
    } catch (error) {
        console.error("❌ Daily News auto-import:", error.message);
    }
}

startDailyNewsImporter();

setInterval(() => {
    startDailyNewsImporter();
}, 10 * 60 * 1000);


// ==========================================
// DRACK COMMENTS API
// ==========================================

// GET COMMENTS + REPLIES + REACTIONS
app.get("/api/posts/:id/comments-full", async (req, res) => {

    if (!pool) {
        return res.status(503).json({
            success: false,
            message: "Database haijaunganishwa."
        });
    }

    try {

        const postId = Number(req.params.id);

        if (!Number.isInteger(postId) || postId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Post ID si sahihi."
            });
        }

        const result = await pool.query(`
            SELECT
                c.id,
                c.post_id,
                c.name,
                c.content,
                c.created_at,
                COALESCE(
                    (
                        SELECT COUNT(*)
                        FROM comment_reactions r
                        WHERE r.comment_id = c.id
                        AND r.reaction = 'like'
                    ), 0
                ) AS likes,
                COALESCE(
                    (
                        SELECT COUNT(*)
                        FROM comment_reactions r
                        WHERE r.comment_id = c.id
                        AND r.reaction = 'dislike'
                    ), 0
                ) AS dislikes
            FROM comments c
            WHERE c.post_id = $1
            ORDER BY c.created_at ASC
        `, [postId]);

        const comments = [];

        for (const row of result.rows) {

            const replies = await pool.query(`
                SELECT
                    id,
                    comment_id,
                    name,
                    content,
                    created_at
                FROM comment_replies
                WHERE comment_id = $1
                ORDER BY created_at ASC
            `, [row.id]);

            comments.push({
                ...row,
                likes: Number(row.likes),
                dislikes: Number(row.dislikes),
                replies: replies.rows
            });
        }

        res.json({
            success: true,
            comments
        });

    } catch (error) {

        console.error("COMMENTS GET ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Imeshindwa kupata comments.",
            error: error.message
        });
    }
});


// ADD COMMENT
app.post("/api/posts/:id/comments", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: "Database haijaunganishwa."
    });
  }

  try {
    const postId = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    const content = String(req.body.content || "").trim();

    if (!name || !content) {
      return res.status(400).json({
        success: false,
        message: "Jina na comment vinahitajika."
      });
    }

    if (name.length > 50 || content.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Comment imezidi urefu unaoruhusiwa."
      });
    }

    const result = await pool.query(`
      INSERT INTO comments (post_id, name, content)
      VALUES ($1, $2, $3)
      RETURNING id, post_id, name, content, created_at
    `, [postId, name, content]);

    res.json({
      success: true,
      comment: {
        ...result.rows[0],
        likes: 0,
        dislikes: 0,
        replies: []
      }
    });

  } catch (error) {
    console.error("COMMENT POST ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Imeshindwa kutuma comment."
    });
  }
});


// REPLY
app.post("/api/comments/:id/replies", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: "Database haijaunganishwa."
    });
  }

  try {
    const commentId = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    const content = String(req.body.content || "").trim();

    if (!name || !content) {
      return res.status(400).json({
        success: false,
        message: "Jina na reply vinahitajika."
      });
    }

    if (name.length > 50 || content.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Reply imezidi urefu unaoruhusiwa."
      });
    }

    const result = await pool.query(`
      INSERT INTO comment_replies (comment_id, name, content)
      VALUES ($1, $2, $3)
      RETURNING id, comment_id, name, content, created_at
    `, [commentId, name, content]);

    res.json({
      success: true,
      reply: result.rows[0]
    });

  } catch (error) {
    console.error("REPLY ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Imeshindwa kutuma reply."
    });
  }
});


// LIKE / DISLIKE
app.post("/api/comments/:id/reaction", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: "Database haijaunganishwa."
    });
  }

  try {
    const commentId = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    const reaction = String(req.body.reaction || "").trim();

    if (!name || !["like", "dislike"].includes(reaction)) {
      return res.status(400).json({
        success: false,
        message: "Reaction si sahihi."
      });
    }

    const existing = await pool.query(`
      SELECT id, reaction
      FROM comment_reactions
      WHERE comment_id = $1 AND name = $2
    `, [commentId, name]);

    if (existing.rows.length) {
      const old = existing.rows[0];

      if (old.reaction === reaction) {
        await pool.query(
          "DELETE FROM comment_reactions WHERE id = $1",
          [old.id]
        );
      } else {
        await pool.query(
          "UPDATE comment_reactions SET reaction = $1 WHERE id = $2",
          [reaction, old.id]
        );
      }
    } else {
      await pool.query(`
        INSERT INTO comment_reactions
        (comment_id, name, reaction)
        VALUES ($1, $2, $3)
      `, [commentId, name, reaction]);
    }

    const counts = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE reaction = 'like') AS likes,
        COUNT(*) FILTER (WHERE reaction = 'dislike') AS dislikes
      FROM comment_reactions
      WHERE comment_id = $1
    `, [commentId]);

    res.json({
      success: true,
      likes: Number(counts.rows[0].likes),
      dislikes: Number(counts.rows[0].dislikes)
    });

  } catch (error) {
    console.error("REACTION ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Imeshindwa kuweka reaction."
    });
  }
});


// ============================================================
// DRACK HUB ADMIN STATS API
// ============================================================

app.get("/api/admin/stats", async (req, res) => {
    if (!pool) {
        return res.status(503).json({
            success: false,
            message: "Database haijaunganishwa."
        });
    }

    try {
        const result = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM posts) AS posts,
                (SELECT COUNT(*) FROM comments) AS comments,
                (SELECT COUNT(*) FROM comment_replies) AS replies,
                (SELECT COUNT(*) FROM comment_reactions WHERE reaction = 'like') AS likes,
                (SELECT COUNT(*) FROM visitors) AS visitors,
                (SELECT COUNT(*)
                 FROM visitors
                 WHERE last_seen >= CURRENT_TIMESTAMP - INTERVAL '5 minutes') AS active_visitors
        `);

        res.json({
            success: true,
            stats: {
                posts: Number(result.rows[0].posts),
                comments: Number(result.rows[0].comments),
                replies: Number(result.rows[0].replies),
                likes: Number(result.rows[0].likes),
                visitors: Number(result.rows[0].visitors),
                activeVisitors: Number(result.rows[0].active_visitors)
            }
        });

    } catch (error) {
        console.error("ADMIN STATS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Imeshindwa kupata admin statistics."
        });
    }
});



// ============================================================
// DRACK HUB MUSIC API
// ============================================================

const musicData = require("./music-data.json");

app.get("/api/music", (req, res) => {
  try {
    const q = String(req.query.q || "").trim().toLowerCase();

    let songs = musicData;

    if (q) {
      songs = musicData.filter(song =>
        String(song.title).toLowerCase().includes(q) ||
        String(song.artist).toLowerCase().includes(q) ||
        String(song.genre).toLowerCase().includes(q)
      );
    }

    res.json({
      success: true,
      total: songs.length,
      songs
    });

  } catch (error) {
    console.error("MUSIC API ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Imeshindwa kupata music."
    });
  }
});



// ============================================================
// DRACK HUB INDIVIDUAL MUSIC PAGES
// ============================================================

function musicSlug(title, artist) {
  return String(artist + " " + title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function musicEsc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

app.get("/music/:slug", (req, res) => {
  try {
    const slug = String(req.params.slug || "").toLowerCase();

    const song = musicData.find(item =>
      musicSlug(item.title, item.artist) === slug
    );

    if (!song) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="sw">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>Music Haijapatikana - DRACK HUB</title>
        </head>
        <body style="font-family:Arial;background:#111;color:white;padding:30px">
          <h1>🎵 Music haijapatikana</h1>
          <p>Wimbo unaoutafuta haujapatikana DRACK HUB.</p>
          <a href="/music.html" style="color:#ff3333">← Rudi DRACK MUSIC</a>
        </body>
        </html>
      `);
    }

    const title = musicEsc(song.title);
    const artist = musicEsc(song.artist);
    const description = musicEsc(song.description);
    const year = musicEsc(song.year);
    const genre = musicEsc(song.genre);
    const source = musicEsc(song.source);
    const canonical =
      "https://drack-hub-gldg.onrender.com/music/" +
      musicSlug(song.title, song.artist);

    res.send(`
<!DOCTYPE html>
<html lang="sw">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">

  <title>${title} - ${artist} | DRACK HUB</title>

  <meta name="description"
    content="${title} - ${artist}. ${description} DRACK HUB.">

  <meta name="robots" content="index,follow">

  <link rel="canonical" href="${canonical}">

  <meta property="og:type" content="music.song">
  <meta property="og:title"
    content="${title} - ${artist} | DRACK HUB">
  <meta property="og:description"
    content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="DRACK HUB">

  <script type="application/ld+json">
  ${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    "name": song.title,
    "byArtist": {
      "@type": "MusicGroup",
      "name": song.artist
    },
    "genre": song.genre,
    "datePublished": song.year,
    "url": canonical
  })}
  </script>

  <style>
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family:Arial,sans-serif;
      background:#0b0b0b;
      color:#fff;
    }
    .top{
      background:#151515;
      padding:16px;
      border-bottom:1px solid #292929;
    }
    .brand{
      font-size:24px;
      font-weight:bold;
    }
    .wrap{
      max-width:850px;
      margin:auto;
      padding:20px;
    }
    .back{
      display:inline-block;
      color:#fff;
      text-decoration:none;
      margin-bottom:20px;
    }
    .hero{
      background:linear-gradient(135deg,#181818,#252525);
      border-radius:18px;
      padding:30px 22px;
      text-align:center;
    }
    .icon{
      font-size:70px;
    }
    h1{
      margin:10px 0;
      font-size:32px;
    }
    .artist{
      font-size:20px;
      opacity:.85;
    }
    .meta{
      display:flex;
      justify-content:center;
      flex-wrap:wrap;
      gap:8px;
      margin:20px 0;
    }
    .tag{
      background:#e50914;
      padding:7px 12px;
      border-radius:20px;
      font-size:13px;
    }
    .description{
      line-height:1.7;
      opacity:.9;
      margin:20px 0;
    }
    .listen{
      display:inline-block;
      background:#e50914;
      color:#fff;
      text-decoration:none;
      padding:14px 22px;
      border-radius:10px;
      font-weight:bold;
    }
    .section{
      margin-top:25px;
      background:#151515;
      padding:20px;
      border-radius:15px;
    }
    footer{
      text-align:center;
      padding:30px;
      opacity:.6;
    }
  </style>
</head>

<body>

  <div class="top">
    <div class="brand">🎵 DRACK HUB MUSIC</div>
  </div>

  <main class="wrap">

    <a class="back" href="/">← Rudi DRACK HUB</a>

    <section class="hero">

      <div class="icon">🎵</div>

      <h1>${title}</h1>

      <div class="artist">
        🎤 ${artist}
      </div>

      <div class="meta">
        <span class="tag">${genre}</span>
        <span class="tag">${year}</span>
      </div>

      <p class="description">
        ${description}
      </p>

      <a class="listen"
         href="${source}"
         target="_blank"
         rel="noopener">
        ▶ TAZAMA / SIKILIZA
      </a>

    </section>

    <section class="section">
      <h2>🎵 Kuhusu wimbo</h2>
      <p>
        ${title} ni wimbo wa ${artist}.
        Ukurasa huu umetengenezwa na DRACK HUB kwa ajili
        ya taarifa na maelezo ya music.
      </p>
    </section>

  </main>

  <footer>
    © 2026 DRACK HUB — All Rights Reserved
  </footer>

</body>
</html>
    `);

  } catch (error) {
    console.error("MUSIC PAGE ERROR:", error);
    res.status(500).send("Music page error");
  }
});


app.get("/music-test", (req, res) => {
  res.send("DRACK MUSIC ROUTE WORKS");
});

app.listen(PORT, HOST, () => {
    console.log("");
    console.log("=================================");
    console.log("        🤖 DRACK HUB");
    console.log("=================================");
    console.log(`🌐 http://localhost:${PORT}`);
    console.log("🟢 Server ONLINE");
    console.log(`📡 PORT: ${PORT}`);
    console.log("=================================");
    console.log("");
});
