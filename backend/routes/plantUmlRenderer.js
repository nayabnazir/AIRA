const express = require("express");
const zlib = require("zlib");

const router = express.Router();
const DEFAULT_PLANTUML_SERVER = "https://www.plantuml.com/plantuml";
const DEFAULT_KROKI_SERVER = "https://kroki.io/plantuml";
const RENDER_TIMEOUT_MS = 45000;

function isValidRender(payload, format, contentType) {
  if (!payload.length) return false;
  if (format === "png") {
    return payload.length > 8
      && payload[0] === 0x89
      && payload.subarray(1, 4).toString("ascii") === "PNG";
  }

  const start = payload.subarray(0, Math.min(payload.length, 500)).toString("utf8").trimStart();
  return contentType.includes("image/svg+xml") || start.startsWith("<svg") || start.startsWith("<?xml");
}

function encodePlantUml(source) {
  const compressed = zlib.deflateRawSync(Buffer.from(source, "utf8"));
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
  let encoded = "";

  for (let i = 0; i < compressed.length; i += 3) {
    const b1 = compressed[i];
    const b2 = i + 1 < compressed.length ? compressed[i + 1] : 0;
    const b3 = i + 2 < compressed.length ? compressed[i + 2] : 0;
    encoded += alphabet[b1 >> 2];
    encoded += alphabet[((b1 & 0x3) << 4) | (b2 >> 4)];
    encoded += alphabet[((b2 & 0xF) << 2) | (b3 >> 6)];
    encoded += alphabet[b3 & 0x3F];
  }

  return encoded;
}

async function renderWithServer(server, source, format, signal) {
  const response = await fetch(`${server}/${format}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Accept": format === "svg" ? "image/svg+xml" : "image/png"
    },
    body: source,
    signal
  });

  if (!response.ok) {
    throw new Error(`Renderer returned HTTP ${response.status}.`);
  }

  const payload = Buffer.from(await response.arrayBuffer());
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!isValidRender(payload, format, contentType)) {
    throw new Error("Renderer returned an invalid diagram response.");
  }
  return payload;
}

async function renderWithEncodedServer(server, source, format, signal) {
  const encoded = encodePlantUml(source);
  const response = await fetch(`${server}/${format}/${encoded}`, {
    method: "GET",
    headers: {
      "Accept": format === "svg" ? "image/svg+xml" : "image/png"
    },
    signal
  });

  if (!response.ok) {
    throw new Error(`Renderer returned HTTP ${response.status}.`);
  }

  const payload = Buffer.from(await response.arrayBuffer());
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!isValidRender(payload, format, contentType)) {
    throw new Error("Renderer returned an invalid diagram response.");
  }
  return payload;
}

router.post("/render-plantuml", async (req, res) => {
  const source = String(req.body?.source || "").trim();
  const format = String(req.body?.format || "svg").toLowerCase();

  if (!source.startsWith("@startuml") || !source.includes("@enduml")) {
    res.status(400).json({ error: "Valid PlantUML source is required." });
    return;
  }

  if (!["svg", "png"].includes(format)) {
    res.status(400).json({ error: "Only SVG and PNG PlantUML rendering is supported." });
    return;
  }

  const configuredServer = String(process.env.PLANTUML_SERVER_URL || "").replace(/\/+$/, "");
  const servers = [...new Set([
    configuredServer,
    DEFAULT_KROKI_SERVER,
    DEFAULT_PLANTUML_SERVER
  ].filter(Boolean))];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);

  try {
    let payload = null;
    let lastError = null;
    for (const server of servers) {
      try {
        payload = await renderWithServer(server, source, format, controller.signal);
        break;
      } catch (error) {
        lastError = error;
      }
      try {
        payload = await renderWithEncodedServer(server, source, format, controller.signal);
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!payload) throw lastError || new Error("No PlantUML renderer is available.");

    res.setHeader("Content-Type", format === "svg" ? "image/svg+xml; charset=utf-8" : "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(payload);
  } catch (error) {
    const message = error.name === "AbortError"
      ? "PlantUML rendering timed out."
      : error.message || "PlantUML rendering failed.";
    res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
});

module.exports = router;
