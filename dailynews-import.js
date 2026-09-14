const { Pool } = require("pg");
const Parser = require("rss-parser");

const parser = new Parser({
    timeout: 15000,
    headers: {
        "User-Agent": "DRACK-HUB-News-Aggregator/1.0"
    }
});

const FEEDS = [
    {
        name: "ESPN Soccer",
        url: "https://www.espn.com/espn/rss/soccer/news",
        category: "sports"
    },
    {
        name: "BBC Sport Football",
        url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
        category: "sports"
    },
    {
        name: "BBC News",
        url: "https://feeds.bbci.co.uk/news/rss.xml",
        category: "dunia"
    }
];

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
        console.log("      📰 DRACK HUB RSS IMPORT");
        console.log("=================================");

        let totalAdded = 0;

        for (const feedConfig of FEEDS) {
            console.log("");
            console.log(`📡 ${feedConfig.name}`);

            try {
                const feed = await parser.parseURL(feedConfig.url);
                const items = (feed.items || []).slice(0, 10);

                console.log(`   Habari zilizopatikana: ${items.length}`);

                for (const item of items) {
                    const title = (item.title || "").trim();
                    const sourceUrl = (item.link || "").trim();

                    if (!title || !sourceUrl) {
                        continue;
                    }

                    const content =
                        item.contentSnippet ||
                        item.summary ||
                        item.content ||
                        "";

                    const exists = await pool.query(
                        `SELECT id FROM posts WHERE source_url = $1 LIMIT 1`,
                        [sourceUrl]
                    );

                    if (exists.rows.length > 0) {
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
                            feedConfig.category,
                            null,
                            feedConfig.name,
                            sourceUrl
                        ]
                    );

                    totalAdded++;

                    console.log(`   ✅ ${title}`);
                }

            } catch (error) {
                console.log(
                    `   ⚠️ Feed imeshindwa: ${error.message}`
                );
            }
        }

        console.log("");
        console.log("=================================");
        console.log(`✅ Habari mpya: ${totalAdded}`);
        console.log("=================================");

    } finally {
        await pool.end();
    }
}

module.exports = {
    importDailyNews
};
