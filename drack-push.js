const webpush = require("web-push");

module.exports = function registerDrackPush(app, pool) {
    if (!pool) {
        console.error("DRACK PUSH: Database haijaunganishwa.");
        return;
    }

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    const configured = Boolean(publicKey && privateKey && subject);

    if (configured) {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        console.log("DRACK PUSH: VAPID CONFIGURED");
    } else {
        console.error("DRACK PUSH: VAPID variables hazijakamilika.");
    }

    const ready = (async () => {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS drack_push_subscriptions (
                endpoint TEXT PRIMARY KEY,
                subscription JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS drack_push_notified_posts (
                post_id INTEGER PRIMARY KEY,
                notified_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS drack_push_state (
                state_key TEXT PRIMARY KEY,
                state_value TEXT NOT NULL
            )
        `);

        const state = await pool.query(
            "SELECT state_value FROM drack_push_state WHERE state_key = $1",
            ["baseline_done"]
        );

        if (state.rows.length === 0) {
            await pool.query(`
                INSERT INTO drack_push_notified_posts (post_id)
                SELECT id FROM posts
                ON CONFLICT (post_id) DO NOTHING
            `);

            await pool.query(
                `INSERT INTO drack_push_state (state_key, state_value)
                 VALUES ($1, $2)
                 ON CONFLICT (state_key) DO NOTHING`,
                ["baseline_done", "true"]
            );

            console.log("DRACK PUSH: Existing posts zimehifadhiwa kama baseline.");
        }

        console.log("DRACK PUSH: Database tayari.");
    })();

    app.get("/api/push/public-key", async (req, res) => {
        try {
            await ready;

            if (!configured) {
                return res.status(503).json({
                    success: false,
                    message: "Web Push haijasanidiwa."
                });
            }

            res.json({ success: true, publicKey });
        } catch (error) {
            console.error("DRACK PUSH KEY:", error.message);
            res.status(500).json({ success: false });
        }
    });

    app.post("/api/push/subscribe", async (req, res) => {
        try {
            await ready;

            const subscription = req.body;
            const endpoint = subscription && subscription.endpoint;

            if (
                !configured ||
                typeof endpoint !== "string" ||
                !endpoint.startsWith("https://") ||
                !subscription.keys ||
                !subscription.keys.p256dh ||
                !subscription.keys.auth
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Subscription si sahihi."
                });
            }

            await pool.query(`
                INSERT INTO drack_push_subscriptions
                    (endpoint, subscription)
                VALUES ($1, $2::jsonb)
                ON CONFLICT (endpoint)
                DO UPDATE SET
                    subscription = EXCLUDED.subscription,
                    updated_at = NOW()
            `, [endpoint, JSON.stringify(subscription)]);

            res.json({ success: true, message: "Notifications zimewashwa." });
        } catch (error) {
            console.error("DRACK PUSH SUBSCRIBE:", error.message);
            res.status(500).json({ success: false });
        }
    });

    app.post("/api/push/unsubscribe", async (req, res) => {
        try {
            await ready;

            const endpoint = req.body && req.body.endpoint;

            if (typeof endpoint !== "string") {
                return res.status(400).json({ success: false });
            }

            await pool.query(
                "DELETE FROM drack_push_subscriptions WHERE endpoint = $1",
                [endpoint]
            );

            res.json({ success: true });
        } catch (error) {
            console.error("DRACK PUSH UNSUBSCRIBE:", error.message);
            res.status(500).json({ success: false });
        }
    });

    async function sendToSubscribers(payload) {
        if (!configured) return;

        const result = await pool.query(
            "SELECT endpoint, subscription FROM drack_push_subscriptions"
        );

        await Promise.all(result.rows.map(async row => {
            try {
                await webpush.sendNotification(
                    row.subscription,
                    JSON.stringify(payload)
                );
            } catch (error) {
                console.error("DRACK PUSH SEND:", error.statusCode || error.message);

                if (error.statusCode === 404 || error.statusCode === 410) {
                    await pool.query(
                        "DELETE FROM drack_push_subscriptions WHERE endpoint = $1",
                        [row.endpoint]
                    );
                }
            }
        }));
    }

    async function checkNewPosts() {
        await ready;

        const result = await pool.query(`
            SELECT id, title, category
            FROM posts
            WHERE id NOT IN (
                SELECT post_id FROM drack_push_notified_posts
            )
            ORDER BY id ASC
            LIMIT 20
        `);

        for (const post of result.rows) {
            const category = String(post.category || "habari").toUpperCase();

            await sendToSubscribers({
                title: "DRACK HUB | " + (post.title || "Chapisho jipya"),
                body: "Chapisho jipya: " + category,
                url: "/",
                tag: "drack-post-" + post.id
            });

            await pool.query(
                `INSERT INTO drack_push_notified_posts (post_id)
                 VALUES ($1) ON CONFLICT (post_id) DO NOTHING`,
                [post.id]
            );

            console.log("DRACK PUSH: Chapisho limekaguliwa:", post.id);
        }
    }

    ready.then(() => {
        checkNewPosts().catch(error =>
            console.error("DRACK PUSH CHECK:", error.message)
        );

        setInterval(() => {
            checkNewPosts().catch(error =>
                console.error("DRACK PUSH CHECK:", error.message)
            );
        }, 30000);
    }).catch(error => {
        console.error("DRACK PUSH DATABASE:", error.message);
    });
};
