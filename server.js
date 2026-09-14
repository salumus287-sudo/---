require("dotenv").config();

const express = require("express");
const path = require("path");
const { importDailyNews } = require("./dailynews-import");
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
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
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

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================
// 404 API
// ===============================

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "DRACK HUB API route haijapatikana."
    });
});

// ===============================
// START SERVER
// ===============================


async function startDailyNewsImporter() {
    try {
        await importDailyNews();
        console.log("📰 Daily News auto-import: ONLINE");
    } catch (error) {
        console.error("❌ Daily News auto-import:", error.message);
    }
}

startDailyNewsImporter();

setInterval(() => {
    startDailyNewsImporter();
}, 10 * 60 * 1000);

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
