const { Pool } = require("pg");

let pool = null;

if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });
}

async function testDatabase() {
    if (!pool) {
        return {
            connected: false,
            message: "DATABASE_URL haijawekwa bado."
        };
    }

    try {
        await pool.query("SELECT NOW()");

        return {
            connected: true,
            message: "PostgreSQL imeunganishwa."
        };
    } catch (error) {
        return {
            connected: false,
            message: error.message
        };
    }
}

module.exports = {
    pool,
    testDatabase
};
