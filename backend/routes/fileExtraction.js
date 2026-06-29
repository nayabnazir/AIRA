const express = require("express");
const path = require("path");
const { spawn } = require("child_process");

const router = express.Router();

router.post("/extract-file", async (req, res) => {
  const extension = path.extname(String(req.body?.fileName || "")).toLowerCase();
  const mimeType = String(req.body?.mimeType || "").toLowerCase();
  if (extension === ".pdf" || mimeType === "application/pdf") {
    try {
      const text = await extractPdfText(req.body?.fileData || "");
      res.json({
        fileName: req.body?.fileName || "uploaded.pdf",
        mimeType: req.body?.mimeType || "application/pdf",
        title: inferTitle(text, req.body?.fileName),
        text
      });
    } catch (error) {
      res.status(500).json({ text: "", title: "", error: error.message || "PDF extraction failed." });
    }
    return;
  }

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

  child.on("error", error => {
    res.status(500).json({ text: "", title: "", error: error.message });
  });

  child.on("close", code => {
    if (code !== 0) {
      res.status(500).json({ text: "", title: "", error: stderr.trim() || "File extraction failed." });
      return;
    }

    try {
      res.json(JSON.parse(stdout));
    } catch {
      res.status(500).json({ text: "", title: "", error: "File extraction returned an unreadable response." });
    }
  });

  child.stdin.write(JSON.stringify(req.body || {}));
  child.stdin.end();
});

async function extractPdfText(fileData) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const base64 = String(fileData || "").includes(",")
    ? String(fileData).split(",").pop()
    : String(fileData || "");
  const data = new Uint8Array(Buffer.from(base64, "base64"));
  const document = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = [];
    let line = [];
    let lastY = null;
    for (const item of content.items) {
      const y = Math.round(item.transform?.[5] || 0);
      if (lastY !== null && Math.abs(y - lastY) > 3 && line.length) {
        lines.push(line.join(" "));
        line = [];
      }
      if (String(item.str || "").trim()) line.push(String(item.str).trim());
      lastY = y;
    }
    if (line.length) lines.push(line.join(" "));
    pages.push(lines.join("\n"));
  }
  return normalizeExtractedText(pages.join("\n\n")).slice(0, 60000);
}

function normalizeExtractedText(value) {
  return String(value || "")
    .replace(/\s*-\s*/g, "-")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferTitle(text, fileName) {
  const projectMatch = String(text || "").match(/Project\s+Name\s*:\s*([^\n]+)/i);
  if (projectMatch?.[1]) return projectMatch[1].trim().slice(0, 100);
  return path.basename(String(fileName || "uploaded document"), path.extname(String(fileName || "")));
}

module.exports = router;
