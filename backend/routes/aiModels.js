const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const db = require("../db");
const { assertFeatureAccess, recordUsage } = require("../accessControl");

const router = express.Router();
const AI_TIMEOUT_MS = 180000;

router.post("/check-ambiguity", async (req, res) => {
  try {
    const language = normalizeLanguage(req.body?.language);
    await assertFeatureAccess(req.body?.userId || req.body?.user_id, "ai_analysis", language);
    const result = await runAiAction("check_ambiguity", {
      text: req.body?.text || "",
      language
    });
    const saved = await saveAmbiguityAnalysis(req.body, result).catch(() => null);
    await recordUsage(req.body?.userId || req.body?.user_id, "ai_analysis");
    res.json({ ...result, saved });
  } catch (error) {
    sendAccessError(res, error, "Ambiguity checking failed.");
  }
});

router.post("/generate-uml", async (req, res) => {
  try {
    const rawText = req.body?.text || "";
    const diagramType = req.body?.diagramType || req.body?.diagram_type || "auto";
    await assertFeatureAccess(req.body?.userId || req.body?.user_id, "uml_generation", "English");

    const result = await runAiAction("generate_uml", {
      text: rawText,
      diagramType,
      diagramReference: req.body?.diagramReference || null
    });

    const saved = await saveUmlGeneration(req.body, result).catch(() => null);
    await recordUsage(req.body?.userId || req.body?.user_id, "uml_generation");
    res.json({ ...result, saved });
  } catch (error) {
    sendAccessError(res, error, "UML generation failed.");
  }
});

router.post("/describe-uml-image", async (req, res) => {
  try {
    const language = normalizeLanguage(req.body?.language);
    await assertFeatureAccess(req.body?.userId || req.body?.user_id, "uml_analysis", language);
    const result = await runAiAction("describe_uml_image", {
      imageData: req.body?.imageData || req.body?.fileData || "",
      diagramProject: req.body?.diagramProject || null,
      confirmedStructure: req.body?.confirmedStructure || null,
      diagramType: req.body?.diagramType || "",
      fileName: req.body?.fileName || "uml-image.png",
      mimeType: req.body?.mimeType || "",
      context: withLanguageInstruction(req.body?.context || "", language, "UML image descriptions, summaries, and headings"),
      language
    }, 120000);
    const saved = req.body?.confirmedStructure || req.body?.diagramProject
      ? await saveUmlImageDescription(req.body, result).catch(() => null)
      : null;
    await recordUsage(req.body?.userId || req.body?.user_id, "uml_analysis");
    res.json({ ...result, saved });
  } catch (error) {
    sendAccessError(res, error, "UML image description failed.");
  }
});

function sendAccessError(res, error, fallback) {
  res.status(error.status || 500).json({
    error: error.message || fallback,
    code: error.code || null,
    feature: error.feature || null,
    limit: error.limit || null
  });
}

function normalizeLanguage(language) {
  const value = String(language || "English").trim();
  return value || "English";
}

function withLanguageInstruction(text, language, target) {
  const value = String(text || "").trim();
  if (!language || language === "English") return value;
  return [`Use ${language} for all ${target}.`, value].filter(Boolean).join("\n\n");
}

