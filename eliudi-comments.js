"use strict";

const crypto = require("crypto");

module.exports = function registerEliudiComments(app, pool) {
  function checkAdmin(req, res) {
    const expected = process.env.ELIUDI_ADMIN_KEY;
    const supplied = req.get("x-eliudi-admin-key") || "";

    if (!expected) {
      res.status(503).json({
        success: false,
        message: "Ulinzi wa admin haujawekwa kwenye mazingira ya server."
      });
      return false;
    }

    const a = Buffer.from(expected);
    const b = Buffer.from(supplied);

    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(a, b)
    ) {
      res.status(401).json({
        success: false,
        message: "Ufunguo wa admin si sahihi."
      });
      return false;
    }

    return true;
  }

  function requireDatabase(res) {
    if (!pool) {
      res.status(503).json({
        success: false,
        message: "Database haijaunganishwa."
      });
      return false;
    }
    return true;
  }

  // Maoni yanayoonekana kwa umma: yaliyoidhinishwa pekee.
  app.get("/api/eliudi/comments", async (req, res) => {
    if (!requireDatabase(res)) return;

    try {
      const result = await pool.query(`
        SELECT
          c.id,
          c.name,
          c.content,
          c.created_at,
          COUNT(r.id) FILTER (WHERE r.reaction = 'like')::int AS likes,
          COUNT(r.id) FILTER (WHERE r.reaction = 'unlike')::int AS unlikes
        FROM eliudi_comments c
        LEFT JOIN eliudi_comment_reactions r
          ON r.comment_id = c.id
        WHERE c.status = 'approved'
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT 200
      `);

      res.json({ success: true, comments: result.rows });
    } catch (error) {
      console.error("ELIUDI COMMENTS READ ERROR:", error.message);
      res.status(500).json({
        success: false,
        message: "Imeshindwa kupata maoni."
      });
    }
  });

  // Msomaji anaweza kutuma maoni bila akaunti.
  app.post("/api/eliudi/comments", async (req, res) => {
    if (!requireDatabase(res)) return;

    const name = typeof req.body?.name === "string"
      ? req.body.name.trim() || "Msomaji"
      : "Msomaji";

    const content = typeof req.body?.content === "string"
      ? req.body.content.trim()
      : "";

    if (name.length > 60 || content.length < 2 || content.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Jina lisizidi herufi 60 na maoni yawe na herufi 2–1000."
      });
    }

    try {
      await pool.query(
        `INSERT INTO eliudi_comments (name, content, status)
         VALUES ($1, $2, 'pending')`,
        [name, content]
      );

      res.status(201).json({
        success: true,
        message: "Maoni yamepokelewa na yanasubiri idhini ya admin."
      });
    } catch (error) {
      console.error("ELIUDI COMMENT SUBMIT ERROR:", error.message);
      res.status(500).json({
        success: false,
        message: "Imeshindwa kutuma maoni. Jaribu tena."
      });
    }
  });

  // Kila kifaa hutumia visitorId yake; reaction moja kwa maoni.
  app.post("/api/eliudi/comments/:id/reaction", async (req, res) => {
    if (!requireDatabase(res)) return;

    const id = Number(req.params.id);
    const visitorId = typeof req.body?.visitorId === "string"
      ? req.body.visitorId.trim()
      : "";
    const reaction = req.body?.reaction;

    if (
      !Number.isSafeInteger(id) || id < 1 ||
      !visitorId || visitorId.length > 100 ||
      !["like", "unlike"].includes(reaction)
    ) {
      return res.status(400).json({
        success: false,
        message: "Taarifa za reaction si sahihi."
      });
    }

    try {
      const comment = await pool.query(
        "SELECT id FROM eliudi_comments WHERE id = $1 AND status = 'approved'",
        [id]
      );

      if (!comment.rowCount) {
        return res.status(404).json({
          success: false,
          message: "Maoni hayapo au bado hayajaidhinishwa."
        });
      }

      await pool.query(`
        INSERT INTO eliudi_comment_reactions
          (comment_id, visitor_id, reaction)
        VALUES ($1, $2, $3)
        ON CONFLICT (comment_id, visitor_id)
        DO UPDATE SET reaction = EXCLUDED.reaction,
                      created_at = CURRENT_TIMESTAMP
      `, [id, visitorId, reaction]);

      const counts = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE reaction = 'like')::int AS likes,
          COUNT(*) FILTER (WHERE reaction = 'unlike')::int AS unlikes
        FROM eliudi_comment_reactions
        WHERE comment_id = $1
      `, [id]);

      res.json({ success: true, ...counts.rows[0] });
    } catch (error) {
      console.error("ELIUDI REACTION ERROR:", error.message);
      res.status(500).json({
        success: false,
        message: "Imeshindwa kuhifadhi reaction."
      });
    }
  });

  // Admin pekee: kuona maoni pamoja na yale yanayosubiri.
  app.get("/api/admin/eliudi/comments", async (req, res) => {
    if (!checkAdmin(req, res)) return;
    if (!requireDatabase(res)) return;

    const status = req.query.status || "pending";
    if (!["pending", "approved", "all"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Chaguo la status si sahihi."
      });
    }

    try {
      const result = await pool.query(`
        SELECT id, name, content, status, created_at
        FROM eliudi_comments
        WHERE ($1 = 'all' OR status = $1)
        ORDER BY created_at DESC
        LIMIT 300
      `, [status]);

      res.json({ success: true, comments: result.rows });
    } catch (error) {
      console.error("ELIUDI ADMIN READ ERROR:", error.message);
      res.status(500).json({
        success: false,
        message: "Imeshindwa kupata maoni ya admin."
      });
    }
  });

  // Admin pekee: kuidhinisha maoni.
  app.patch("/api/admin/eliudi/comments/:id/approve", async (req, res) => {
    if (!checkAdmin(req, res)) return;
    if (!requireDatabase(res)) return;

    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Namba ya maoni si sahihi."
      });
    }

    try {
      const result = await pool.query(`
        UPDATE eliudi_comments
        SET status = 'approved'
        WHERE id = $1
        RETURNING id, status
      `, [id]);

      if (!result.rowCount) {
        return res.status(404).json({
          success: false,
          message: "Maoni hayajapatikana."
        });
      }

      res.json({ success: true, comment: result.rows[0] });
    } catch (error) {
      console.error("ELIUDI APPROVE ERROR:", error.message);
      res.status(500).json({
        success: false,
        message: "Imeshindwa kuidhinisha maoni."
      });
    }
  });

  // Admin pekee: kufuta maoni na reactions zake.
  app.delete("/api/admin/eliudi/comments/:id", async (req, res) => {
    if (!checkAdmin(req, res)) return;
    if (!requireDatabase(res)) return;

    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Namba ya maoni si sahihi."
      });
    }

    try {
      const result = await pool.query(
        "DELETE FROM eliudi_comments WHERE id = $1 RETURNING id",
        [id]
      );

      if (!result.rowCount) {
        return res.status(404).json({
          success: false,
          message: "Maoni hayajapatikana."
        });
      }

      res.json({ success: true, deletedId: id });
    } catch (error) {
      console.error("ELIUDI DELETE ERROR:", error.message);
      res.status(500).json({
        success: false,
        message: "Imeshindwa kufuta maoni."
      });
    }
  });
};
