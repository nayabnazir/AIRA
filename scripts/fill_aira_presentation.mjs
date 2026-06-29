import fs from "node:fs/promises";
import path from "node:path";

const { FileBlob, PresentationFile } = await import(
  "file:///C:/Users/nayab/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs"
);

const source = "C:/Project/New folder/FYP/AI_SRS_UML_Project/samples/FYP Presentation sample.pptx";
const output = "C:/Project/New folder/FYP/AI_SRS_UML_Project/samples/AIRA_Project_Presentation.pptx";
const previewDir = "C:/Project/New folder/FYP/AI_SRS_UML_Project/outputs/aira-presentation-preview";

const titles = {
  2: "AIRA - Artificial Intelligence Requirement Analyzer",
  3: "Contents",
  4: "Introduction",
  5: "Existing System",
  6: "Problem Statement",
  7: "Proposed Solution",
  8: "Project Scope",
  9: "Project Objectives",
  10: "Functional Requirements",
  11: "Diagrams - Use Case Diagram",
  12: "Diagrams - ER Diagram",
  13: "Diagrams - Class Diagram",
  14: "Diagrams - Database Design",
  15: "Diagrams - Architecture Design Diagram",
  16: "Diagrams - Sequence Diagram",
  17: "Tasks Distribution",
  18: "Tools & Technologies",
  19: "Screenshots",
};

const body = {
  3: "Introduction\nExisting System\nProblem Statement\nProposed Solution\nProject Scope\nProject Objectives\nFunctional Requirements\nUML and Database Diagrams\nTools and Technologies\nScreenshots\nTasks Distribution\nConclusion",
  4: "AIRA is a web-based Artificial Intelligence Requirement Analyzer that helps users generate Software Requirements Specification documents, create UML diagrams, analyze SRS ambiguity, and describe uploaded UML images in a structured way.",
  5: "Existing requirement tools usually handle documentation, diagram drawing, or analysis separately. Many systems require manual SRS writing, separate UML tools, and manual review, which makes the process slow, inconsistent, and difficult for students or small teams.",
  6: "Students and developers often face difficulty converting project ideas into complete SRS documents and professional UML diagrams. Manual writing can miss requirements, introduce ambiguity, and require repeated formatting work.",
  7: "AIRA provides one integrated platform where users can generate SRS documents, create UML diagrams, analyze ambiguities, describe UML images, save history, and download outputs in usable formats. The system also supports premium access and admin-level unrestricted usage.",
  8: "The scope includes SRS generation, UML diagram generation, UML image description, SRS ambiguity analysis, user authentication, history management, document export, multilingual support, premium billing, and admin access control.",
  9: "Generate structured SRS documents from project names, descriptions, uploaded files, or diagrams.\nProduce editable UML diagrams and downloadable diagram outputs.\nAnalyze SRS documents for ambiguity and requirement quality.\nDescribe UML images with diagram-specific interpretation.\nProvide secure user accounts, history, pricing plans, and admin privileges.",
  10: "The system shall allow users to sign up and log in securely.\nThe system shall generate SRS documents based on user input or uploaded files.\nThe system shall generate UML diagrams from SRS or system descriptions.\nThe system shall analyze SRS ambiguity and provide recommendations.\nThe system shall describe uploaded UML diagram images.\nThe system shall allow users to download results and view history.",
};

const diagramText = {
  11: "Main actors: User and Admin.\nUser functions: sign up, log in, generate SRS, generate UML, upload UML image, check ambiguity, view history, and download output.\nAdmin functions: manage users and access premium features without usage limits.",
  12: "Core entities: users, uml_requests, uploaded_files, uml_outputs, srs_outputs, analysis_history, and subscription records.\nRelationships connect users with generated requests, uploaded files, saved outputs, and billing/access status.",
  13: "Major classes include User, Admin, BackendController, SRSRequest, UMLRequest, UploadedFile, UMLOutput, AnalysisResult, BillingPlan, and HistoryRecord.\nClasses are linked through request ownership, uploaded input, generated output, and account access.",
  14: "The database stores registered users, generated SRS records, UML requests, uploaded file metadata, output paths, history entries, premium plan status, and admin access flags.",
  15: "Architecture layers include Frontend UI, Node.js/Express backend, Python AI modules, MySQL database, optional Gemini/OpenRouter AI services, and PlantUML/Kroki rendering for professional UML output.",
  16: "Typical flow: user enters a project idea or uploads a file, frontend sends a request to backend, backend extracts content, AI service generates SRS/UML/analysis, result is saved in MySQL, and the output is returned for preview and download.",
};

