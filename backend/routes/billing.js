const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const db = require("../db");
const { getUserAccess } = require("../accessControl");

ensureBillingTable();

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
}

function ensureBillingTable() {
  db.query(
    `CREATE TABLE IF NOT EXISTS billing_subscriptions (
      billing_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      provider VARCHAR(32) NOT NULL DEFAULT 'stripe',
      provider_customer_id VARCHAR(255),
      provider_subscription_id VARCHAR(255) UNIQUE,
      plan_code ENUM('monthly','yearly') NOT NULL,
      status VARCHAR(64) NOT NULL,
      current_period_end DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )`,
    error => {
      if (error) console.log("Billing table error:", error.message || error);
    }
  );
}

function stripeConfig() {
  return {
    secretKey: String(process.env.STRIPE_SECRET_KEY || "").trim(),
    webhookSecret: String(process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
    monthlyPriceId: String(process.env.STRIPE_MONTHLY_PRICE_ID || "").trim(),
    yearlyPriceId: String(process.env.STRIPE_YEARLY_PRICE_ID || "").trim(),
    frontendUrl: String(process.env.AIRA_FRONTEND_URL || "http://localhost:3000/frontend/Pages").replace(/\/+$/, "")
  };
}

async function stripeRequest(path, form) {
  const { secretKey } = stripeConfig();
  if (!secretKey) {
    const error = new Error("Online billing is not configured yet. Add the Stripe keys in backend/.env.");
    error.status = 503;
    throw error;
  }

  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(form)
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result?.error?.message || "The payment provider could not start checkout.");
    error.status = response.status;
    throw error;
  }
  return result;
}

router.post("/billing/create-checkout-session", async (req, res) => {
  try {
    const userId = Number(req.body?.userId);
    const plan = String(req.body?.plan || "").trim().toLowerCase();
    if (!userId || !["monthly", "yearly"].includes(plan)) {
      return res.status(400).json({ error: "A logged-in user and valid billing plan are required." });
    }

    const access = await getUserAccess(userId);
    if (access.is_admin) {
      return res.status(400).json({ error: "Administrator accounts already have unlimited access and are never charged." });
    }

    const users = await query("SELECT user_id, email FROM users WHERE user_id=? LIMIT 1", [userId]);
    if (!users.length) return res.status(404).json({ error: "Registered user account was not found." });

    const config = stripeConfig();
    const priceId = plan === "monthly" ? config.monthlyPriceId : config.yearlyPriceId;
    if (!priceId) {
      return res.status(503).json({ error: `The ${plan} checkout price is not configured yet. Add its Stripe Price ID in backend/.env.` });
    }

    const session = await stripeRequest("checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      customer_email: users[0].email,
      client_reference_id: String(userId),
      "metadata[user_id]": String(userId),
      "metadata[plan]": plan,
      "subscription_data[metadata][user_id]": String(userId),
      "subscription_data[metadata][plan]": plan,
      allow_promotion_codes: "true",
      billing_address_collection: "auto",
      success_url: `${config.frontendUrl}/settings.html?checkout=success#premium`,
      cancel_url: `${config.frontendUrl}/settings.html?checkout=cancelled#premium`
    });

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Unable to start secure checkout." });
  }
});

router.get("/billing/subscription/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Valid user id is required." });
    const rows = await query(
      `SELECT plan_code, status, current_period_end, updated_at
       FROM billing_subscriptions WHERE user_id=? LIMIT 1`,
      [userId]
    );
    res.json({ subscription: rows[0] || null });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to load billing status." });
  }
});

router.post("/billing/create-portal-session", async (req, res) => {
  try {
    const userId = Number(req.body?.userId);
    if (!userId) return res.status(400).json({ error: "A logged-in user is required." });
    const rows = await query(
      "SELECT provider_customer_id FROM billing_subscriptions WHERE user_id=? LIMIT 1",
      [userId]
    );
    const customerId = rows[0]?.provider_customer_id;
    if (!customerId) {
      return res.status(404).json({ error: "No online billing subscription was found for this account." });
    }
    const config = stripeConfig();
    const session = await stripeRequest("billing_portal/sessions", {
      customer: customerId,
      return_url: `${config.frontendUrl}/settings.html#premium`
    });
    res.json({ portalUrl: session.url });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Unable to open billing management." });
  }
});

async function activateSubscription(session) {
  const userId = Number(session?.client_reference_id || session?.metadata?.user_id);
  if (!userId) return;
  const access = await getUserAccess(userId);
  if (access.is_admin) return;

  const plan = session?.metadata?.plan === "yearly" ? "yearly" : "monthly";
  await query("UPDATE users SET role='premium' WHERE user_id=?", [userId]);
  await query(
    `INSERT INTO billing_subscriptions
      (user_id, provider_customer_id, provider_subscription_id, plan_code, status)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      provider_customer_id=VALUES(provider_customer_id),
      provider_subscription_id=VALUES(provider_subscription_id),
      plan_code=VALUES(plan_code),
      status=VALUES(status)`,
    [userId, session.customer || null, session.subscription || null, plan, "active"]
  );
}

async function updateSubscriptionStatus(subscription) {
  const subscriptionId = String(subscription?.id || "");
  if (!subscriptionId) return;
  const active = ["active", "trialing"].includes(String(subscription.status || ""));
  const rows = await query(
    "SELECT user_id FROM billing_subscriptions WHERE provider_subscription_id=? LIMIT 1",
    [subscriptionId]
  );
  const userId = Number(rows[0]?.user_id || subscription?.metadata?.user_id);
  if (!userId) return;
  const access = await getUserAccess(userId);
  if (!access.is_admin) await query("UPDATE users SET role=? WHERE user_id=?", [active ? "premium" : "student", userId]);

  const periodEnd = Number(subscription.current_period_end)
    ? new Date(Number(subscription.current_period_end) * 1000)
    : null;
  await query(
    `INSERT INTO billing_subscriptions
      (user_id, provider_customer_id, provider_subscription_id, plan_code, status, current_period_end)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      provider_customer_id=VALUES(provider_customer_id),
      provider_subscription_id=VALUES(provider_subscription_id),
      plan_code=VALUES(plan_code),
      status=VALUES(status),
      current_period_end=VALUES(current_period_end)`,
    [
      userId,
      subscription.customer || null,
      subscriptionId,
      subscription?.metadata?.plan === "yearly" ? "yearly" : "monthly",
      subscription.status || "unknown",
      periodEnd
    ]
  );
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const values = Object.fromEntries(
    String(signatureHeader || "").split(",").map(item => {
      const [key, ...rest] = item.split("=");
      return [key, rest.join("=")];
    })
  );
  const timestamp = Number(values.t);
  if (!timestamp || !values.v1) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const actual = Buffer.from(values.v1, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

async function webhook(req, res) {
  try {
    const { webhookSecret } = stripeConfig();
    if (!webhookSecret) return res.status(503).send("Stripe webhook secret is not configured.");
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
    if (!verifyStripeSignature(rawBody, req.headers["stripe-signature"], webhookSecret)) {
      return res.status(400).send("Invalid webhook signature.");
    }

    const event = JSON.parse(rawBody);
    if (event.type === "checkout.session.completed") await activateSubscription(event.data.object);
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      await updateSubscriptionStatus(event.data.object);
    }
    res.json({ received: true });
  } catch (error) {
    console.log("Billing webhook error:", error.message || error);
    res.status(500).send("Unable to process billing webhook.");
  }
}

module.exports = { router, webhook };