function buildUmlPrompt(text, diagramType) {
  const type = String(diagramType || "").toLowerCase();

  const commonRules = `
You are a professional UML analyst.

Generate UML strictly from the given SRS/system description.

Important rules:
- Do not copy table headers as diagram elements.
- Ignore words like Function, Summary, Description, Requirement, Scope, Purpose, References.
- Ignore document section titles.
- Ignore hardware/software requirements unless the selected diagram type needs them.
- Use only real actors, entities, classes, actions, workflows, or data objects from the SRS.
- Do not invent unrelated features.
- Return only valid PlantUML code.
`;

  const useCaseRules = `
Use Case Diagram Rules:
- Actors must be real user roles only, such as Member, Librarian, Administrator, Customer, Admin, Staff.
- Use cases must be verb-based actions.
- Good examples: Search Catalog, Borrow Book, Return Book, Manage Members, Generate Reports.
- Bad examples: Function, Summary, System, Requirement, Description.
- Extract use cases mainly from Functional Requirements.
- Do not create use cases from table headings or section headings.
- Connect each actor only to relevant use cases.
`;

  const classRules = `
Class Diagram Rules:
- Classes must be real system objects/entities.
- Use nouns as class names.
- Add important attributes and methods only when clearly supported by the SRS.
- Do not create classes from table headings.
`;

  const sequenceRules = `
Sequence Diagram Rules:
- Identify one main workflow from the SRS.
- Use real actors and system components.
- Show messages in correct order.
- Do not include table headings as participants.
`;

  const erdRules = `
ERD Diagram Rules:
- Entities must be real data objects.
- Use primary keys, foreign keys, and relationships where possible.
- Do not create entities from table headings.
`;

  const activityRules = `
Activity Diagram Rules:
- Show real workflow steps from the SRS.
- Use action-based steps.
- Do not include table headings as activities.
`;

  let specificRules = "";

  if (type.includes("use")) specificRules = useCaseRules;
  else if (type.includes("class")) specificRules = classRules;
  else if (type.includes("sequence")) specificRules = sequenceRules;
  else if (type.includes("erd")) specificRules = erdRules;
  else if (type.includes("activity")) specificRules = activityRules;
  else specificRules = useCaseRules + classRules + sequenceRules + erdRules + activityRules;

  return `
${commonRules}

${specificRules}

SRS / System Description:
${String(text || "").trim()}
`;
}

function runAiAction(action, payload, timeoutMs = AI_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "..", "aira-ai", "ai_api.py");
    const child = spawn("python", [scriptPath], {
      cwd: path.join(__dirname, "..", "aira-ai"),
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("AI model response timed out."));
    }, timeoutMs);

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });

    child.on("error", error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      let parsed = null;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        reject(new Error(stderr.trim() || "AI model returned an unreadable response."));
        return;
      }

      if (code !== 0 || parsed.ok === false) {
        reject(new Error(parsed.error || stderr.trim() || "AI model failed."));
        return;
      }

      resolve(parsed.result);
    });

    child.stdin.write(JSON.stringify({ action, ...payload }));
    child.stdin.end();
  });
}

async function saveAmbiguityAnalysis(body, result) {
  const userId = Number(body?.userId) || Number(body?.user_id);
  if (!userId) return null;

  const text = String(body?.text || "").trim();
  const summary = result?.summary || {};
  const ambiguityScore = summary.total ? Number(((summary.ambiguous || 0) / summary.total * 100).toFixed(2)) : 0;
  const analysisId = await queryInsert(
    "INSERT INTO srs_analysis_reports (user_id, input_text, ambiguity_score, overall_summary, status) VALUES (?, ?, ?, ?, 'analyzed')",
    [userId, text.slice(0, 65000), ambiguityScore, `Ambiguous: ${summary.ambiguous || 0}, Clear: ${summary.clear || 0}`]
  );

  const issues = Array.isArray(result?.results) ? result.results.filter(item => item.ambiguous) : [];
  for (const issue of issues.slice(0, 30)) {
    await queryInsert(
      "INSERT INTO srs_analysis_issues (analysis_id, issue_type, severity, requirement_text, issue_description, suggested_fix) VALUES (?, 'ambiguity', ?, ?, ?, ?)",
      [
        analysisId,
        issue.detected_terms?.length ? "medium" : "low",
        String(issue.requirement || "").slice(0, 4000),
        `Ambiguous terms detected: ${(issue.detected_terms || []).join(", ") || "unclear wording"}.`,
        "Replace vague words with measurable, testable wording."
      ]
    );
  }

  await queryInsert(
    "INSERT INTO activity_history (user_id, activity_type, title, description, related_table, related_record_id) VALUES (?, 'srs_analysis', ?, ?, 'srs_analysis_reports', ?)",
    [userId, "SRS Ambiguity Analysis", `Checked ${summary.total || 0} requirement(s); found ${summary.ambiguous || 0} ambiguous item(s).`, analysisId]
  );

  return { analysisId };
}

