const express = require("express");
const router = express.Router();
const db = require("../db");
const { getUserAccess } = require("../accessControl");

router.get("/history/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) {
    return res.status(400).json({ error: "Valid user id is required." });
  }

  const access = await getUserAccess(userId).catch(() => ({ plan: "free" }));
  db.query(
    `SELECT
       h.history_id,
       h.activity_type,
       h.title,
       h.description,
       h.related_table,
       h.related_record_id,
       h.created_at,
       p.project_title,
       CASE
         WHEN h.related_table = 'srs_documents' THEN sd.prompt
         WHEN h.related_table = 'srs_analysis_reports' THEN sar.input_text
         WHEN h.related_table = 'uml_outputs' THEN ur.prompt
         WHEN h.related_table = 'uml_image_descriptions' THEN uid.extracted_text
         ELSE h.description
       END AS reusable_text,
       CASE
         WHEN h.related_table = 'srs_documents' THEN sd.generated_srs
         WHEN h.related_table = 'srs_analysis_reports' THEN sar.overall_summary
         WHEN h.related_table = 'uml_outputs' THEN uo.diagram_text
         WHEN h.related_table = 'uml_image_descriptions' THEN uid.generated_description
         ELSE NULL
       END AS saved_output
     FROM activity_history h
     LEFT JOIN projects p ON p.project_id = h.project_id
     LEFT JOIN srs_documents sd
       ON h.related_table = 'srs_documents'
      AND sd.srs_id = h.related_record_id
     LEFT JOIN srs_analysis_reports sar
       ON h.related_table = 'srs_analysis_reports'
      AND sar.analysis_id = h.related_record_id
     LEFT JOIN uml_outputs uo
       ON h.related_table = 'uml_outputs'
      AND uo.uml_output_id = h.related_record_id
     LEFT JOIN uml_requests ur
       ON ur.uml_request_id = uo.uml_request_id
     LEFT JOIN uml_image_descriptions uid
       ON h.related_table = 'uml_image_descriptions'
      AND uid.description_id = h.related_record_id
     WHERE h.user_id = ?
       AND h.activity_type NOT IN ('login', 'signup')
     ORDER BY h.created_at DESC
     LIMIT 200`,
    [userId],
    (error, rows) => {
      if (error) return res.status(500).json({ error: "Unable to load history." });
      const maximum = access.plan === "free" ? 3 : 100;
      res.json({ history: uniqueWorkHistory(rows).slice(0, maximum), plan: access.plan });
    }
  );
});

function uniqueWorkHistory(rows) {
  const seen = new Set();
  const uniqueRows = [];

  rows.forEach(row => {
    const key = [
      row.activity_type,
      normalizeHistoryText(row.project_title),
      normalizeHistoryText(row.title),
      normalizeHistoryText(row.reusable_text || row.description)
    ].join("|");

    if (seen.has(key)) return;
    seen.add(key);
    uniqueRows.push(row);
  });

  return uniqueRows;
}

function normalizeHistoryText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

module.exports = router;