const footerText = "Department of Computer Science & Information Technology, University of Chakwal";

function parseNdjson(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function setShapeText(presentation, record, text) {
  const shape = presentation.resolve(record.id);
  shape.text = text;
}

function addBodyText(slide, text) {
  const box = slide.shapes.add({
    geometry: "textbox",
    position: { left: 78, top: 125, width: 1100, height: 470 },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  box.text = text;
  box.text.style = { fontSize: 28, color: "#111827", typeface: "Aptos" };
}

async function saveBlob(blob, filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(await blob.arrayBuffer()));
}

const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const inspect = await presentation.inspect({
  kind: "slide,textbox,table,image",
  maxChars: 120000,
});
const records = parseNdjson(inspect.ndjson);

for (const record of records) {
  if (record.kind !== "textbox") continue;
  if (record.name === "Title 1" && titles[record.slide]) {
    setShapeText(presentation, record, titles[record.slide]);
  }
  if (record.name?.startsWith("Content Placeholder") && body[record.slide]) {
    setShapeText(presentation, record, body[record.slide]);
  }
  if (record.slide === 2 && record.name === "Title 1") {
    setShapeText(presentation, record, "AIRA - Artificial Intelligence Requirement Analyzer");
  }
  if (record.slide === 2 && record.name === "Subtitle 2" && record.text?.includes("Student Name")) {
    setShapeText(presentation, record, "Nayab Nazir\nLaiba Arshad\nAlishba Rustam");
  }
  if (record.slide === 2 && record.text?.startsWith("Supervisor")) {
    setShapeText(presentation, record, "Supervisor: ____________________");
  }
}

for (const slideNo of Object.keys(diagramText).map(Number)) {
  const slide = presentation.slides.items[slideNo - 1];
  addBodyText(slide, diagramText[slideNo]);
}

const table = presentation.resolve("tb/tsvu9kni");
table.setValues([
  ["Group Members", "Responsibilities"],
  [
    "Nayab Nazir",
    "Backend development, database integration, AI services, SRS generation, UML generation, billing/access control, and frontend integration.",
  ],
  [
    "Laiba Arshad",
    "Documentation, SRS content review, requirement validation, test cases, and report support.",
  ],
  [
    "Alishba Rustam",
    "Presentation preparation, UI testing, sample data collection, screenshots, and final demonstration support.",
  ],
]);

const toolsSlide = presentation.slides.items[17];
addBodyText(
  toolsSlide,
  "Frontend: HTML, CSS, JavaScript\nBackend: Node.js, Express.js, Python AI modules\nDatabase: MySQL with MySQL Workbench\nAI/ML: scikit-learn, joblib, TF-IDF, rule-based ambiguity detection\nOCR/Vision: OpenCV, Tesseract OCR, Pillow\nDocuments: PDF.js, DOCX extraction, PDF/DOC/TXT exports\nExternal/Optional: Gemini API, OpenRouter fallback, PlantUML/Kroki rendering"
);

const screenshotsSlide = presentation.slides.items[18];
addBodyText(
  screenshotsSlide,
  "Key application screens include Home Dashboard, SRS Generation, UML Diagram Generation, AI Analysis, UML Image Description, My History, Settings, and Premium Plans."
);

await fs.mkdir(previewDir, { recursive: true });
for (const [index, slide] of presentation.slides.items.entries()) {
  const png = await presentation.export({ slide, format: "png", scale: 1 });
  await saveBlob(png, path.join(previewDir, `slide-${String(index + 1).padStart(2, "0")}.png`));
}
const montage = await presentation.export({ format: "webp", montage: true, scale: 1 });
await saveBlob(montage, path.join(previewDir, "montage.webp"));

const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(output);
console.log(output);