async function saveUmlGeneration(body, result) {
  const userId = Number(body?.userId) || Number(body?.user_id);
  if (!userId) return null;

  const text = String(body?.text || "").trim();
  const diagramType = normalizeUmlType(result?.diagram_type || body?.diagramType || body?.diagram_type || "use_case");
  const title = inferTitleFromText(text, `${diagramType.replace("_", " ")} diagram`);
  const projectId = await queryInsert(
    "INSERT INTO projects (user_id, project_title, project_description) VALUES (?, ?, ?)",
    [userId, title, text.slice(0, 65000)]
  );
  const requestId = await queryInsert(
    "INSERT INTO uml_requests (user_id, project_id, uml_type, prompt, status) VALUES (?, ?, ?, ?, 'generated')",
    [userId, projectId, diagramType, text.slice(0, 65000)]
  );
  const diagram = result?.diagram || {};
  const outputId = await queryInsert(
    "INSERT INTO uml_outputs (uml_request_id, output_title, diagram_text, diagram_json) VALUES (?, ?, ?, ?)",
    [requestId, `${title} ${diagramType.replace("_", " ")} diagram`, diagram.plantuml || "", JSON.stringify(diagram)]
  );
  await queryInsert(
    "INSERT INTO activity_history (user_id, project_id, activity_type, title, description, related_table, related_record_id) VALUES (?, ?, 'uml_generation', ?, ?, 'uml_outputs', ?)",
    [userId, projectId, `${labelUmlType(diagramType)} Generated`, title, outputId]
  );
  return { projectId, requestId, outputId };
}

async function saveUmlImageDescription(body, result) {
  const userId = Number(body?.userId) || Number(body?.user_id);
  if (!userId) return null;

  const fileName = String(body?.fileName || "uml-image.png").trim();
  const fileSizeKb = body?.diagramProject
    ? Math.max(Math.ceil(Buffer.byteLength(JSON.stringify(body.diagramProject), "utf8") / 1024), 1)
    : getBase64SizeKb(body?.imageData || body?.fileData || "");
  const fileType = body?.diagramProject ? "application/vnd.aira.uml+json" : String(body?.mimeType || "");
  const fileId = await queryInsert(
    "INSERT INTO uploaded_files (user_id, feature_type, original_file_name, file_type, file_size_kb) VALUES (?, 'uml_image_description', ?, ?, ?)",
    [userId, fileName, fileType, fileSizeKb]
  );
  const descriptionText = Array.isArray(result?.description) ? result.description.join("\n") : String(result?.description || "");
  const descriptionId = await queryInsert(
    "INSERT INTO uml_image_descriptions (user_id, image_file_id, user_context, extracted_text, generated_description, status) VALUES (?, ?, ?, ?, ?, 'generated')",
    [userId, fileId, String(body?.context || ""), String(result?.extracted_text || ""), descriptionText]
  );
  await queryInsert(
    "INSERT INTO activity_history (user_id, activity_type, title, description, related_table, related_record_id) VALUES (?, 'uml_image_description', ?, ?, 'uml_image_descriptions', ?)",
    [userId, "UML Diagram Description", `Analyzed uploaded UML diagram: ${fileName}`, descriptionId]
  );
  return { fileId, descriptionId };
}

function normalizeUmlType(type) {
  const value = String(type || "").toLowerCase().replace("-", "_").replace(" ", "_");
  if (value === "usecase") return "use_case";
  if (["use_case", "class", "sequence", "erd", "activity"].includes(value)) return value;
  return "use_case";
}

function labelUmlType(type) {
  return {
    use_case: "Use Case Diagram",
    class: "Class Diagram",
    sequence: "Sequence Diagram",
    erd: "ERD Diagram",
    activity: "Activity Diagram"
  }[type] || "UML Diagram";
}

function inferTitleFromText(text, fallback) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/software requirements specification/ig, "")
    .trim();
  const words = cleaned.split(" ").filter(Boolean).slice(0, 8).join(" ");
  return words ? toTitleCase(words).slice(0, 180) : toTitleCase(fallback).slice(0, 180);
}

function toTitleCase(value) {
  return String(value || "").replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function getBase64SizeKb(dataUrl) {
  const value = String(dataUrl || "");
  const base64 = value.includes(",") ? value.split(",").pop() : value;
  return Number((base64.length * 0.75 / 1024).toFixed(2)) || null;
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
