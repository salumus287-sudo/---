require("dotenv").config();

const { Pool } = require("pg");

const API_URL =
    "https://dailynews.co.tz/wp-json/wp/v2/posts?per_page=5&_embed";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

function cleanHTML(html = "") {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

async function importDailyNews() {
    try {
        console.log("=================================");
        console.log("     📰 DAILY NEWS IMPORTER");
        console.log("=================================");

        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error(`Daily News API HTTP ${response.status}`);
        }

        const posts = await response.json();

        console.log(`📡 Zimepatikana: ${posts.length} habari`);

        for (const article of posts) {
            const title = cleanHTML(article.title?.rendered || "");
            const content = cleanHTML(article.content?.rendered || "");
            const sourceUrl = article.link || "";
            const publishedAt = article.date || new Date().toISOString();

            let imageUrl = null;

            if (
                article._embedded &&
                article._embedded["wp:featuredmedia"] &&
                article._embedded["wp:featuredmedia"][0]
            ) {
                imageUrl =
                    article._embedded["wp:featuredmedia"][0].source_url || null;
            }

            if (!title || !content || !sourceUrl) {
                continue;
            }

            const existing = await pool.query(
                `SELECT id FROM posts WHERE source_url = $1 LIMIT 1`,
                [sourceUrl]
            );

            if (existing.rows.length > 0) {
                console.log(`⏭️ Tayari ipo: ${title}`);
                continue;
            }

            await pool.query(
                `
                INSERT INTO posts
                (title, content, category, image_url, source_name, source_url, created_at)
                VALUES
                ($1, $2, $3, $4, $5, $6, $7)
                `,
                [
                    title,
                    content,
                    "news",
                    imageUrl,
                    "Daily News",
                    sourceUrl,
                    publishedAt
                ]
            );

            console.log(`✅ Imeingizwa: ${title}`);
        }

        console.log("=================================");
        console.log("✅ DAILY NEWS IMPORT IMEKAMILIKA");
        console.log("=================================");

    } catch (error) {
        console.error("❌ IMPORT ERROR:");
        console.error(error.message);
    } finally {
        await pool.end();
    }
}

importDailyNews();
