require("dotenv").config();

const fs = require("fs");
const { Pool } = require("pg");

async function initDatabase() {
    if (!process.env.DATABASE_URL) {
        console.log("⚠️ DATABASE_URL haijawekwa. Database initialization imerukwa.");
        return;
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        const schema = fs.readFileSync("./db/schema.sql", "utf8");

        await pool.query(schema);

        console.log("=================================");
        console.log("       🗄️ DRACK HUB DATABASE");
        console.log("=================================");
        console.log("✅ Tables zimeundwa/zimethibitishwa");
        console.log("=================================");

    } catch (error) {
        console.error("❌ Database initialization failed:");
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

initDatabase();
