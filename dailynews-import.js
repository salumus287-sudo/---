const { Pool } = require("pg");

const API_URL =
    "https://dailynews.co.tz/wp-json/wp/v2/posts?per_page=5";

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
        console.log("   📰 DAILY NEWS AUTO IMPORT");
        console.log("=================================");

        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error(`Daily News API: ${response.status}`);
        }

        const posts = await response.json();

        console.log(`📡 Zimepatikana: ${posts.length} habari`);

        for (const post of posts) {
            const title = post.title?.rendered || "Bila kichwa";
            const content = post.content?.rendered || "";
            const sourceUrl = post.link || "";
            const createdAt = post.date_gmt || post.date;

            const imageMatch = content.match(
                /<img[^>]+src=["']([^"']+)["']/i
            );

            const imageUrl = imageMatch ? imageMatch[1] : null;

            const exists = await pool.query(
                `SELECT id FROM posts WHERE source_url = $1 LIMIT 1`,
                [sourceUrl]
            );

            if (exists.rows.length) {
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
                    source_url,
                    created_at
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                `,
                [
                    title,
                    content,
                    "news",
                    imageUrl,
                    "Daily News",
                    sourceUrl,
                    createdAt
                ]
            );

            console.log(`✅ Imeongezwa: ${title}`);
        }

        console.log("=================================");
        console.log("✅ DAILY NEWS IMPORT IMEKAMILIKA");
        console.log("=================================");

    } finally {
        await pool.end();
    }
}

module.exports = { importDailyNews };
