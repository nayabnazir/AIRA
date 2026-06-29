const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const db = require("../db");
const { assertFeatureAccess, recordUsage } = require("../accessControl");

const router = express.Router();
let srsWorker = null;
let srsWorkerBuffer = "";
let srsRequestId = 1;
const pendingSrsRequests = new Map();

router.post("/generate-srs", async (req, res) => {
  const payload = await normalizePayload(req.body || {});

  if (payload.hasUploadedFiles && !payload.extractedText && !payload.prompt) {
    return res.status(422).json({
      error: "The uploaded file could not be read clearly. Please upload a clearer image/document or add a short project description."
    });
  }

  if (!payload.title && !payload.projectDescription) {
    return res.status(400).json({ error: "Project title or description is required." });
  }

  try {
    await assertFeatureAccess(payload.userId, "srs_generation", payload.language);
    const generated = await runSrsModel(payload);
    const saved = await saveSrsGeneration(payload, generated).catch(() => null);
    await recordUsage(payload.userId, "srs_generation");
    res.json({ ...generated, saved });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || "Unable to generate SRS.",
      code: error.code || null,
      feature: error.feature || null,
      limit: error.limit || null
    });
  }
});

async function normalizePayload(body) {
  const features = Array.isArray(body.features) ? body.features.join(", ") : "";
  const extractedFiles = await extractUploadedFiles(body.uploadedFiles);
  const uploadedText = extractedFiles
    .map(file => file.text ? formatExtractedFileText(file) : "")
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12000);
  const extractedTitle = extractedFiles.find(file => file.title)?.title || "";
  const projectDescription = [
    body.notes,
    uploadedText,
    body.domain ? `Domain: ${body.domain}` : "",
    body.detail ? `Detail level: ${body.detail}` : "",
    body.actors ? `Actors: ${body.actors}` : "",
    body.dataManaged ? `Data managed: ${body.dataManaged}` : "",
    features ? `Features: ${features}` : ""
  ].filter(Boolean).join("\n");

  return {
    userId: Number(body.userId) || null,
    title: chooseProjectTitle(body, extractedTitle),
    projectDescription,
    prompt: String(body.notes || "").trim(),
    language: String(body.language || "English").trim() || "English",
    referenceFileName: String(body.referenceFileName || "").trim(),
    umlImageFileName: String(body.umlImageFileName || "").trim(),
    extractedFiles,
    extractedText: uploadedText,
    hasUploadedFiles: Array.isArray(body.uploadedFiles) && body.uploadedFiles.some(file => file && !file.skipped && file.fileData)
  };
}

function chooseProjectTitle(body, extractedTitle) {
  const submittedTitle = String(body.title || "").trim();
  const ocrTitle = String(extractedTitle || "").trim();
  if (ocrTitle && (!submittedTitle || isGenericUploadedTitle(submittedTitle, body))) return ocrTitle;
  return submittedTitle || ocrTitle || inferTitle(body);
}

function isGenericUploadedTitle(title, body) {
  const value = String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const imageName = String(body.umlImageFileName || "").toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, " ").trim();
  if (!value) return true;
  if (imageName && (value === imageName || imageName.includes(value) || value.includes(imageName))) return true;
  return /^(activity|activity diagram|activity example|uml|uml diagram|diagram|image|example|use case|class diagram|sequence diagram|erd diagram)$/.test(value);
}

async function extractUploadedFiles(files) {
  if (!Array.isArray(files) || !files.length) return [];
  const selectedFiles = files
    .filter(file => file && !file.skipped && file.fileData)
    .slice(0, 1);
  return Promise.all(selectedFiles.map(async file => {
    try {
      return await extractUploadedFile(file);
    } catch {
      return { fileName: file.fileName || "", text: "", title: "" };
    }
  }));
}

function extractUploadedFile(file) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "..", "aira-ai", "extract_uploaded_file.py");
    const child = spawn("python", [scriptPath], {
      cwd: path.join(__dirname, "..", "aira-ai"),
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || "File extraction failed."));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("File extraction returned an unreadable response."));
      }
    });

    child.stdin.write(JSON.stringify(file || {}));
    child.stdin.end();
  });
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Database save timed out.")), timeoutMs))
  ]);
}

