const fs = require("fs");
const path = require("path");
const db = require("./db");

loadLocalEnv();

const FREE_DAILY_LIMITS = {
  srs_generation: 3,
  uml_generation: 3,
  uml_analysis: 3,
  ai_analysis: 3
};

const PLAN_POLICY = {
  currency: "PKR",
  free: {
    name: "Free",
    monthly_price: 0,
    annual_price: 0,
    project_limit: 3,
    exports: ["pdf"],
    languages: ["English"],
    features: [
      "3 SRS generations per day",
      "3 UML generations per day",
      "3 UML descriptions per day",
      "3 AI analyses per day",
      "English interface and output",
      "PDF export",
      "Up to 3 saved projects"
    ]
  },
  premium: {
    name: "Premium",
    monthly_price: 5500,
    annual_price: 55000,
    billing: {
      monthly_days: 30,
      annual_days: 365,
      activation: "Automatic after successful secure checkout",
      automatic_renewal: true
    },
    project_limit: null,
    exports: ["pdf", "doc", "docx", "txt", "svg", "png", "airauml", "pptx", "xlsx"],
    languages: ["English", "Urdu", "Arabic", "French", "German", "Spanish"],
    features: [
      "Unlimited SRS and UML generations",
      "Unlimited AI analyses and UML descriptions",
      "Multi-language output",
      "Advanced AI review and improvement suggestions",
      "Multiple export formats",
      "Premium SRS templates",
      "Unlimited project history and storage",
      "Priority processing"
    ]
  },
  admin: {
    name: "Admin",
    monthly_price: 0,
    annual_price: 0,
    project_limit: null,
    exports: ["all"],
    languages: ["all"],
    features: ["All Premium features with unlimited free access"]
  }
};

const DEFAULT_ADMIN_EMAILS = [
  "nayabnazir822@gmail",
  "nayabnazir822@gmail.com"
];

const adminEmails = new Set(
  [...DEFAULT_ADMIN_EMAILS, ...String(process.env.ADMIN_EMAILS || "").split(",")]
    .join(",")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
);

const premiumEmails = new Set(
  String(process.env.PREMIUM_EMAILS || "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
);

ensureUsageTable();
ensureAccountRoleSupport();

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8").split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match || process.env[match[1]] !== undefined) return;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  });
}

function ensureUsageTable() {
  db.query(
    `CREATE TABLE IF NOT EXISTS usage_events (
      usage_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      feature VARCHAR(64) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_usage_user_feature_date (user_id, feature, created_at)
    )`,
    error => {
      if (error) console.log("Usage table error:", error.message || error);
    }
  );
}

function ensureAccountRoleSupport() {
  db.query(
    "ALTER TABLE users MODIFY role ENUM('student','developer','premium','admin') DEFAULT 'student'",
    error => {
      if (error) {
        console.log("Account role migration error:", error.message || error);
        return;
      }
      syncConfiguredAccountRoles();
    }
  );
}

function syncConfiguredAccountRoles() {
  const configuredAdmins = [...adminEmails];
  const configuredPremiumUsers = [...premiumEmails].filter(email => !adminEmails.has(email));

  if (configuredAdmins.length) {
    db.query(
      `UPDATE users SET role='admin' WHERE LOWER(email) IN (${configuredAdmins.map(() => "?").join(",")})`,
      configuredAdmins,
      error => {
        if (error) console.log("Admin account sync error:", error.message || error);
      }
    );
  }

  if (configuredPremiumUsers.length) {
    db.query(
      `UPDATE users SET role='premium' WHERE LOWER(email) IN (${configuredPremiumUsers.map(() => "?").join(",")})`,
      configuredPremiumUsers,
      error => {
        if (error) console.log("Premium account sync error:", error.message || error);
      }
    );
  }
}

function isConfiguredAdmin(email) {
  return adminEmails.has(String(email || "").trim().toLowerCase());
}

function isConfiguredPremium(email) {
  return premiumEmails.has(String(email || "").trim().toLowerCase());
}

function decorateUser(user) {
  const configuredAdmin = isConfiguredAdmin(user?.email);
  const configuredPremium = isConfiguredPremium(user?.email);
  const role = configuredAdmin
    ? "admin"
    : configuredPremium
      ? "premium"
      : String(user?.role || "student").toLowerCase();
  const plan = role === "admin" ? "admin" : role === "premium" ? "premium" : "free";
  return {
    ...user,
    role,
    plan,
    is_admin: role === "admin",
    limits: plan === "free" ? FREE_DAILY_LIMITS : null
  };
}

async function getAccessSummary(userId) {
  const access = await getUserAccess(userId);
  const usage = {};

  for (const [feature, limit] of Object.entries(FREE_DAILY_LIMITS)) {
    const rows = await query(
      `SELECT COUNT(*) AS total FROM usage_events
       WHERE user_id=? AND feature=? AND created_at >= CURRENT_DATE()`,
      [Number(userId) || 0, feature]
    );
    const used = Number(rows[0]?.total || 0);
    usage[feature] = {
      used,
      limit: access.plan === "free" ? limit : null,
      remaining: access.plan === "free" ? Math.max(limit - used, 0) : null
    };
  }

  return {
    ...access,
    policy: PLAN_POLICY,
    usage,
    upgrade_contact: "nayabnazir822@gmail.com"
  };
}

async function getUserAccess(userId) {
  const id = Number(userId);
  if (!id) return { role: "student", plan: "free", is_admin: false, limits: FREE_DAILY_LIMITS };
  const rows = await query("SELECT user_id, email, role FROM users WHERE user_id=? LIMIT 1", [id]);
  return decorateUser(rows[0] || { user_id: id, role: "student" });
}

async function assertFeatureAccess(userId, feature, language = "English") {
  if (!Number(userId)) {
    const error = new Error("Please log in before using this feature.");
    error.status = 401;
    throw error;
  }
  const access = await getUserAccess(userId);
  if (access.plan !== "free") return access;

  if (String(language || "English").trim().toLowerCase() !== "english") {
    const error = new Error("Multi-language AI output is available on Premium. Admin accounts have unlimited access.");
    error.status = 403;
    error.code = "PREMIUM_REQUIRED";
    error.feature = "multi_language";
    throw error;
  }

  const limit = FREE_DAILY_LIMITS[feature];
  if (!limit) return access;
  const rows = await query(
    `SELECT COUNT(*) AS total FROM usage_events
     WHERE user_id=? AND feature=? AND created_at >= CURRENT_DATE()`,
    [Number(userId) || 0, feature]
  );
  if (Number(rows[0]?.total || 0) >= limit) {
    const error = new Error(`You have reached today's free limit for ${feature.replace(/_/g, " ")}. Upgrade to Premium for unlimited access.`);
    error.status = 429;
    error.code = "DAILY_LIMIT_REACHED";
    error.feature = feature;
    error.limit = limit;
    throw error;
  }
  return access;
}

async function recordUsage(userId, feature) {
  if (!Number(userId)) return;
  const access = await getUserAccess(userId);
  if (access.plan !== "free") return;
  await query("INSERT INTO usage_events (user_id, feature) VALUES (?, ?)", [Number(userId), feature]);
}

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
}

module.exports = {
  FREE_DAILY_LIMITS,
  PLAN_POLICY,
  assertFeatureAccess,
  decorateUser,
  getAccessSummary,
  getUserAccess,
  isConfiguredAdmin,
  isConfiguredPremium,
  recordUsage
};
