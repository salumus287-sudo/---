module.exports = function registerLiveMatch(app, pool) {
  app.get("/api/live-match", async (req, res) => {
    if (!pool) {
      return res.status(503).json({success:false, message:"Database haijaunganishwa."});
    }
    try {
      const result = await pool.query(
        "SELECT title, url, updated_at FROM live_match WHERE id = 1"
      );
      return res.json({success:true, match:result.rows[0] || null});
    } catch (error) {
      console.error("LIVE MATCH READ ERROR:", error.message);
      return res.status(500).json({success:false, message:"Imeshindwa kusoma mechi."});
    }
  });

  app.post("/api/admin/live-match", async (req, res) => {
if (!pool) {
      return res.status(503).json({success:false, message:"Database haijaunganishwa."});
    }

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch (_) {
      return res.status(400).json({success:false, message:"Weka link halali ya mechi."});
    }

    if (!title || title.length > 180 || url.length > 2000 ||
        !["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({success:false, message:"Jina au link ya mechi si sahihi."});
    }

    try {
      const result = await pool.query(
        "INSERT INTO live_match (id, title, url, updated_at) VALUES (1, $1, $2, CURRENT_TIMESTAMP) " +
        "ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, url = EXCLUDED.url, updated_at = CURRENT_TIMESTAMP " +
        "RETURNING title, url, updated_at",
        [title, parsedUrl.href]
      );

      try {
        await pool.query(
          "INSERT INTO admin_actions (admin_username, action, target_type) VALUES ($1, $2, $3)",
          ["DRACK_MATCH_KEY", "Updated live match: " + title, "live_match"]
        );
      } catch (logError) {
        console.error("LIVE MATCH AUDIT LOG:", logError.message);
      }

      return res.json({success:true, match:result.rows[0]});
    } catch (error) {
      console.error("LIVE MATCH SAVE ERROR:", error.message);
      return res.status(500).json({success:false, message:"Imeshindwa kuhifadhi. Hakiki database."});
    }
  });
};