function inferTitle(body) {
  const fileName = body.umlImageFileName || body.referenceFileName || "The Proposed System";
  return String(fileName).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

function formatExtractedFileText(file) {
  const name = String(file.fileName || "").trim();
  const text = String(file.text || "").trim();
  const isImage = String(file.mimeType || "").startsWith("image/");
  if (!text) return "";
  return [
    isImage ? `Content extracted from uploaded UML diagram image${name ? ` (${name})` : ""}:` : `Content extracted from uploaded document${name ? ` (${name})` : ""}:`,
    text
  ].join("\n");
}

function runSrsModel(payload) {
  return new Promise((resolve, reject) => {
    const worker = getSrsWorker();
    const id = srsRequestId++;
    const timeout = setTimeout(() => {
      pendingSrsRequests.delete(id);
      reject(new Error("SRS generation timed out."));
    }, 190000);

    pendingSrsRequests.set(id, { resolve, reject, timeout });
    worker.stdin.write(JSON.stringify({
      id,
      payload: {
        title: payload.title,
        // Generation instructions must not be mixed with domain evidence.
        project_description: payload.projectDescription,
        language: payload.language,
        top_n: 16
      }
    }) + "\n");
  });
}

function getSrsWorker() {
  if (srsWorker && !srsWorker.killed) return srsWorker;

  const scriptPath = path.join(__dirname, "..", "aira-ai", "srs_worker.py");
  try {
    srsWorker = spawn(process.env.PYTHON_BIN || "python", [scriptPath], {
      cwd: path.join(__dirname, "..", "aira-ai"),
      windowsHide: true
    });
  } catch (error) {
    srsWorker = null;
    throw new Error(`Unable to start SRS worker: ${error.message}`);
  }
  srsWorkerBuffer = "";

  srsWorker.stdout.on("data", chunk => {
    srsWorkerBuffer += chunk.toString();
    const lines = srsWorkerBuffer.split(/\r?\n/);
    srsWorkerBuffer = lines.pop() || "";

    lines.filter(Boolean).forEach(line => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }

      const pending = pendingSrsRequests.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      pendingSrsRequests.delete(message.id);

      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error || "SRS model process failed."));
    });
  });

  srsWorker.on("error", error => {
    rejectPendingSrsRequests(error);
    srsWorker = null;
  });

  srsWorker.on("close", () => {
    rejectPendingSrsRequests(new Error("SRS worker stopped."));
    srsWorker = null;
  });

  return srsWorker;
}

function rejectPendingSrsRequests(error) {
  pendingSrsRequests.forEach(pending => {
    clearTimeout(pending.timeout);
    pending.reject(error);
  });
  pendingSrsRequests.clear();
}

async function saveSrsGeneration(payload, generated) {
  const userId = payload.userId || await ensureGuestUser();
  const projectId = await queryInsert(
    "INSERT INTO projects (user_id, project_title, project_description) VALUES (?, ?, ?)",
    [userId, generated.project_title || payload.title, payload.projectDescription]
  );
  const srsId = await queryInsert(
    "INSERT INTO srs_documents (user_id, project_id, prompt, generated_srs, status) VALUES (?, ?, ?, ?, 'generated')",
    [userId, projectId, payload.prompt || payload.projectDescription, generated.srs || ""]
  );
  await queryInsert(
    "INSERT INTO activity_history (user_id, project_id, activity_type, title, description, related_table, related_record_id) VALUES (?, ?, 'srs_generation', ?, ?, 'srs_documents', ?)",
    [userId, projectId, generated.project_title || payload.title, "Generated SRS using trained model.", srsId]
  );

  return { userId, projectId, srsId };
}

async function ensureGuestUser() {
  await query(
    "INSERT INTO users (full_name, email, password, role) VALUES ('Guest User', 'guest@aira.local', 'guest-local-user', 'student') ON DUPLICATE KEY UPDATE user_id=LAST_INSERT_ID(user_id)"
  );
  const result = await query("SELECT user_id FROM users WHERE email='guest@aira.local' LIMIT 1");
  return result[0]?.user_id || 1;
}

function queryInsert(sql, params = []) {
  return query(sql, params).then(result => result.insertId);
}

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    });
  });
}

module.exports = router;
