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
    },
    {
        name: "AllAfrica Tanzania",
        url: "https://allafrica.com/tools/headlines/rdf/tanzania/headlines.rdf",
        category: "news"
    }
]

async function importDailyNews() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL haijawekwa kwenye Render.");
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

                    let image = null;

                    if (item.enclosure && item.enclosure.url) {
                        image = item.enclosure.url;
                    } else if (item["media:content"] && item["media:content"].url) {
                        image = item["media:content"].url;
                    }

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
                            image,
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



async function importITVNews() {
    const { Pool } = require("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const https = require("https");

    function fetchPage(url) {
        return new Promise((resolve, reject) => {
            https.get(url, res => {
                let body = "";

                res.on("data", chunk => body += chunk);

                res.on("end", () => {
                    if (res.statusCode !== 200) {
                        reject(new Error("HTTP " + res.statusCode));
                        return;
                    }

                    resolve(body);
                });
            }).on("error", reject);
        });
    }

    function getMeta(html, key) {
        const marker = key + '="';
        const pos = html.indexOf(marker);

        if (pos === -1) return null;

        const startPos = pos + marker.length;
        const endPos = html.indexOf('"', startPos);

        if (endPos === -1) return null;

        return html.substring(startPos, endPos);
    }

    try {
        const html = await fetchPage("https://www.itv.co.tz/news");

        const links = [];
        let position = 0;

        while (true) {
            const found = html.indexOf('href="/news/', position);

            if (found === -1) break;

            const startUrl = found + 6;
            const endUrl = html.indexOf('"', startUrl);

            if (endUrl === -1) break;

            const path = html.substring(startUrl, endUrl);
            const url = "https://www.itv.co.tz" + path;

            if (!links.includes(url)) {
                links.push(url);
            }

            position = endUrl + 1;
        }

        console.log("📡 ITV links:", links.length);

        let imported = 0;

        for (const url of links.slice(0, 20)) {
            try {
                const article = await fetchPage(url);

                const titleStart = article.indexOf("<title>");
                const titleEnd = article.indexOf("</title>");

                const title = titleStart !== -1 && titleEnd !== -1
                    ? article.substring(titleStart + 7, titleEnd).trim()
                    : "ITV Tanzania";

                let image = null;

                const imageMarker = 'property="og:image"';
                const imagePos = article.indexOf(imageMarker);

                if (imagePos !== -1) {
                    const contentPos = article.indexOf('content="', imagePos);

                    if (contentPos !== -1) {
                        const valueStart = contentPos + 9;
                        const valueEnd = article.indexOf('"', valueStart);

                        if (valueEnd !== -1) {
                            image = article.substring(valueStart, valueEnd).trim();
                        }
                    }
                }

                const descriptionStart = article.indexOf(
                    'name="description"'
                );

                let description = title;

                if (descriptionStart !== -1) {
                    const contentStart = article.indexOf(
                        'content="',
                        descriptionStart
                    );

                    if (contentStart !== -1) {
                        const valueStart = contentStart + 9;
                        const valueEnd = article.indexOf('"', valueStart);

                        if (valueEnd !== -1) {
                            description = article
                                .substring(valueStart, valueEnd)
                                .trim();
                        }
                    }
                }

                const exists = await pool.query(
                    "SELECT id FROM posts WHERE source_url = $1 LIMIT 1",
                    [url]
                );

                if (exists.rows.length > 0) continue;

                await pool.query(
                    `INSERT INTO posts
                    (title, content, category, image_url, source_name, source_url)
                    VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        title,
                        description.substring(0, 500),
                        "tanzania",
                        null,
                        "ITV Tanzania",
                        url
                    ]
                );

                imported++;

            } catch (error) {
                console.log("⚠️ ITV article skipped:", error.message);
            }
        }

        console.log("📺 ITV Tanzania mpya:", imported);

    } catch (error) {
        console.log("❌ ITV IMPORT ERROR:", error.message);
    }
}

const { importCECAFA } = require("./cecafa-import");

// ITV Tanzania auto-import
async function importAllNews() {
    await importDailyNews();
    await importITVNews();
    await importCECAFA();
}

module.exports = {
    importDailyNews,
    importITVNews,
    importCECAFA,
    importAllNews
};
