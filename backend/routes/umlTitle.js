const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const router = express.Router();

const EXTENSIONS = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg"
};

router.post("/uml-image-title", async (req, res) => {
  const { imageData, fileName, mimeType } = req.body || {};
  const parsedImage = parseImageData(imageData, mimeType);

  if (!parsedImage) {
    return res.status(400).json({ title: "", text: "", error: "Valid image data is required." });
  }

  const extension = EXTENSIONS[parsedImage.mimeType] || path.extname(fileName || "").toLowerCase() || ".png";
  const imagePath = path.join(os.tmpdir(), `aira-uml-title-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`);

  try {
    fs.writeFileSync(imagePath, parsedImage.buffer);
    const result = await extractTitleWithPython(imagePath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ title: "", text: "", error: error.message || "Unable to extract UML title." });
  } finally {
    fs.rm(imagePath, { force: true }, () => {});
  }
});

function parseImageData(imageData, mimeType) {
  if (!imageData || typeof imageData !== "string") return null;

  const dataUrlMatch = imageData.match(/^data:([^;]+);base64,(.+)$/);
  const resolvedMimeType = (dataUrlMatch?.[1] || mimeType || "").toLowerCase();
  const base64 = dataUrlMatch?.[2] || imageData;

  if (!EXTENSIONS[resolvedMimeType]) return null;

  return {
    mimeType: resolvedMimeType,
    buffer: Buffer.from(base64, "base64")
  };
}

function extractTitleWithPython(imagePath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "..", "aira-ai", "extract_uml_title.py");
    const child = spawn("python", [scriptPath, imagePath], {
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
        reject(new Error(stderr.trim() || "OCR process failed."));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("OCR returned an unreadable response."));
      }
    });
  });
}

module.exports = router;
