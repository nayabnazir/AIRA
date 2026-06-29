const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const db = require("../db");
const { decorateUser, getAccessSummary, getUserAccess, isConfiguredAdmin, isConfiguredPremium } = require("../accessControl");

/* SIGNUP */
router.post("/signup", (req, res) => {
  const full_name = String(req.body?.full_name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!full_name || !email || !password) {
    return res.status(400).json({ msg: "Full name, email, and password are required." });
  }

  const hashed = bcrypt.hashSync(password, 10);

  const role = isConfiguredAdmin(email) ? "admin" : isConfiguredPremium(email) ? "premium" : "student";
  db.query(
    "INSERT INTO users (full_name, email, password, role) VALUES (?,?,?,?)",
    [full_name, email, hashed, role],
    (err, result) => {
      if (err) return res.status(400).json({ msg: "Email already exists or database is unavailable." });

      const user = decorateUser({
        user_id: result.insertId,
        full_name,
        email,
        role
      });

      res.json({ msg: "Signup successful", user });
    }
  );
});

/* LOGIN */
router.post("/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ msg: "Email and password are required." });
  }

  db.query(
    "SELECT user_id, full_name, email, password, role, account_status FROM users WHERE email=? LIMIT 1",
    [email],
    (err, result) => {
      if (err) return res.status(500).json({ msg: "Database is unavailable." });
      if (result.length === 0)
        return res.status(404).json({ msg: "User not found" });

      const row = result[0];
      if (row.account_status !== "active") {
        return res.status(403).json({ msg: "This account is not active." });
      }

      const ok = bcrypt.compareSync(password, row.password);
      if (!ok)
        return res.status(401).json({ msg: "Check your password and try again." });

      const user = decorateUser({
        user_id: row.user_id,
        full_name: row.full_name,
        email: row.email,
        role: row.role
      });

      res.json({ msg: "Login successful", user });
    }
  );
});

router.get("/access/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Valid user id is required." });
    res.json(await getAccessSummary(userId));
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to load account access." });
  }
});

router.post("/admin/account-access", async (req, res) => {
  try {
    const requesterUserId = Number(req.body?.requesterUserId);
    const email = String(req.body?.email || "").trim().toLowerCase();
    const access = String(req.body?.access || "").trim().toLowerCase();
    const roles = { free: "student", premium: "premium", admin: "admin" };

    if (!requesterUserId || !email || !roles[access]) {
      return res.status(400).json({ error: "Requester, registered user email, and a valid access level are required." });
    }

    const requester = await getUserAccess(requesterUserId);
    if (!requester.is_admin) {
      return res.status(403).json({ error: "Admin access is required to change account access." });
    }

    db.query("UPDATE users SET role=? WHERE LOWER(email)=?", [roles[access], email], async (error, result) => {
      if (error) return res.status(500).json({ error: "Unable to update account access." });
      if (!result.affectedRows) return res.status(404).json({ error: "No registered account was found for this email." });

      db.query(
        "SELECT user_id, full_name, email, role FROM users WHERE LOWER(email)=? LIMIT 1",
        [email],
        (readError, rows) => {
          if (readError || !rows.length) return res.status(500).json({ error: "Access changed, but account details could not be loaded." });
          res.json({
            message: `${rows[0].email} now has ${access} access.`,
            user: decorateUser(rows[0])
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to update account access." });
  }
});

module.exports = router;
