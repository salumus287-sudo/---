const { Pool } = require("pg");
const Parser = require("rss-parser");

const FEED_URL =
    "https://dailynews.co.tz/?format=feed&type=rss";

const parser = new Parser();

async function importDailyNews() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL haijawekwa kwenye Render.");
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log("=================================");
        console.log("   📰 DAILY NEWS RSS IMPORT");
        console.log("=================================");

        const feed = await parser.parseURL(FEED_URL);

        const items = (feed.items || []).slice(0, 5);

        console.log(`📡 Zimepatikana: ${items.length} habari`);

        for (const item of items) {
            const title = item.title || "Bila kichwa";
            const sourceUrl = item.link || "";

            const content =
                item["content:encoded"] ||
                item.content ||
                item.contentSnippet ||
                item.summary ||
                "";

            if (!sourceUrl) continue;

            const exists = await pool.query(
                `SELECT id FROM posts WHERE source_url = $1 LIMIT 1`,
                [sourceUrl]
            );

            if (exists.rows.length > 0) {
                console.log(`⏭️ Tayari ipo: ${title}`);
                continue;
            }

            await pool.query(
                `
                INSERT INTO posts
                (
                    title,
                    content,
                    category,
                    image_url,
                    source_name,
                    source_url
                )
                VALUES ($1,$2,$3,$4,$5,$6)
                `,
                [
                    title,
                    content,
                    "news",
                    null,
                    "Daily News",
                    sourceUrl
                ]
            );

            console.log(`✅ Imeongezwa: ${title}`);
        }

        console.log("=================================");
        console.log("✅ DAILY NEWS RSS IMPORT IMEKAMILIKA");
        console.log("=================================");

    } finally {
        await pool.end();
    }
}

module.exports = { importDailyNews };
