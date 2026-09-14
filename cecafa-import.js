require("dotenv").config();

const Parser = require("rss-parser");
const { Pool } = require("pg");

const parser = new Parser({
    timeout: 15000,
    headers: {
        "User-Agent": "DRACK-HUB-News-Aggregator/1.0"
    }
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function importCECAFA() {

    console.log("");
    console.log("=================================");
    console.log("      📰 CECAFA SPORTS IMPORT");
    console.log("=================================");

    try {

        const feed = await parser.parseURL(
            "https://cecafaonline.com/feed/"
        );

        console.log(
            "📡 CECAFA RSS:",
            feed.items.length,
            "habari"
        );

        let imported = 0;

        for (const item of feed.items.slice(0, 15)) {

            try {

                const title = (item.title || "").trim();
                const sourceUrl = (item.link || "").trim();

                if (!title || !sourceUrl) {
                    continue;
                }

                const exists = await pool.query(
                    "SELECT id FROM posts WHERE source_url = $1 LIMIT 1",
                    [sourceUrl]
                );

                if (exists.rows.length > 0) {
                    continue;
                }

                const content =
                    item.contentSnippet ||
                    item.content ||
                    item.summary ||
                    title;

                let image = null;

                if (
                    item.enclosure &&
                    item.enclosure.url
                ) {
                    image = item.enclosure.url;
                }

                await pool.query(
                    `INSERT INTO posts
                    (title, content, category, image_url, source_name, source_url)
                    VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        title,
                        String(content).replace(/<[^>]*>/g, " ").trim().substring(0, 1000),
                        "sports",
                        image,
                        "CECAFA",
                        sourceUrl
                    ]
                );

                imported++;

                console.log("   ✅", title);

            } catch (error) {

                console.log(
                    "   ⚠️ Article skipped:",
                    error.message
                );

            }
        }

        console.log("");
        console.log("=================================");
        console.log("✅ CECAFA mpya:", imported);
        console.log("=================================");

    } catch (error) {

        console.log(
            "❌ CECAFA RSS ERROR:",
            error.message
        );

    } finally {

        await pool.end();

    }
}

importCECAFA();
