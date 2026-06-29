/* ================= SIDEBAR TOGGLE ================= */
function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.toggle("collapsed");
}

/* ================= PASSWORD TOGGLE ================= */
function togglePassword(inputId, icon) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace("fa-eye", "fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.replace("fa-eye-slash", "fa-eye");
    }
}

/* ================= CHECK SRS (BUTTON CLICK ONLY) ================= */
let currentAnalysisMode = "srs";

function setAnalysisMode(mode) {
    currentAnalysisMode = mode === "uml" ? "uml" : "srs";
    const srsBtn = document.getElementById("srsAnalysisModeBtn");
    const umlBtn = document.getElementById("umlAnalysisModeBtn");
    const fileLabel = document.getElementById("analysisFileLabel");
    const attachText = document.getElementById("analysisAttachText");
    const helperText = document.getElementById("analysisHelperText");
    const submitBtn = document.getElementById("analysisSubmitBtn");
    const intro = document.getElementById("analysisIntro");
    const textarea = document.getElementById("analysisTextInput") || document.querySelector("textarea");
    const resultBox = document.getElementById("resultBox");

    srsBtn?.classList.toggle("active", currentAnalysisMode === "srs");
    umlBtn?.classList.toggle("active", currentAnalysisMode === "uml");
    srsBtn?.setAttribute("aria-selected", String(currentAnalysisMode === "srs"));
    umlBtn?.setAttribute("aria-selected", String(currentAnalysisMode === "uml"));

    if (currentAnalysisMode === "uml") {
        if (fileLabel) fileLabel.textContent = uiPhrase("Upload UML Diagram Image");
        if (attachText) attachText.textContent = uiPhrase("Attach UML Image");
        if (helperText) helperText.textContent = uiPhrase("Supported formats: PNG, JPG, JPEG, WEBP, BMP");
        if (submitBtn) submitBtn.textContent = uiPhrase("Generate UML Description");
        if (intro) intro.textContent = uiPhrase("Upload a UML diagram image to generate a real structured description in tabular form.");
        if (textarea) textarea.placeholder = uiPhrase("Optional: add context about this diagram, project, or expected workflow...");
    } else {
        if (fileLabel) fileLabel.textContent = uiPhrase("Upload SRS Document");
        if (attachText) attachText.textContent = uiPhrase("Attach SRS File");
        if (helperText) helperText.textContent = uiPhrase("Supported formats: PDF, DOC, DOCX, TXT");
        if (submitBtn) submitBtn.textContent = uiPhrase("Check Ambiguity");
        if (intro) intro.textContent = uiPhrase("Upload an SRS document to check ambiguity, or switch to UML Description to generate a structured explanation from a diagram image.");
        if (textarea) textarea.placeholder = uiPhrase("Optional: paste SRS text here if you do not want to upload a file...");
    }

    if (resultBox) resultBox.style.display = "none";
}

async function checkAmbiguity() {
    if (currentAnalysisMode === "uml") {
        await analyzeUMLFromAnalysisPage();
        return;
    }

    const textarea = document.getElementById("analysisTextInput") || document.querySelector("textarea");
    const file = document.getElementById("srsFile")?.files?.[0];
    const box = document.getElementById("resultBox");
    const title = document.getElementById("analysisResultTitle");
    const content = document.getElementById("ambiguityOutputContent");
    if (!box || !content) return;

    box.style.display = "block";
    if (title) title.textContent = uiPhrase("Ambiguity Analysis Preview");
    if (!content.querySelector("#ambiguityList")) content.innerHTML = `<ul id="ambiguityList"></ul>`;
    const activeList = content.querySelector("#ambiguityList");
    if (!activeList) return;
    activeList.innerHTML = `<li>${escapeHTML(uiPhrase("Checking ambiguity with trained model..."))}</li>`;

    try {
        const parts = [];
        const typedText = String(textarea?.value || "").trim();
        if (typedText) parts.push(typedText);
        if (file) {
            if (file.type.startsWith("image/")) {
                activeList.innerHTML = `<li>${escapeHTML(uiPhrase("Please switch to UML Description mode to analyze an image file."))}</li>`;
                return;
            }
            const extracted = await extractFileContent(file);
            if (extracted?.text) parts.push(extracted.text);
        }

        const text = parts.join("\n\n").trim();
        if (!text) {
            activeList.innerHTML = `<li>${escapeHTML(uiPhrase("Please paste SRS text or attach an SRS file first."))}</li>`;
            return;
        }

        const response = await fetch(`${AIRA_API_BASE}/api/check-ambiguity`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, userId: getCurrentUserId(), language: getSrsLanguagePreference() })
        });
        const result = await response.json();
        if (!response.ok) {
            handleAccessApiError(result, "ai_analysis");
            throw new Error(result.error || uiPhrase("Unable to check ambiguity."));
        }

        renderAmbiguityResults(result, activeList);
        await refreshAccessSummary();
    } catch (error) {
        activeList.innerHTML = `<li>${escapeHTML(error.message || uiPhrase("Ambiguity checking failed."))}</li>`;
    }
}

async function analyzeUMLFromAnalysisPage() {
    const box = document.getElementById("resultBox");
    const title = document.getElementById("analysisResultTitle");
    const content = document.getElementById("ambiguityOutputContent");
    const file = document.getElementById("srsFile")?.files?.[0];
    const textarea = document.getElementById("analysisTextInput") || document.querySelector("textarea");
    if (!box || !content) return;

    box.style.display = "block";
    if (title) title.textContent = uiPhrase("UML Description Table");

    if (!file || !file.type.startsWith("image/")) {
        content.innerHTML = `<p>${escapeHTML(uiPhrase("Please attach a UML diagram image first."))}</p>`;
        return;
    }

    content.innerHTML = `<p><em>${escapeHTML(uiPhrase("Reading UML image and generating description..."))}</em></p>`;

    try {
        const imageData = await fileToDataUrl(file);
        const response = await fetch(`${AIRA_API_BASE}/api/describe-uml-image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: getCurrentUserId(),
                imageData,
                fileName: file.name,
                mimeType: file.type,
                context: String(textarea?.value || "").trim(),
                language: getSrsLanguagePreference()
            })
        });
        const result = await response.json();
        if (!response.ok) {
            handleAccessApiError(result, "uml_analysis");
            throw new Error(result.error || uiPhrase("Unable to analyze UML image."));
        }
        content.innerHTML = buildUMLDescriptionTable(result, file.name);
        await refreshAccessSummary();
    } catch (error) {
        content.innerHTML = `<p>${escapeHTML(error.message || uiPhrase("UML image analysis failed."))}</p>`;
    }
}

function buildUMLDescriptionTable(result, fileName = "") {
    if (result?.professional_report) {
        return renderProfessionalAnalysisReport(result.professional_report, {
            sourceLabel: fileName || uiPhrase("Uploaded UML diagram"),
            extractedText: result?.extracted_text || ""
        });
    }

    const extractedText = String(result?.extracted_text || "").trim();
    const description = Array.isArray(result?.description) ? result.description : [];
    const rows = buildUMLDescriptionRows(result, fileName);
    return `
      <div class="analysis-table-wrap">
        <table class="analysis-table">
          <thead>
            <tr>
              <th>${escapeHTML(uiPhrase("Section"))}</th>
              <th>${escapeHTML(uiPhrase("Real UML Description"))}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td>${escapeHTML(row.label)}</td>
                <td>${escapeHTML(row.value)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      ${description.length ? `
        <h4>${escapeHTML(uiPhrase("Detailed Description"))}</h4>
        <ul class="analysis-description-list">
          ${description.map(item => `<li>${escapeHTML(item)}</li>`).join("")}
        </ul>` : ""}
      ${extractedText ? `<details class="analysis-extracted-text"><summary>${escapeHTML(uiPhrase("View Extracted Text"))}</summary><p>${escapeHTML(extractedText)}</p></details>` : ""}`;
}

function renderProfessionalAnalysisReport(report, options = {}) {
    const tables = Array.isArray(report?.tables) ? report.tables : [];
    return `
      <article class="professional-analysis-report">
        <div class="professional-analysis-heading">
          <span class="eyebrow">${escapeHTML(uiPhrase("AI Analysis"))}</span>
          <h2>${escapeHTML(report?.title || uiPhrase("Professional Analysis"))}</h2>
          ${options.sourceLabel ? `<p><strong>${escapeHTML(uiPhrase("Source"))}:</strong> ${escapeHTML(options.sourceLabel)}</p>` : ""}
          <p>${escapeHTML(report?.summary || "")}</p>
        </div>
        ${tables.map(table => renderProfessionalAnalysisTable(table)).join("")}
        <section class="analysis-assessment">
          <h3>${escapeHTML(uiPhrase("Overall Assessment"))}</h3>
          <p>${escapeHTML(report?.overall_assessment || "")}</p>
        </section>
        ${options.extractedText ? `
          <details class="analysis-extracted-text">
            <summary>${escapeHTML(uiPhrase("View Extracted Text"))}</summary>
            <p>${escapeHTML(options.extractedText)}</p>
          </details>` : ""}
      </article>`;
}

function renderProfessionalAnalysisTable(table) {
    const columns = Array.isArray(table?.columns) ? table.columns : [];
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    return `
      <section class="professional-analysis-section">
        <h3>${escapeHTML(table?.title || uiPhrase("Analysis Details"))}</h3>
        <div class="analysis-table-wrap">
          <table class="analysis-table">
            <thead>
              <tr>${columns.map(column => `<th>${escapeHTML(uiPhrase(column))}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${rows.map(row => `
                <tr>${columns.map(column => `<td>${escapeHTML(row?.[column] ?? "")}</td>`).join("")}</tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>`;
}

function buildUMLDescriptionRows(result, fileName = "") {
    if (Array.isArray(result?.table_rows) && result.table_rows.length) {
        return [
            { label: uiPhrase("Source"), value: fileName || uiPhrase("Uploaded UML diagram") },
            ...result.table_rows.map(row => ({
                label: uiPhrase(String(row.label || "")) || String(row.label || ""),
                value: String(row.value || "")
            }))
        ];
    }

    const extractedText = String(result?.extracted_text || "");
    const description = Array.isArray(result?.description) ? result.description : [];
    const joined = `${extractedText}\n${description.join("\n")}`;
    const visibleItems = extractReadableUMLTerms(joined);
    const diagramType = inferUMLDescriptionType(joined);
    const actorItems = visibleItems.filter(item => /^(user|admin|customer|student|actor|client|manager|librarian)$/i.test(item));
    const processItems = visibleItems.filter(item => /(login|log in|sign|upload|download|generate|validate|enter|save|update|add|delete|search|view|analy|describe|export|report|product|file|srs|uml)/i.test(item));
    const decisionItems = visibleItems.filter(item => /(valid|same|decision|yes|no|if|whether|check)/i.test(item));

    return [
        { label: uiPhrase("Source"), value: fileName || uiPhrase("Uploaded UML diagram") },
        { label: uiPhrase("Diagram Type"), value: diagramType },
        { label: uiPhrase("Actors / Participants"), value: actorItems.length ? formatHumanList(actorItems) : uiPhrase("No clear actor label was detected.") },
        { label: uiPhrase("Main Processes"), value: processItems.length ? formatHumanList(processItems.slice(0, 12)) : uiPhrase("No clear process label was detected.") },
        { label: uiPhrase("Decisions / Conditions"), value: decisionItems.length ? formatHumanList(decisionItems.slice(0, 8)) : uiPhrase("No visible decision or condition was detected.") },
        { label: uiPhrase("Diagram Purpose"), value: result?.summary || description[0] || uiPhrase("The diagram was processed, but only limited readable UML text was detected.") },
        { label: uiPhrase("Real Description"), value: description.join(" ") || uiPhrase("Upload a clearer exported UML image for a more detailed description.") }
    ];
}

function extractReadableUMLTerms(text) {
    const candidates = String(text || "")
        .split(/[\n;|,]+/)
        .map(item => item.replace(/\s+/g, " ").trim())
        .map(item => item.replace(/^(visible uml text|terms|summary|description)\s*:\s*/i, "").trim())
        .filter(item => item.length >= 3 && /[A-Za-z]/.test(item))
        .filter(item => !/^(this appears|the uploaded|the diagram|it is intended|a clearer|no readable)/i.test(item));

    const result = [];
    const seen = new Set();
    candidates.forEach(item => {
        const clean = item.replace(/[^\w\s()+#/-]/g, "").trim();
        const key = clean.toLowerCase();
        if (!clean || seen.has(key)) return;
        seen.add(key);
        result.push(clean);
    });
    return result.slice(0, 18);
}

function inferUMLDescriptionType(text) {
    const value = String(text || "").toLowerCase();
    if (/(activity|workflow|decision|validate|save in database|update quantity|start|end)/.test(value)) return uiPhrase("Activity Diagram");
    if (/(class|interface|attribute|method|\+\s*\w+\(|-\s*\w+)/.test(value)) return uiPhrase("Class Diagram");
    if (/(actor|use case|include|extend|login|sign up)/.test(value)) return uiPhrase("Use Case Diagram");
    if (/(sequence|lifeline|message)/.test(value)) return uiPhrase("Sequence Diagram");
    return uiPhrase("UML Diagram");
}

function formatHumanList(items) {
    const clean = Array.from(new Set((items || []).map(item => String(item || "").trim()).filter(Boolean)));
    if (!clean.length) return "";
    if (clean.length === 1) return clean[0];
    if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
    return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

/* ================= HISTORY PAGE ================= */
document.addEventListener("DOMContentLoaded", () => {
    applySavedPreferences();
    renderSidebarAuthState();
    initializeAuthForms();
    applyReusePayload();
    loadHistoryPage();
    loadSettingsPage();
    initializeSrsRibbonDocking();
    refreshAccessSummary();
    showCheckoutReturnStatus();
});

function reusePrompt(text) {
    reuseHistoryItem({
        activity_type: "uml_generation",
        reusable_text: text,
        project_title: text
    });
}

/* ================= GENERIC PREVIEW (ALL FILES) ================= */
const filePreviewRegistry = {};
const fileSelectionRegistry = {};

function attachPreview({ fileInputId, previewId, textareaSelector }) {
    const fi = document.getElementById(fileInputId);
    const pv = document.getElementById(previewId);
    if (!fi || !pv) return;

    fi.addEventListener("change", () => {
        if (fi.dataset.skipFileAccumulation === "true") {
            delete fi.dataset.skipFileAccumulation;
        } else {
            accumulateSelectedFiles(fi, fileInputId);
        }
        renderSelectedFilePreview(fi, pv, fileInputId);
        if (fileInputId === "srsFile") resetSrsAnalysisResult();
    });
}

function resetSrsAnalysisResult() {
    const box = document.getElementById("resultBox");
    const content = document.getElementById("ambiguityOutputContent");
    const title = document.getElementById("analysisResultTitle");
    if (box) box.style.display = "none";
    if (content) {
        content.contentEditable = "false";
        content.innerHTML = `<ul id="ambiguityList"></ul>`;
    }
    if (title) title.textContent = uiPhrase("Ambiguity Analysis Preview");
}

function openSrsAnalysisFilePicker() {
    const input = document.getElementById("srsFile");
    if (!input) return;
    input.value = "";
    input.click();
}

function accumulateSelectedFiles(fileInput, fileInputId) {
    const incomingFiles = Array.from(fileInput.files || []);
    if (fileInputId === "generateSrsFiles" && incomingFiles.length) {
        const titleInput = document.getElementById("srsProjectTitle");
        const promptInput = document.getElementById("srsPromptInput");
        if (titleInput) titleInput.value = "";
        if (promptInput) promptInput.value = "";
        if (typeof lastAutoSrsTitle !== "undefined") lastAutoSrsTitle = "";
    }
    if (
        fileInputId === "generateSrsFiles" ||
        fileInputId === "umlImageUpload" ||
        fileInputId === "srsFile" ||
        fileInputId === "fileUpload"
    ) {
        const selectedFile = incomingFiles.slice(-1);
        setInputFiles(fileInput, selectedFile);
        fileSelectionRegistry[fileInputId] = selectedFile;
        return;
    }

    const existingFiles = fileSelectionRegistry[fileInputId] || [];
    const mergedFiles = [...existingFiles];

    incomingFiles.forEach(file => {
        const alreadySelected = mergedFiles.some(selected =>
            selected.name === file.name &&
            selected.size === file.size &&
            selected.lastModified === file.lastModified
        );
        if (!alreadySelected) mergedFiles.push(file);
    });

    setInputFiles(fileInput, mergedFiles);
    fileSelectionRegistry[fileInputId] = mergedFiles;
}

function setInputFiles(fileInput, files) {
    const transfer = new DataTransfer();
    files.forEach(file => transfer.items.add(file));
    fileInput.files = transfer.files;
}

function renderSelectedFilePreview(fileInput, previewBox, fileInputId) {
    const files = Array.from(fileInput.files || []);
    fileSelectionRegistry[fileInputId] = files;
    previewBox.innerHTML = "";
    previewBox.classList.toggle("multi-file-preview", files.length > 1);

    if (!files.length) {
        previewBox.style.display = "none";
        return;
    }

    previewBox.style.display = "block";
    files.forEach((file, index) => {
        const previewKey = `${fileInputId}-${Date.now()}-${index}`;
        filePreviewRegistry[previewKey] = file;
        const objectUrl = URL.createObjectURL(file);
        previewBox.dataset.previewKey = previewKey;

        if (file.type.startsWith("image/")) {
            previewBox.insertAdjacentHTML("beforeend", `
              <div class="file-preview-card image-preview-card">
                <button type="button" class="file-remove-btn" title="Remove file" onclick="removeSelectedFile('${fileInputId}', ${index})">&times;</button>
                <img src="${objectUrl}" alt="${escapeHTML(file.name)}">
                <div class="file-preview-info">
                  <strong>${escapeHTML(file.name)}</strong>
                  <span>${formatFileSize(file.size)}</span>
                  <button type="button" class="mini-action-btn" onclick="openFilePreview('${previewKey}')">Preview</button>
                </div>
              </div>`);
            return;
        }

        const icon = file.type === "application/pdf" ? "PDF" : getFileExtension(file.name).toUpperCase();
        previewBox.insertAdjacentHTML("beforeend", `
          <div class="file-preview-card">
            <button type="button" class="file-remove-btn" title="Remove file" onclick="removeSelectedFile('${fileInputId}', ${index})">&times;</button>
            <div class="file-preview-icon">${escapeHTML(icon || "DOC")}</div>
            <div class="file-preview-info">
              <strong>${escapeHTML(file.name)}</strong>
              <span>${formatFileSize(file.size)}</span>
              <button type="button" class="mini-action-btn" onclick="openFilePreview('${previewKey}')">Preview</button>
            </div>
          </div>`);

        attachTextSnippetToPreview(file, previewBox.lastElementChild);
    });
}

function removeSelectedFile(fileInputId, fileIndex) {
    const input = document.getElementById(fileInputId);
    if (!input) return;

    const files = Array.from(input.files || []).filter((_, index) => index !== fileIndex);
    fileSelectionRegistry[fileInputId] = files;
    setInputFiles(input, files);
    input.dataset.skipFileAccumulation = "true";
    input.dispatchEvent(new Event("change"));
}

function attachTextSnippetToPreview(file, card) {
    if (!card) return;
    const extension = getFileExtension(file.name);
    if (file.type === "text/plain" || extension === "txt") {
        const reader = new FileReader();
        reader.onload = () => {
            const preview = String(reader.result || "").slice(0, 260).trim();
            if (preview) {
                card.querySelector(".file-preview-info")?.insertAdjacentHTML(
                    "beforeend",
                    `<p class="file-preview-snippet">${escapeHTML(preview)}${preview.length >= 260 ? "..." : ""}</p>`
                );
            }
        };
        reader.readAsText(file);
        return;
    }

    if (["docx", "pdf"].includes(extension)) {
        extractFileContent(file).then(result => {
            const preview = String(result?.text || "").slice(0, 260).trim();
            if (preview) {
                card.querySelector(".file-preview-info")?.insertAdjacentHTML(
                    "beforeend",
                    `<p class="file-preview-snippet">${escapeHTML(preview)}${preview.length >= 260 ? "..." : ""}</p>`
                );
            }
        }).catch(() => {});
    }
}

function openFilePreview(previewKey) {
    const file = filePreviewRegistry[previewKey];
    if (!file) return;

    let modal = document.getElementById("filePreviewModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "filePreviewModal";
        modal.className = "file-preview-modal";
        modal.innerHTML = `
          <div class="file-preview-dialog">
            <div class="file-preview-header">
              <strong id="filePreviewTitle"></strong>
              <button type="button" onclick="closeFilePreview()">Close</button>
            </div>
            <div id="filePreviewBody" class="file-preview-body"></div>
          </div>`;
        document.body.appendChild(modal);
    }

    const title = document.getElementById("filePreviewTitle");
    const body = document.getElementById("filePreviewBody");
    if (!title || !body) return;

    title.textContent = file.name;
    modal.classList.add("show");
    body.innerHTML = "";

    const objectUrl = URL.createObjectURL(file);
    if (file.type.startsWith("image/")) {
        body.innerHTML = `<img src="${objectUrl}" alt="${escapeHTML(file.name)}">`;
        return;
    }

    if (file.type === "application/pdf") {
        body.innerHTML = `<iframe src="${objectUrl}" title="${escapeHTML(file.name)}"></iframe>`;
        return;
    }

    if (file.type === "text/plain" || getFileExtension(file.name) === "txt") {
        const reader = new FileReader();
        reader.onload = () => {
            body.innerHTML = `<pre>${escapeHTML(String(reader.result || ""))}</pre>`;
        };
        reader.readAsText(file);
        return;
    }

    if (["docx", "pdf"].includes(getFileExtension(file.name))) {
        body.innerHTML = `<div class="generation-status">Extracting document preview...</div>`;
        extractFileContent(file).then(result => {
            const text = String(result?.text || "").trim();
            body.innerHTML = text
                ? `<pre>${escapeHTML(text)}</pre>`
                : `<div class="document-preview-placeholder"><strong>No readable text was detected.</strong></div>`;
        }).catch(() => {
            body.innerHTML = `<div class="document-preview-placeholder"><strong>Preview is not available for this file.</strong></div>`;
        });
        return;
    }

    body.innerHTML = `
      <div class="document-preview-placeholder">
        <div class="file-preview-icon">${escapeHTML(getFileExtension(file.name).toUpperCase() || "DOC")}</div>
        <strong>${escapeHTML(file.name)}</strong>
        <span>${formatFileSize(file.size)}</span>
      </div>`;
}

function closeFilePreview() {
    document.getElementById("filePreviewModal")?.classList.remove("show");
}

function formatFileSize(size) {
    const kb = Number(size || 0) / 1024;
    return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
}

function getFileExtension(fileName) {
    return String(fileName || "").split(".").pop()?.toLowerCase() || "";
}

function extractFileContent(file) {
    return fileToDataUrl(file).then(fileData => fetch(`${AIRA_API_BASE}/api/extract-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            fileData,
            fileName: file.name,
            mimeType: file.type
        })
    })).then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Unable to read the attached document.");
        return result;
    });
}

/* ================= PAGE WIRING ================= */
const AIRA_API_BASE = "http://localhost:3000";
const AIRA_PROJECT_MEMBERS = ["Laiba Arshad", "Alishba Rustam", "Nayab Nazir"];
let lastAutoSrsTitle = "";
let currentAccessSummary = null;

function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem("aira_user") || "null");
    } catch {
        return null;
    }
}

function getCurrentUserId() {
    const user = getCurrentUser();
    return Number(user?.user_id || user?.id || 0) || null;
}

function hasUnlimitedAccess() {
    const user = getCurrentUser();
    return Boolean(
        user?.is_admin
        || String(user?.role || "").toLowerCase() === "admin"
        || String(user?.plan || "").toLowerCase() === "premium"
    );
}

function requirePremiumAccess(featureName) {
    if (hasUnlimitedAccess()) return true;
    showAccessMessage(
        getPageAccessFeature(),
        `${featureName} is available on Premium. Upgrade for unlimited access, or use an admin account.`,
        "premium"
    );
    return false;
}

function setCurrentUser(user) {
    localStorage.setItem("aira_user", JSON.stringify(user || {}));
    renderSidebarAuthState();
    refreshAccessSummary();
}

function getPageAccessFeature() {
    const path = window.location.pathname.toLowerCase();
    if (path.endsWith("generate-srs.html")) return "srs_generation";
    if (path.endsWith("generate-uml.html")) return "uml_generation";
    if (path.endsWith("upload-uml.html")) return "uml_analysis";
    if (path.endsWith("check-srs.html")) return "ai_analysis";
    return "";
}

function getFeatureLabel(feature) {
    return {
        srs_generation: "SRS generations",
        uml_generation: "UML generations",
        uml_analysis: "UML descriptions",
        ai_analysis: "AI analyses"
    }[feature] || String(feature || "").replace(/_/g, " ");
}

function showAccessMessage(feature, message, kind = "info") {
    const selector = feature
        ? `[data-access-message="${feature}"]`
        : ".access-inline-message";
    const node = document.querySelector(selector);
    if (!node) return false;
    node.hidden = false;
    node.dataset.kind = kind;
    node.innerHTML = `
        <span>${escapeHTML(message)}</span>
        <a href="settings.html#premium">View Premium</a>`;
    return true;
}

function clearAccessMessage(feature) {
    const node = document.querySelector(`[data-access-message="${feature}"]`);
    if (!node) return;
    node.hidden = true;
    node.textContent = "";
    delete node.dataset.kind;
}

function handleAccessApiError(result, feature) {
    const code = String(result?.code || "");
    if (!["DAILY_LIMIT_REACHED", "PREMIUM_REQUIRED"].includes(code)) return false;
    showAccessMessage(
        result?.feature || feature,
        result?.error || "This feature requires Premium access.",
        code === "DAILY_LIMIT_REACHED" ? "limit" : "premium"
    );
    return true;
}

async function refreshAccessSummary() {
    const userId = getCurrentUserId();
    if (!userId) {
        currentAccessSummary = null;
        renderPremiumSettings();
        return;
    }
    try {
        const response = await fetch(`${AIRA_API_BASE}/api/access/${userId}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load access details.");
        currentAccessSummary = result;

        const user = getCurrentUser() || {};
        localStorage.setItem("aira_user", JSON.stringify({
            ...user,
            role: result.role,
            plan: result.plan,
            is_admin: result.is_admin,
            limits: result.limits
        }));
        renderPremiumSettings();
        renderInlineAccessMessages();
    } catch {
        renderPremiumSettings();
    }
}

function renderInlineAccessMessages() {
    const usage = currentAccessSummary?.usage || {};
    document.querySelectorAll(".access-inline-message[data-access-message]").forEach(node => {
        const feature = node.dataset.accessMessage;
        const item = usage[feature];
        if (!item) return;
        if (currentAccessSummary?.plan !== "free") {
            node.hidden = true;
            return;
        }
        const label = getFeatureLabel(feature);
        const remaining = Number(item.remaining || 0);
        if (remaining <= 0) {
            showAccessMessage(feature, `You have reached today's free limit for ${label}.`, "limit");
        } else {
            showAccessMessage(feature, `${remaining} of ${item.limit} free ${label.toLowerCase()} remaining today.`, "info");
        }
    });
}

function renderPremiumSettings() {
    const badge = document.getElementById("currentPlanBadge");
    const summary = document.getElementById("premiumUsageSummary");
    const accessManager = document.getElementById("adminAccessManager");
    const manageBillingButton = document.getElementById("manageBillingButton");
    if (!badge && !summary) return;

    const plan = currentAccessSummary?.plan || (hasUnlimitedAccess() ? "premium" : "free");
    if (accessManager) accessManager.hidden = plan !== "admin";
    if (manageBillingButton) manageBillingButton.hidden = plan !== "premium";
    if (badge) badge.textContent = plan === "admin" ? "Admin access" : plan === "premium" ? "Premium plan" : "Free plan";
    if (!summary) return;

    if (!getCurrentUserId()) {
        summary.innerHTML = `<p>Log in to view your daily usage and current plan.</p>`;
        return;
    }
    if (plan !== "free") {
        summary.innerHTML = `<div class="usage-item"><strong>Unlimited access</strong><span>No daily generation limits apply to this account.</span></div>`;
        return;
    }
    summary.innerHTML = Object.entries(currentAccessSummary?.usage || {}).map(([feature, item]) => `
        <div class="usage-item">
            <strong>${escapeHTML(getFeatureLabel(feature))}</strong>
            <span>${Number(item.used || 0)} of ${Number(item.limit || 3)} used today</span>
        </div>`).join("");
}

async function startPremiumCheckout(plan, button) {
    const status = document.getElementById("checkoutStatus");
    const userId = getCurrentUserId();
    if (status) {
        status.dataset.kind = "info";
        status.textContent = "";
    }
    if (!userId) {
        if (status) {
            status.dataset.kind = "error";
            status.textContent = "Log in before upgrading your account.";
        }
        return;
    }

    const originalText = button?.textContent || "";
    if (button) {
        button.disabled = true;
        button.textContent = "Opening secure checkout...";
    }
    try {
        const response = await fetch(`${AIRA_API_BASE}/api/billing/create-checkout-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, plan })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to start secure checkout.");
        window.location.href = result.checkoutUrl;
    } catch (error) {
        if (status) {
            status.dataset.kind = "error";
            status.textContent = error.message || "Unable to start secure checkout.";
        }
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

async function openBillingPortal(button) {
    const status = document.getElementById("checkoutStatus");
    const userId = getCurrentUserId();
    const originalText = button?.textContent || "";
    if (!userId) return;
    if (button) {
        button.disabled = true;
        button.textContent = "Opening billing...";
    }
    try {
        const response = await fetch(`${AIRA_API_BASE}/api/billing/create-portal-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to open billing management.");
        window.location.href = result.portalUrl;
    } catch (error) {
        if (status) {
            status.dataset.kind = "error";
            status.textContent = error.message || "Unable to open billing management.";
        }
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

function showCheckoutReturnStatus() {
    const status = document.getElementById("checkoutStatus");
    if (!status) return;
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    if (checkout === "success") {
        status.dataset.kind = "success";
        status.textContent = "Payment completed. Premium access is being activated automatically.";
        setTimeout(loadAccessSummary, 1200);
    } else if (checkout === "cancelled") {
        status.dataset.kind = "info";
        status.textContent = "Checkout was cancelled. Your current plan has not changed.";
    }
}

async function updateAccountAccess() {
    const emailInput = document.getElementById("accessTargetEmail");
    const accessInput = document.getElementById("accessTargetPlan");
    const status = document.getElementById("accessManagementStatus");
    const email = String(emailInput?.value || "").trim().toLowerCase();
    const access = String(accessInput?.value || "free");

    if (!status) return;
    status.dataset.kind = "info";
    status.textContent = "";
    if (!email) {
        status.dataset.kind = "error";
        status.textContent = "Enter the email of an existing registered account.";
        return;
    }

    try {
        const response = await fetch(`${AIRA_API_BASE}/api/admin/account-access`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requesterUserId: getCurrentUserId(),
                email,
                access
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to update account access.");
        status.dataset.kind = "success";
        status.textContent = result.message;
        emailInput.value = "";
    } catch (error) {
        status.dataset.kind = "error";
        status.textContent = error.message || "Unable to update account access.";
    }
}

function logoutUser() {
    localStorage.removeItem("aira_user");
    localStorage.removeItem("aira_reuse_payload");
    window.location.href = "login.html";
}

function renderSidebarAuthState() {
    const sidebar = document.getElementById("sidebar");
    const list = sidebar?.querySelector("ul");
    if (!list) return;

    const user = getCurrentUser();
    const path = window.location.pathname.toLowerCase();
    list.querySelectorAll(".sidebar-generated-link, .sidebar-user-account, .sidebar-logout").forEach(item => item.remove());

    const language = getSavedSettings().language || "en";
    localizeSidebarLinks(list, language);

    const items = Array.from(list.querySelectorAll("li"));
    const loginItem = items.find(item => String(item.getAttribute("onclick") || "").includes("login.html"));
    const signupItem = items.find(item => String(item.getAttribute("onclick") || "").includes("signup.html"));
    const staticHistoryItem = items.find(item => String(item.getAttribute("onclick") || "").includes("history.html"));
    if (staticHistoryItem) staticHistoryItem.remove();

    const historyItem = createSidebarLink(translate("nav.history", language), "history.html", path.endsWith("history.html"));
    list.appendChild(historyItem);

    if (!user?.user_id && !user?.id) {
        if (loginItem) loginItem.style.display = "";
        if (signupItem) signupItem.style.display = "";
        if (loginItem) list.appendChild(loginItem);
        if (signupItem) list.appendChild(signupItem);
        return;
    }

    const displayName = String(user.full_name || user.name || user.email || "My Account").trim();
    const email = String(user.email || "").trim();
    const initials = displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase() || "")
        .join("") || "A";

    if (loginItem) loginItem.style.display = "none";
    if (signupItem) signupItem.style.display = "none";

    const accountItem = document.createElement("li");
    accountItem.className = "sidebar-user-account";
    accountItem.onclick = event => {
        event.stopPropagation();
        accountItem.classList.toggle("open");
    };

    accountItem.innerHTML = `
        <span class="sidebar-user-avatar">${escapeHTML(initials)}</span>
        <span class="sidebar-user-text">
            <strong>${escapeHTML(displayName)}</strong>
            ${email ? `<small>${escapeHTML(email)}</small>` : ""}
        </span>
        <span class="sidebar-account-arrow">&rsaquo;</span>
        <div class="account-menu">
            <button type="button" onclick="event.stopPropagation(); location.href='settings.html'">
                <span class="sidebar-user-avatar mini">${escapeHTML(initials)}</span>
                <span>
                    <strong>${escapeHTML(displayName)}</strong>
                    <small>${escapeHTML(translate("settings.myAccount", language))}</small>
                </span>
            </button>
            <hr>
            <button type="button" onclick="event.stopPropagation(); location.href='settings.html#profile'">${escapeHTML(translate("settings.profile", language))}</button>
            <button type="button" onclick="event.stopPropagation(); location.href='settings.html'">${escapeHTML(translate("settings.title", language))}</button>
            <button type="button" onclick="event.stopPropagation(); location.href='help.html'">${escapeHTML(translate("settings.help", language))}</button>
            <hr>
            <button type="button" class="danger-menu-action" onclick="event.stopPropagation(); logoutUser()">${escapeHTML(translate("settings.logoutAction", language))}</button>
        </div>`;

    list.appendChild(accountItem);
}

function createSidebarLink(label, href, isActive) {
    const item = document.createElement("li");
    item.className = `sidebar-generated-link${isActive ? " active" : ""}`;
    item.textContent = label;
    item.onclick = () => { window.location.href = href; };
    return item;
}

function localizeSidebarLinks(list, language) {
    Array.from(list.querySelectorAll("li")).forEach(item => {
        const action = String(item.getAttribute("onclick") || "");
        const map = [
            ["index.html", "nav.home"],
            ["generate-srs.html", "nav.generateSrs"],
            ["generate-uml.html", "nav.generateUml"],
            ["check-srs.html", "nav.aiAnalysis"],
            ["upload-uml.html", "nav.umlImage"],
            ["history.html", "nav.history"],
            ["login.html", "nav.login"],
            ["signup.html", "nav.signup"]
        ];
        const match = map.find(([href]) => action.includes(href));
        if (match) item.textContent = translate(match[1], language);
    });
}

function initializeAuthForms() {
    const loginPassword = document.getElementById("loginPassword");
    if (loginPassword) {
        loginPassword.addEventListener("keydown", event => {
            if (event.key === "Enter") loginUser();
        });
    }

    const confirmPassword = document.getElementById("confirmPassword");
    if (confirmPassword) {
        confirmPassword.addEventListener("keydown", event => {
            if (event.key === "Enter") signupUser();
        });
    }
}

function applyReusePayload() {
    let payload = null;
    try {
        payload = JSON.parse(localStorage.getItem("aira_reuse_payload") || "null");
    } catch {
        payload = null;
    }
    if (!payload) return;

    const path = window.location.pathname.toLowerCase();
    const text = String(payload.reusable_text || payload.description || payload.title || "").trim();
    const title = String(payload.project_title || payload.title || "").trim();

    if (path.endsWith("generate-uml.html")) {
        const prompt = document.getElementById("promptInput");
        if (prompt && text) prompt.value = text;
    } else if (path.endsWith("generate-srs.html")) {
        const titleInput = document.getElementById("srsProjectTitle");
        const prompt = document.getElementById("srsPromptInput");
        if (titleInput && title) titleInput.value = title;
        if (prompt && text) prompt.value = text;
    } else if (path.endsWith("check-srs.html")) {
        const textarea = document.querySelector("textarea");
        if (textarea && text) textarea.value = text;
    } else if (path.endsWith("upload-uml.html")) {
        const out = document.getElementById("umlImageDescriptionBox");
        const content = document.getElementById("umlImageDescriptionContent");
        if (out && content) {
            out.style.display = "block";
            const savedOutput = String(payload.saved_output || "").trim();
            const reusableText = String(payload.reusable_text || "").trim();
            content.innerHTML = `
              <p><strong>Saved UML Image Description</strong></p>
              ${savedOutput ? `<p>${escapeHTML(savedOutput).replace(/\n/g, "<br>")}</p>` : ""}
              ${reusableText ? `<details><summary>View Extracted Text</summary><p>${escapeHTML(reusableText).replace(/\n/g, "<br>")}</p></details>` : ""}`;
        }
    } else {
        return;
    }

    localStorage.removeItem("aira_reuse_payload");
}

async function loginUser() {
    const email = document.getElementById("loginEmail")?.value?.trim();
    const password = document.getElementById("loginPassword")?.value || "";
    const status = document.getElementById("loginStatus");
    setFormMessage(status, "Checking login...", false);

    try {
        const response = await fetch(`${AIRA_API_BASE}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.msg || "Login failed.");
        setCurrentUser(result.user);
        setFormMessage(status, "Login successful. Opening your history...", false);
        setTimeout(() => { window.location.href = "history.html"; }, 500);
    } catch (error) {
        setFormMessage(status, error.message || "Login failed.", true);
    }
}

async function signupUser() {
    const full_name = document.getElementById("signupName")?.value?.trim();
    const email = document.getElementById("signupEmail")?.value?.trim();
    const password = document.getElementById("password")?.value || "";
    const confirmPassword = document.getElementById("confirmPassword")?.value || "";
    const status = document.getElementById("signupStatus");

    if (password !== confirmPassword) {
        setFormMessage(status, "Password and confirm password do not match.", true);
        return;
    }

    setFormMessage(status, "Creating account...", false);
    try {
        const response = await fetch(`${AIRA_API_BASE}/api/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full_name, email, password })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.msg || "Signup failed.");
        setCurrentUser(result.user);
        setFormMessage(status, "Account created. Opening your history...", false);
        setTimeout(() => { window.location.href = "history.html"; }, 600);
    } catch (error) {
        setFormMessage(status, error.message || "Signup failed.", true);
    }
}

function setFormMessage(node, message, isError) {
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("error", Boolean(isError));
    node.classList.toggle("success", !isError);
}

async function loadHistoryPage() {
    const historyList = document.getElementById("historyList");
    if (!historyList) return;

    const userId = getCurrentUserId();
    if (!userId) {
        historyList.innerHTML = `
          <div class="history-empty">
            <p>Please login first to view your saved AIRA activity.</p>
            <button type="button" onclick="location.href='login.html'">Login</button>
          </div>`;
        return;
    }

    historyList.innerHTML = `<div class="history-empty">Loading your saved activity...</div>`;
    try {
        const response = await fetch(`${AIRA_API_BASE}/api/history/${userId}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load history.");
        renderHistoryItems(result.history || []);
    } catch (error) {
        historyList.innerHTML = `<div class="history-empty">${escapeHTML(error.message || "Unable to load history.")}</div>`;
    }
}

function loadSettingsPage() {
    const accountName = document.getElementById("settingsAccountName");
    const accountEmail = document.getElementById("settingsAccountEmail");
    const accountInitials = document.getElementById("settingsAccountInitials");
    const settingsShell = document.querySelector(".settings-shell");
    if (!accountName && !accountEmail && !accountInitials && !settingsShell) return;

    const user = getCurrentUser();
    if (!user?.user_id && !user?.id) {
        if (accountName) accountName.textContent = "Not logged in";
        if (accountEmail) accountEmail.textContent = "Login to view your account details.";
        if (accountInitials) accountInitials.textContent = "A";
        initializeSettingsTabs();
        initializeSettingsControls();
        return;
    }

    const displayName = user.full_name || "AIRA User";
    const initials = displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase() || "")
        .join("") || "A";

    if (accountName) accountName.textContent = displayName;
    if (accountEmail) accountEmail.textContent = user.email || "-";
    if (accountInitials) accountInitials.textContent = initials;
    initializeSettingsTabs();
    initializeSettingsControls();
}

function initializeSettingsTabs() {
    const tabs = Array.from(document.querySelectorAll("[data-settings-tab]"));
    const panels = Array.from(document.querySelectorAll("[data-settings-panel]"));
    if (!tabs.length || !panels.length) return;

    const showPanel = tabName => {
        tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.settingsTab === tabName));
        panels.forEach(panel => panel.classList.toggle("active", panel.dataset.settingsPanel === tabName));
        localStorage.setItem("aira_settings_tab", tabName);
    };

    tabs.forEach(tab => {
        tab.addEventListener("click", () => showPanel(tab.dataset.settingsTab));
    });

    const hashTab = window.location.hash.replace("#", "");
    const savedTab = localStorage.getItem("aira_settings_tab");
    const defaultTab = tabs.some(tab => tab.dataset.settingsTab === hashTab)
        ? hashTab
        : tabs.some(tab => tab.dataset.settingsTab === savedTab)
            ? savedTab
            : "profile";
    showPanel(defaultTab);
}

function initializeSettingsControls() {
    const controls = Array.from(document.querySelectorAll("[data-setting-key]"));
    if (!controls.length) return;

    const saved = getSavedSettings();

    controls.forEach(control => {
        const key = control.dataset.settingKey;
        if (Object.prototype.hasOwnProperty.call(saved, key)) {
            if (control.type === "checkbox") control.checked = Boolean(saved[key]);
            else {
                control.value = saved[key];
                if (!control.value && control.options.length) control.selectedIndex = 0;
            }
        }

        control.addEventListener("change", () => {
            const panel = control.closest("[data-settings-panel]");
            const status = panel?.querySelector("[data-settings-status]");
            if (status) status.textContent = translate("settings.unsaved");
        });
    });

    document.querySelectorAll("[data-save-settings]").forEach(button => {
        button.addEventListener("click", () => saveSettingsSection(button.closest("[data-settings-panel]")));
    });
    applyTranslations(saved.language || "en");
}

function getSavedSettings() {
    try {
        const settings = JSON.parse(localStorage.getItem("aira_settings") || "{}");
        if (!hasUnlimitedAccess() && settings.language && settings.language !== "en") {
            settings.language = "en";
        }
        return settings;
    } catch {
        return {};
    }
}

function saveSettingsSection(panel) {
    if (!panel) return;
    const saved = getSavedSettings();
    panel.querySelectorAll("[data-setting-key]").forEach(control => {
        const key = control.dataset.settingKey;
        if (key === "language" && control.value !== "en" && !hasUnlimitedAccess()) {
            control.value = "en";
            saved.language = "en";
            requirePremiumAccess("Multi-language support");
            return;
        }
        if ((key === "srsExport" || key === "umlExport") && control.value !== "pdf" && !hasUnlimitedAccess()) {
            control.value = "pdf";
            saved[key] = "pdf";
            requirePremiumAccess("Multiple export formats");
            return;
        }
        saved[key] = control.type === "checkbox" ? control.checked : control.value;
    });
    localStorage.setItem("aira_settings", JSON.stringify(saved));
    applySavedPreferences();
    applyTranslations(saved.language || "en");
    renderSidebarAuthState();

    const status = panel.querySelector("[data-settings-status]");
    if (status) {
        status.textContent = translate("settings.saved", saved.language || "en");
        setTimeout(() => {
            if (status.textContent === translate("settings.saved", saved.language || "en")) status.textContent = "";
        }, 1800);
    }
}

function applySavedPreferences() {
    const settings = getSavedSettings();
    applyAppearance(settings.appearance || "system");
    applyTextSize(settings.textSize || "default");
    applyTranslations(settings.language || "en");
}

function applyAppearance(appearance) {
    document.body.classList.remove("theme-light", "theme-soft", "theme-dark");
    if (appearance === "light") document.body.classList.add("theme-light");
    if (appearance === "soft") document.body.classList.add("theme-soft");
    if (appearance === "dark") document.body.classList.add("theme-dark");
}

function applyTextSize(size) {
    document.body.classList.remove("text-large", "text-compact");
    if (size === "large") document.body.classList.add("text-large");
    if (size === "compact") document.body.classList.add("text-compact");
}

const AIRA_TRANSLATIONS = {
    en: {
        "app.title": "AIRA - Artificial Intelligence Requirement Analyzer",
        "app.footer": "Final Year Project - AIRA",
        "nav.home": "Home",
        "nav.generateSrs": "Generate SRS",
        "nav.generateUml": "Generate UML",
        "nav.aiAnalysis": "AI Analysis",
        "nav.umlImage": "UML Image Description",
        "nav.login": "Login",
        "nav.signup": "Sign Up",
        "home.eyebrow": "AI Requirements Workspace",
        "home.title": "Turn raw project ideas into polished SRS documents and UML assets.",
        "home.subtitle": "AIRA helps students, analysts, and developers structure requirements, review ambiguity, and generate diagram-ready outputs from one focused workspace.",
        "home.startSrs": "Start an SRS",
        "home.createUml": "Create UML",
        "home.workflowLabel": "Core Workflow",
        "home.workflowTitle": "Draft, validate, visualize",
        "home.workflowText": "Move from requirement notes to reviewable documentation with a cleaner, guided process.",
        "home.metricTools": "AI-assisted tools",
        "home.metricSrs": "Generation and analysis",
        "home.metricUml": "Creation and explanation",
        "home.capabilities": "Capabilities",
        "home.capabilitiesTitle": "Everything organized around documentation quality",
        "home.featureSpecTag": "Specification",
        "home.featureSrsTitle": "SRS Generation",
        "home.featureSrsText": "Generate structured software requirement specifications from project descriptions and supporting files.",
        "home.featureModelTag": "Modeling",
        "home.featureUmlTitle": "UML Diagrams",
        "home.featureUmlText": "Produce editable UML output for use case, class, sequence, and activity-style workflows.",
        "home.featureReviewTag": "Review",
        "home.featureAnalysisTitle": "AI Analysis",
        "home.featureAnalysisText": "Inspect requirement clarity, completeness, and ambiguity before documentation moves forward.",
        "home.featureInterpretTag": "Interpretation",
        "home.featureImageTitle": "UML Image Description",
        "home.featureImageText": "Upload UML images and receive a readable explanation that supports reports, reviews, and learning.",
        "settings.profile": "Profile",
        "settings.general": "General",
        "settings.workspace": "Workspace",
        "settings.exports": "Exports",
        "settings.help": "Help",
        "settings.logout": "Logout",
        "settings.account": "Account",
        "settings.title": "Settings",
        "settings.subtitle": "Manage your account, workspace preferences, and project workflow.",
        "settings.myAccount": "My Account",
        "settings.appearance": "Appearance",
        "settings.appearanceHelp": "Choose the visual style for the AIRA workspace.",
        "settings.language": "Language",
        "settings.languageHelp": "Interface language for labels and guidance.",
        "settings.textSize": "Text size",
        "settings.textSizeHelp": "Comfortable reading size for generated documents.",
        "settings.startPage": "Default start page",
        "settings.startPageHelp": "Page to open after login or signup.",
        "settings.saveActivity": "Save generated activity",
        "settings.saveActivityHelp": "Store generated SRS, UML, and analysis records in My History.",
        "settings.reuseHistory": "Reuse history items",
        "settings.reuseHistoryHelp": "Allow previous prompts and outputs to be reused in new tasks.",
        "settings.exportsTitle": "Files and Exports",
        "settings.srsFormat": "SRS document format",
        "settings.srsFormatHelp": "Preferred export format for generated specifications.",
        "settings.umlFormat": "UML diagram export",
        "settings.umlFormatHelp": "Preferred format for downloaded diagrams.",
        "settings.uploadPreview": "Upload preview",
        "settings.uploadPreviewHelp": "Show uploaded file previews before processing.",
        "settings.helpSupport": "Help and Support",
        "settings.openGuide": "Open user guide",
        "settings.openGuideHelp": "Learn how to generate SRS documents, UML diagrams, and analysis reports.",
        "settings.loggedIn": "Logged in on this browser",
        "settings.logoutHelp": "Use logout before leaving a shared computer.",
        "settings.logoutAction": "Log out",
        "settings.save": "Save changes",
        "settings.saved": "Saved",
        "settings.unsaved": "Unsaved changes",
        "nav.history": "My History",
        "option.system": "System",
        "option.light": "Light",
        "option.soft": "Soft Contrast",
        "option.dark": "Dark",
        "option.english": "English",
        "option.spanish": "Spanish",
        "option.french": "French",
        "option.german": "German",
        "option.urdu": "Urdu",
        "option.default": "Default",
        "option.large": "Large",
        "option.compact": "Compact",
        "srs.eyebrow": "Specification Builder",
        "srs.title": "Generate Software Requirement Specification",
        "srs.description": "Start with a short idea, a reference document, or a UML diagram image. Add extra details when they are available.",
        "srs.projectTitle": "Project Title",
        "srs.projectTitlePlaceholder": "e.g. Online Library Management System",
        "srs.projectIdea": "Project Idea",
        "srs.projectIdeaPlaceholder": "Write one or two lines, or leave this empty if you upload a document or UML diagram image.",
        "srs.uploadTitle": "Upload Source File",
        "srs.uploadText": "Upload one UML image, PDF, Word document, text file, or supporting project file for this SRS.",
        "srs.uploadButton": "Upload File",
        "srs.advanced": "Advanced details",
        "srs.domain": "Project Domain",
        "srs.selectDomain": "Select domain",
        "srs.detailLevel": "Output Detail Level",
        "srs.actors": "Main Users / Actors",
        "srs.actorsPlaceholder": "e.g. Student, Admin, Librarian",
        "srs.features": "Main Features",
        "srs.dataManaged": "Data Managed",
        "srs.dataManagedPlaceholder": "e.g. Users, books, borrowing records, reports",
        "srs.generate": "Generate SRS",
        "srs.outputTitle": "Generated SRS Preview",
        "srs.outputPlaceholder": "The generated SRS content will be displayed here.",
        "common.edit": "Edit",
        "common.download": "Download",
        "auth.access": "Access Your Workspace",
        "auth.welcome": "Welcome Back",
        "auth.loginHelp": "Login to continue working on your requirements and diagrams.",
        "auth.email": "Email Address",
        "auth.emailPlaceholder": "Enter your email",
        "auth.password": "Password",
        "auth.passwordPlaceholder": "Enter your password",
        "auth.login": "Login",
        "auth.noAccount": "Don't have an account?",
        "auth.signup": "Sign Up",
        "auth.createEyebrow": "Create Your Account",
        "auth.createTitle": "Create Account",
        "auth.createHelp": "Register to access AIRA features and keep your work organized.",
        "auth.fullName": "Full Name",
        "auth.fullNamePlaceholder": "Enter your full name",
        "auth.createPasswordPlaceholder": "Create a password",
        "auth.confirmPassword": "Confirm Password",
        "auth.confirmPasswordPlaceholder": "Confirm your password",
        "auth.hasAccount": "Already have an account?"
    },
    es: {
        "app.title": "AIRA - Analizador Inteligente de Requisitos",
        "app.footer": "Proyecto Final de Ano - AIRA",
        "nav.home": "Inicio",
        "nav.generateSrs": "Generar SRS",
        "nav.generateUml": "Generar UML",
        "nav.aiAnalysis": "Analisis IA",
        "nav.umlImage": "Descripcion de imagen UML",
        "nav.login": "Iniciar sesion",
        "nav.signup": "Registrarse",
        "home.eyebrow": "Espacio de requisitos IA",
        "home.title": "Convierte ideas de proyecto en documentos SRS y activos UML pulidos.",
        "home.subtitle": "AIRA ayuda a estudiantes, analistas y desarrolladores a estructurar requisitos, revisar ambiguedad y generar salidas listas para diagramas.",
        "home.startSrs": "Iniciar SRS",
        "home.createUml": "Crear UML",
        "home.workflowLabel": "Flujo principal",
        "home.workflowTitle": "Redactar, validar, visualizar",
        "home.workflowText": "Pasa de notas de requisitos a documentacion revisable con un proceso mas claro.",
        "home.metricTools": "Herramientas asistidas por IA",
        "home.metricSrs": "Generacion y analisis",
        "home.metricUml": "Creacion y explicacion",
        "home.capabilities": "Capacidades",
        "home.capabilitiesTitle": "Todo organizado alrededor de la calidad documental",
        "home.featureSpecTag": "Especificacion",
        "home.featureSrsTitle": "Generacion SRS",
        "home.featureSrsText": "Genera especificaciones de requisitos desde descripciones y archivos de apoyo.",
        "home.featureModelTag": "Modelado",
        "home.featureUmlTitle": "Diagramas UML",
        "home.featureUmlText": "Produce salidas UML editables para casos de uso, clases, secuencias y actividades.",
        "home.featureReviewTag": "Revision",
        "home.featureAnalysisTitle": "Analisis IA",
        "home.featureAnalysisText": "Inspecciona claridad, completitud y ambiguedad antes de avanzar.",
        "home.featureInterpretTag": "Interpretacion",
        "home.featureImageTitle": "Descripcion de imagen UML",
        "home.featureImageText": "Sube imagenes UML y recibe una explicacion legible para reportes y aprendizaje.",
        "settings.profile": "Perfil",
        "settings.general": "General",
        "settings.workspace": "Espacio de trabajo",
        "settings.exports": "Exportaciones",
        "settings.help": "Ayuda",
        "settings.logout": "Cerrar sesion",
        "settings.account": "Cuenta",
        "settings.title": "Configuracion",
        "settings.subtitle": "Administra tu cuenta, preferencias y flujo de trabajo.",
        "settings.myAccount": "Mi cuenta",
        "settings.appearance": "Apariencia",
        "settings.appearanceHelp": "Elige el estilo visual del espacio AIRA.",
        "settings.language": "Idioma",
        "settings.languageHelp": "Idioma de etiquetas y ayuda.",
        "settings.textSize": "Tamano de texto",
        "settings.textSizeHelp": "Tamano de lectura para documentos generados.",
        "settings.startPage": "Pagina inicial",
        "settings.startPageHelp": "Pagina que se abre despues de iniciar sesion.",
        "settings.saveActivity": "Guardar actividad",
        "settings.saveActivityHelp": "Guarda SRS, UML y analisis en Mi historial.",
        "settings.reuseHistory": "Reutilizar historial",
        "settings.reuseHistoryHelp": "Permite reutilizar contenido anterior.",
        "settings.exportsTitle": "Archivos y exportaciones",
        "settings.srsFormat": "Formato de SRS",
        "settings.srsFormatHelp": "Formato preferido para especificaciones.",
        "settings.umlFormat": "Exportacion UML",
        "settings.umlFormatHelp": "Formato preferido para diagramas.",
        "settings.uploadPreview": "Vista previa",
        "settings.uploadPreviewHelp": "Muestra archivos antes de procesar.",
        "settings.helpSupport": "Ayuda y soporte",
        "settings.openGuide": "Abrir guia de usuario",
        "settings.openGuideHelp": "Aprende a usar SRS, UML y analisis.",
        "settings.loggedIn": "Sesion activa en este navegador",
        "settings.logoutHelp": "Cierra sesion en computadoras compartidas.",
        "settings.logoutAction": "Cerrar sesion",
        "settings.save": "Guardar cambios",
        "settings.saved": "Guardado",
        "settings.unsaved": "Cambios sin guardar",
        "nav.history": "Mi historial",
        "option.system": "Sistema",
        "option.light": "Claro",
        "option.soft": "Contraste suave",
        "option.dark": "Oscuro",
        "option.english": "English",
        "option.spanish": "Spanish",
        "option.french": "French",
        "option.german": "German",
        "option.urdu": "Urdu",
        "option.default": "Predeterminado",
        "option.large": "Grande",
        "option.compact": "Compacto",
        "srs.eyebrow": "Constructor de especificaciones",
        "srs.title": "Generar especificacion de requisitos de software",
        "srs.description": "Comienza con una idea breve, un documento de referencia o una imagen UML. Agrega detalles extra cuando esten disponibles.",
        "srs.projectTitle": "Titulo del proyecto",
        "srs.projectTitlePlaceholder": "p. ej. Sistema de gestion de biblioteca en linea",
        "srs.projectIdea": "Idea del proyecto",
        "srs.projectIdeaPlaceholder": "Escribe una o dos lineas, o deja esto vacio si subes un documento o una imagen UML.",
        "srs.uploadTitle": "Subir archivo fuente",
        "srs.uploadText": "Sube una imagen UML, PDF, documento Word, archivo de texto o archivo de apoyo para este SRS.",
        "srs.uploadButton": "Subir archivo",
        "srs.advanced": "Detalles avanzados",
        "srs.domain": "Dominio del proyecto",
        "srs.selectDomain": "Seleccionar dominio",
        "srs.detailLevel": "Nivel de detalle",
        "srs.actors": "Usuarios / actores principales",
        "srs.actorsPlaceholder": "p. ej. Estudiante, Administrador, Bibliotecario",
        "srs.features": "Funciones principales",
        "srs.dataManaged": "Datos gestionados",
        "srs.dataManagedPlaceholder": "p. ej. Usuarios, libros, prestamos, reportes",
        "srs.generate": "Generar SRS",
        "srs.outputTitle": "Vista previa del SRS generado",
        "srs.outputPlaceholder": "El contenido SRS generado aparecera aqui.",
        "common.edit": "Editar",
        "common.download": "Descargar",
        "auth.access": "Accede a tu espacio",
        "auth.welcome": "Bienvenido de nuevo",
        "auth.loginHelp": "Inicia sesion para continuar trabajando en tus requisitos y diagramas.",
        "auth.email": "Correo electronico",
        "auth.emailPlaceholder": "Ingresa tu correo",
        "auth.password": "Contrasena",
        "auth.passwordPlaceholder": "Ingresa tu contrasena",
        "auth.login": "Iniciar sesion",
        "auth.noAccount": "No tienes cuenta?",
        "auth.signup": "Registrarse",
        "auth.createEyebrow": "Crea tu cuenta",
        "auth.createTitle": "Crear cuenta",
        "auth.createHelp": "Registrate para acceder a AIRA y mantener tu trabajo organizado.",
        "auth.fullName": "Nombre completo",
        "auth.fullNamePlaceholder": "Ingresa tu nombre completo",
        "auth.createPasswordPlaceholder": "Crea una contrasena",
        "auth.confirmPassword": "Confirmar contrasena",
        "auth.confirmPasswordPlaceholder": "Confirma tu contrasena",
        "auth.hasAccount": "Ya tienes cuenta?"
    },
    fr: {
        "app.title": "AIRA - Analyseur intelligent des exigences",
        "app.footer": "Projet de fin d'etudes - AIRA",
        "nav.home": "Accueil",
        "nav.generateSrs": "Generer SRS",
        "nav.generateUml": "Generer UML",
        "nav.aiAnalysis": "Analyse IA",
        "nav.umlImage": "Description d'image UML",
        "nav.login": "Connexion",
        "nav.signup": "Inscription",
        "home.eyebrow": "Espace exigences IA",
        "home.title": "Transformez des idees brutes en documents SRS et actifs UML soignes.",
        "home.subtitle": "AIRA aide les etudiants, analystes et developpeurs a structurer les exigences, verifier l'ambiguite et produire des sorties pretes pour les diagrammes.",
        "home.startSrs": "Commencer un SRS",
        "home.createUml": "Creer UML",
        "home.workflowLabel": "Flux principal",
        "home.workflowTitle": "Rediger, valider, visualiser",
        "home.workflowText": "Passez des notes d'exigences a une documentation revisable avec un processus plus clair.",
        "home.metricTools": "Outils assistes par IA",
        "home.metricSrs": "Generation et analyse",
        "home.metricUml": "Creation et explication",
        "home.capabilities": "Capacites",
        "home.capabilitiesTitle": "Tout est organise autour de la qualite documentaire",
        "home.featureSpecTag": "Specification",
        "home.featureSrsTitle": "Generation SRS",
        "home.featureSrsText": "Generez des specifications de besoins depuis des descriptions et fichiers supports.",
        "home.featureModelTag": "Modelisation",
        "home.featureUmlTitle": "Diagrammes UML",
        "home.featureUmlText": "Produisez des sorties UML modifiables pour cas d'utilisation, classes, sequences et activites.",
        "home.featureReviewTag": "Revision",
        "home.featureAnalysisTitle": "Analyse IA",
        "home.featureAnalysisText": "Verifiez clarte, completude et ambiguite avant d'avancer.",
        "home.featureInterpretTag": "Interpretation",
        "home.featureImageTitle": "Description d'image UML",
        "home.featureImageText": "Importez des images UML et recevez une explication lisible pour rapports et apprentissage.",
        "settings.profile": "Profil",
        "settings.general": "Général",
        "settings.workspace": "Espace de travail",
        "settings.exports": "Exportations",
        "settings.help": "Aide",
        "settings.logout": "Deconnexion",
        "settings.account": "Compte",
        "settings.title": "Parametres",
        "settings.subtitle": "Gerez votre compte, vos preferences et votre travail.",
        "settings.myAccount": "Mon compte",
        "settings.appearance": "Apparence",
        "settings.appearanceHelp": "Choisissez le style visuel de AIRA.",
        "settings.language": "Langue",
        "settings.languageHelp": "Langue des libelles et de l'aide.",
        "settings.textSize": "Taille du texte",
        "settings.textSizeHelp": "Taille de lecture des documents generes.",
        "settings.startPage": "Page de demarrage",
        "settings.startPageHelp": "Page ouverte apres connexion.",
        "settings.saveActivity": "Enregistrer l'activite",
        "settings.saveActivityHelp": "Enregistre SRS, UML et analyses dans l'historique.",
        "settings.reuseHistory": "Reutiliser l'historique",
        "settings.reuseHistoryHelp": "Permet de reutiliser les anciens contenus.",
        "settings.exportsTitle": "Fichiers et exports",
        "settings.srsFormat": "Format du SRS",
        "settings.srsFormatHelp": "Format prefere pour les specifications.",
        "settings.umlFormat": "Export UML",
        "settings.umlFormatHelp": "Format prefere pour les diagrammes.",
        "settings.uploadPreview": "Apercu des fichiers",
        "settings.uploadPreviewHelp": "Affiche les fichiers avant traitement.",
        "settings.helpSupport": "Aide et support",
        "settings.openGuide": "Ouvrir le guide",
        "settings.openGuideHelp": "Apprenez a utiliser SRS, UML et analyse.",
        "settings.loggedIn": "Connecte dans ce navigateur",
        "settings.logoutHelp": "Deconnectez-vous sur un ordinateur partage.",
        "settings.logoutAction": "Se deconnecter",
        "settings.save": "Enregistrer",
        "settings.saved": "Enregistre",
        "settings.unsaved": "Modifications non enregistrees",
        "nav.history": "Mon historique",
        "option.system": "Systeme",
        "option.light": "Clair",
        "option.soft": "Contraste doux",
        "option.dark": "Sombre",
        "option.english": "English",
        "option.spanish": "Spanish",
        "option.french": "French",
        "option.german": "German",
        "option.urdu": "Urdu",
        "option.default": "Defaut",
        "option.large": "Grand",
        "option.compact": "Compact",
        "srs.eyebrow": "Constructeur de specification",
        "srs.title": "Generer la specification des exigences logicielles",
        "srs.description": "Commencez par une idee breve, un document de reference ou une image de diagramme UML. Ajoutez des details quand ils sont disponibles.",
        "srs.projectTitle": "Titre du projet",
        "srs.projectTitlePlaceholder": "p. ex. Systeme de gestion de bibliotheque en ligne",
        "srs.projectIdea": "Idee du projet",
        "srs.projectIdeaPlaceholder": "Ecrivez une ou deux lignes, ou laissez ce champ vide si vous importez un document ou une image UML.",
        "srs.uploadTitle": "Importer un fichier source",
        "srs.uploadText": "Importez une image UML, un PDF, un document Word, un fichier texte ou un fichier de support pour ce SRS.",
        "srs.uploadButton": "Importer un fichier",
        "srs.advanced": "Details avances",
        "srs.domain": "Domaine du projet",
        "srs.selectDomain": "Selectionner un domaine",
        "srs.detailLevel": "Niveau de detail",
        "srs.actors": "Utilisateurs / acteurs principaux",
        "srs.actorsPlaceholder": "p. ex. Etudiant, Administrateur, Bibliothecaire",
        "srs.features": "Fonctionnalites principales",
        "srs.dataManaged": "Donnees gerees",
        "srs.dataManagedPlaceholder": "p. ex. Utilisateurs, livres, emprunts, rapports",
        "srs.generate": "Generer SRS",
        "srs.outputTitle": "Apercu du SRS genere",
        "srs.outputPlaceholder": "Le contenu SRS genere sera affiche ici.",
        "common.edit": "Modifier",
        "common.download": "Telecharger",
        "auth.access": "Accedez a votre espace",
        "auth.welcome": "Bon retour",
        "auth.loginHelp": "Connectez-vous pour continuer vos exigences et diagrammes.",
        "auth.email": "Adresse e-mail",
        "auth.emailPlaceholder": "Entrez votre e-mail",
        "auth.password": "Mot de passe",
        "auth.passwordPlaceholder": "Entrez votre mot de passe",
        "auth.login": "Connexion",
        "auth.noAccount": "Vous n'avez pas de compte ?",
        "auth.signup": "Inscription",
        "auth.createEyebrow": "Creez votre compte",
        "auth.createTitle": "Creer un compte",
        "auth.createHelp": "Inscrivez-vous pour acceder a AIRA et organiser votre travail.",
        "auth.fullName": "Nom complet",
        "auth.fullNamePlaceholder": "Entrez votre nom complet",
        "auth.createPasswordPlaceholder": "Creez un mot de passe",
        "auth.confirmPassword": "Confirmer le mot de passe",
        "auth.confirmPasswordPlaceholder": "Confirmez votre mot de passe",
        "auth.hasAccount": "Vous avez deja un compte ?"
    },
    de: {
        "app.title": "AIRA - Intelligenter Anforderungsanalysator",
        "app.footer": "Abschlussprojekt - AIRA",
        "nav.home": "Startseite",
        "nav.generateSrs": "SRS erstellen",
        "nav.generateUml": "UML erstellen",
        "nav.aiAnalysis": "KI-Analyse",
        "nav.umlImage": "UML-Bildbeschreibung",
        "nav.login": "Anmelden",
        "nav.signup": "Registrieren",
        "home.eyebrow": "KI-Anforderungsbereich",
        "home.title": "Verwandeln Sie Projektideen in fertige SRS-Dokumente und UML-Artefakte.",
        "home.subtitle": "AIRA hilft Studenten, Analysten und Entwicklern, Anforderungen zu strukturieren, Mehrdeutigkeit zu pruefen und diagrammfertige Ergebnisse zu erzeugen.",
        "home.startSrs": "SRS starten",
        "home.createUml": "UML erstellen",
        "home.workflowLabel": "Kernablauf",
        "home.workflowTitle": "Entwerfen, pruefen, visualisieren",
        "home.workflowText": "Vom Anforderungsnotiz zur pruefbaren Dokumentation mit einem klareren Prozess.",
        "home.metricTools": "KI-gestuetzte Werkzeuge",
        "home.metricSrs": "Erstellung und Analyse",
        "home.metricUml": "Erstellung und Erklaerung",
        "home.capabilities": "Funktionen",
        "home.capabilitiesTitle": "Alles ist auf Dokumentationsqualitaet ausgerichtet",
        "home.featureSpecTag": "Spezifikation",
        "home.featureSrsTitle": "SRS-Erstellung",
        "home.featureSrsText": "Erstellen Sie strukturierte Anforderungsspezifikationen aus Beschreibungen und Dateien.",
        "home.featureModelTag": "Modellierung",
        "home.featureUmlTitle": "UML-Diagramme",
        "home.featureUmlText": "Erzeugen Sie bearbeitbare UML-Ausgaben fuer Use Case, Klasse, Sequenz und Aktivitaet.",
        "home.featureReviewTag": "Pruefung",
        "home.featureAnalysisTitle": "KI-Analyse",
        "home.featureAnalysisText": "Pruefen Sie Klarheit, Vollstaendigkeit und Mehrdeutigkeit vor dem naechsten Schritt.",
        "home.featureInterpretTag": "Interpretation",
        "home.featureImageTitle": "UML-Bildbeschreibung",
        "home.featureImageText": "Laden Sie UML-Bilder hoch und erhalten Sie eine lesbare Erklaerung fuer Berichte und Lernen.",
        "settings.profile": "Profil",
        "settings.general": "Allgemein",
        "settings.workspace": "Arbeitsbereich",
        "settings.exports": "Exporte",
        "settings.help": "Hilfe",
        "settings.logout": "Abmelden",
        "settings.account": "Konto",
        "settings.title": "Einstellungen",
        "settings.subtitle": "Verwalten Sie Konto, Arbeitsbereich und Projektablauf.",
        "settings.myAccount": "Mein Konto",
        "settings.appearance": "Darstellung",
        "settings.appearanceHelp": "Wahlen Sie den visuellen Stil von AIRA.",
        "settings.language": "Sprache",
        "settings.languageHelp": "Sprache fur Beschriftungen und Hinweise.",
        "settings.textSize": "Textgroesse",
        "settings.textSizeHelp": "Lesegroesse fur generierte Dokumente.",
        "settings.startPage": "Startseite",
        "settings.startPageHelp": "Seite nach Anmeldung oder Registrierung.",
        "settings.saveActivity": "Aktivitat speichern",
        "settings.saveActivityHelp": "Speichert SRS, UML und Analysen im Verlauf.",
        "settings.reuseHistory": "Verlauf wiederverwenden",
        "settings.reuseHistoryHelp": "Erlaubt das Wiederverwenden fruherer Inhalte.",
        "settings.exportsTitle": "Dateien und Exporte",
        "settings.srsFormat": "SRS-Format",
        "settings.srsFormatHelp": "Bevorzugtes Format fur Spezifikationen.",
        "settings.umlFormat": "UML-Export",
        "settings.umlFormatHelp": "Bevorzugtes Format fur Diagramme.",
        "settings.uploadPreview": "Upload-Vorschau",
        "settings.uploadPreviewHelp": "Zeigt Dateien vor der Verarbeitung.",
        "settings.helpSupport": "Hilfe und Support",
        "settings.openGuide": "Benutzerhandbuch offnen",
        "settings.openGuideHelp": "Lernen Sie SRS, UML und Analyse zu verwenden.",
        "settings.loggedIn": "In diesem Browser angemeldet",
        "settings.logoutHelp": "Melden Sie sich auf gemeinsam genutzten Computern ab.",
        "settings.logoutAction": "Abmelden",
        "settings.save": "Anderungen speichern",
        "settings.saved": "Gespeichert",
        "settings.unsaved": "Nicht gespeicherte Anderungen",
        "nav.history": "Mein Verlauf",
        "option.system": "System",
        "option.light": "Hell",
        "option.soft": "Weicher Kontrast",
        "option.dark": "Dunkel",
        "option.english": "English",
        "option.spanish": "Spanish",
        "option.french": "French",
        "option.german": "German",
        "option.urdu": "Urdu",
        "option.default": "Standard",
        "option.large": "Gross",
        "option.compact": "Kompakt",
        "srs.eyebrow": "Spezifikations-Builder",
        "srs.title": "Software-Anforderungsspezifikation erstellen",
        "srs.description": "Beginnen Sie mit einer kurzen Idee, einem Referenzdokument oder einem UML-Diagrammbild. Fuegen Sie weitere Details hinzu, wenn sie verfuegbar sind.",
        "srs.projectTitle": "Projekttitel",
        "srs.projectTitlePlaceholder": "z. B. Online-Bibliotheksverwaltungssystem",
        "srs.projectIdea": "Projektidee",
        "srs.projectIdeaPlaceholder": "Schreiben Sie ein oder zwei Zeilen, oder lassen Sie dies leer, wenn Sie ein Dokument oder UML-Bild hochladen.",
        "srs.uploadTitle": "Quelldatei hochladen",
        "srs.uploadText": "Laden Sie ein UML-Bild, PDF, Word-Dokument, eine Textdatei oder eine unterstuetzende Projektdatei fuer dieses SRS hoch.",
        "srs.uploadButton": "Datei hochladen",
        "srs.advanced": "Erweiterte Details",
        "srs.domain": "Projektdomaene",
        "srs.selectDomain": "Domaene auswaehlen",
        "srs.detailLevel": "Detailgrad der Ausgabe",
        "srs.actors": "Hauptnutzer / Akteure",
        "srs.actorsPlaceholder": "z. B. Student, Administrator, Bibliothekar",
        "srs.features": "Hauptfunktionen",
        "srs.dataManaged": "Verwaltete Daten",
        "srs.dataManagedPlaceholder": "z. B. Benutzer, Buecher, Ausleihen, Berichte",
        "srs.generate": "SRS erstellen",
        "srs.outputTitle": "Vorschau des erstellten SRS",
        "srs.outputPlaceholder": "Der erstellte SRS-Inhalt wird hier angezeigt.",
        "common.edit": "Bearbeiten",
        "common.download": "Herunterladen",
        "auth.access": "Arbeitsbereich oeffnen",
        "auth.welcome": "Willkommen zurueck",
        "auth.loginHelp": "Melden Sie sich an, um an Anforderungen und Diagrammen weiterzuarbeiten.",
        "auth.email": "E-Mail-Adresse",
        "auth.emailPlaceholder": "E-Mail eingeben",
        "auth.password": "Passwort",
        "auth.passwordPlaceholder": "Passwort eingeben",
        "auth.login": "Anmelden",
        "auth.noAccount": "Noch kein Konto?",
        "auth.signup": "Registrieren",
        "auth.createEyebrow": "Erstellen Sie Ihr Konto",
        "auth.createTitle": "Konto erstellen",
        "auth.createHelp": "Registrieren Sie sich, um AIRA zu nutzen und Ihre Arbeit zu organisieren.",
        "auth.fullName": "Vollstaendiger Name",
        "auth.fullNamePlaceholder": "Vollstaendigen Namen eingeben",
        "auth.createPasswordPlaceholder": "Passwort erstellen",
        "auth.confirmPassword": "Passwort bestaetigen",
        "auth.confirmPasswordPlaceholder": "Passwort bestaetigen",
        "auth.hasAccount": "Sie haben bereits ein Konto?"
    },
    ur: {
        "app.title": "AIRA - مصنوعی ذہانت سے تقاضوں کا تجزیہ کار",
        "app.footer": "فائنل ایئر پروجیکٹ - AIRA",
        "nav.home": "ہوم",
        "nav.generateSrs": "SRS بنائیں",
        "nav.generateUml": "UML بنائیں",
        "nav.aiAnalysis": "AI تجزیہ",
        "nav.umlImage": "UML تصویر کی وضاحت",
        "nav.login": "لاگ اِن",
        "nav.signup": "سائن اَپ",
        "nav.history": "میری ہسٹری",
        "home.eyebrow": "AI تقاضوں کا ورک اسپیس",
        "home.title": "خام پروجیکٹ آئیڈیاز کو مکمل SRS دستاویزات اور UML اثاثوں میں بدلیں۔",
        "home.subtitle": "AIRA طلبہ، تجزیہ کاروں اور ڈویلپرز کو تقاضے منظم کرنے، ابہام جانچنے، اور ڈایاگرام کے لیے تیار نتائج بنانے میں مدد دیتا ہے۔",
        "home.startSrs": "SRS شروع کریں",
        "home.createUml": "UML بنائیں",
        "home.workflowLabel": "بنیادی ورک فلو",
        "home.workflowTitle": "لکھیں، تصدیق کریں، دکھائیں",
        "home.workflowText": "تقاضوں کے نوٹس سے قابلِ جائزہ دستاویزات تک ایک صاف اور رہنمائی شدہ عمل کے ساتھ جائیں۔",
        "home.metricTools": "AI معاون ٹولز",
        "home.metricSrs": "جنریشن اور تجزیہ",
        "home.metricUml": "تخلیق اور وضاحت",
        "home.capabilities": "صلاحیتیں",
        "home.capabilitiesTitle": "ہر چیز دستاویزات کے معیار کے گرد منظم ہے",
        "home.featureSpecTag": "تفصیل",
        "home.featureSrsTitle": "SRS جنریشن",
        "home.featureSrsText": "پروجیکٹ کی تفصیل اور معاون فائلوں سے منظم سافٹ ویئر تقاضوں کی تفصیلات بنائیں۔",
        "home.featureModelTag": "ماڈلنگ",
        "home.featureUmlTitle": "UML ڈایاگرامز",
        "home.featureUmlText": "یوز کیس، کلاس، سیکوئنس، اور ایکٹیویٹی ورک فلو کے لیے قابلِ ترمیم UML آؤٹ پٹ بنائیں۔",
        "home.featureReviewTag": "جائزہ",
        "home.featureAnalysisTitle": "AI تجزیہ",
        "home.featureAnalysisText": "دستاویزات آگے بڑھانے سے پہلے وضاحت، مکمل پن، اور ابہام کو چیک کریں۔",
        "home.featureInterpretTag": "تشریح",
        "home.featureImageTitle": "UML تصویر کی وضاحت",
        "home.featureImageText": "UML تصاویر اپ لوڈ کریں اور رپورٹس، جائزے، اور سیکھنے کے لیے قابلِ فہم وضاحت حاصل کریں۔",
        "settings.profile": "پروفائل",
        "settings.general": "جنرل",
        "settings.workspace": "ورک اسپیس",
        "settings.exports": "ایکسپورٹس",
        "settings.help": "مدد",
        "settings.logout": "لاگ آؤٹ",
        "settings.account": "اکاؤنٹ",
        "settings.title": "سیٹنگز",
        "settings.subtitle": "اپنا اکاؤنٹ، ورک اسپیس ترجیحات، اور پروجیکٹ ورک فلو منظم کریں۔",
        "settings.myAccount": "میرا اکاؤنٹ",
        "settings.appearance": "ظاہری شکل",
        "settings.appearanceHelp": "AIRA ورک اسپیس کا بصری انداز منتخب کریں۔",
        "settings.language": "زبان",
        "settings.languageHelp": "لیبلز اور رہنمائی کے لیے انٹرفیس زبان۔",
        "settings.textSize": "متن کا سائز",
        "settings.textSizeHelp": "بنائی گئی دستاویزات کے لیے آرام دہ پڑھنے کا سائز۔",
        "settings.startPage": "ابتدائی صفحہ",
        "settings.startPageHelp": "لاگ اِن یا سائن اَپ کے بعد کھلنے والا صفحہ۔",
        "settings.saveActivity": "بنائی گئی سرگرمی محفوظ کریں",
        "settings.saveActivityHelp": "SRS، UML، اور تجزیہ کے ریکارڈز میری ہسٹری میں محفوظ کریں۔",
        "settings.reuseHistory": "ہسٹری دوبارہ استعمال کریں",
        "settings.reuseHistoryHelp": "پچھلے پرامپٹس اور نتائج کو نئے کاموں میں استعمال کرنے دیں۔",
        "settings.exportsTitle": "فائلز اور ایکسپورٹس",
        "settings.srsFormat": "SRS دستاویز فارمیٹ",
        "settings.srsFormatHelp": "بنائی گئی تفصیلات کے لیے ترجیحی ایکسپورٹ فارمیٹ۔",
        "settings.umlFormat": "UML ڈایاگرام ایکسپورٹ",
        "settings.umlFormatHelp": "ڈاؤن لوڈ کیے گئے ڈایاگرامز کے لیے ترجیحی فارمیٹ۔",
        "settings.uploadPreview": "اپ لوڈ پری ویو",
        "settings.uploadPreviewHelp": "پروسیسنگ سے پہلے اپ لوڈ فائلوں کا پری ویو دکھائیں۔",
        "settings.helpSupport": "مدد اور سپورٹ",
        "settings.openGuide": "یوزر گائیڈ کھولیں",
        "settings.openGuideHelp": "SRS دستاویزات، UML ڈایاگرامز، اور تجزیہ رپورٹس بنانا سیکھیں۔",
        "settings.loggedIn": "اس براؤزر پر لاگ اِن ہیں",
        "settings.logoutHelp": "مشترکہ کمپیوٹر چھوڑنے سے پہلے لاگ آؤٹ کریں۔",
        "settings.logoutAction": "لاگ آؤٹ",
        "settings.save": "تبدیلیاں محفوظ کریں",
        "settings.saved": "محفوظ ہوگیا",
        "settings.unsaved": "غیر محفوظ تبدیلیاں",
        "option.system": "System",
        "option.light": "Light",
        "option.soft": "Soft Contrast",
        "option.dark": "Dark",
        "option.english": "English",
        "option.spanish": "Spanish",
        "option.french": "French",
        "option.german": "German",
        "option.urdu": "Urdu",
        "option.default": "Default",
        "option.large": "Large",
        "option.compact": "Compact",
        "srs.eyebrow": "تفصیلات بنانے والا",
        "srs.title": "سافٹ ویئر تقاضوں کی تفصیل بنائیں",
        "srs.description": "مختصر آئیڈیا، حوالہ دستاویز، یا UML ڈایاگرام تصویر سے شروع کریں۔ دستیاب ہوں تو اضافی تفصیلات شامل کریں۔",
        "srs.projectTitle": "پروجیکٹ عنوان",
        "srs.projectTitlePlaceholder": "مثلاً آن لائن لائبریری مینجمنٹ سسٹم",
        "srs.projectIdea": "پروجیکٹ آئیڈیا",
        "srs.projectIdeaPlaceholder": "ایک یا دو لائنیں لکھیں، یا اگر دستاویز/UML تصویر اپ لوڈ کر رہے ہیں تو خالی چھوڑ دیں۔",
        "srs.uploadTitle": "سورس فائل اپ لوڈ کریں",
        "srs.uploadText": "اس SRS کے لیے ایک UML تصویر، PDF، Word دستاویز، ٹیکسٹ فائل، یا معاون پروجیکٹ فائل اپ لوڈ کریں۔",
        "srs.uploadButton": "فائل اپ لوڈ کریں",
        "srs.advanced": "ایڈوانس تفصیلات",
        "srs.domain": "پروجیکٹ ڈومین",
        "srs.selectDomain": "ڈومین منتخب کریں",
        "srs.detailLevel": "آؤٹ پٹ تفصیل کی سطح",
        "srs.actors": "مرکزی صارفین / ایکٹرز",
        "srs.actorsPlaceholder": "مثلاً طالب علم، ایڈمن، لائبریرین",
        "srs.features": "مرکزی فیچرز",
        "srs.dataManaged": "منظم کیا گیا ڈیٹا",
        "srs.dataManagedPlaceholder": "مثلاً صارفین، کتابیں، ادھار ریکارڈز، رپورٹس",
        "srs.generate": "SRS بنائیں",
        "srs.outputTitle": "بنائے گئے SRS کا پری ویو",
        "srs.outputPlaceholder": "بنایا گیا SRS مواد یہاں دکھایا جائے گا۔",
        "common.edit": "ترمیم",
        "common.download": "ڈاؤن لوڈ",
        "auth.access": "اپنا ورک اسپیس کھولیں",
        "auth.welcome": "خوش آمدید",
        "auth.loginHelp": "اپنے تقاضوں اور ڈایاگرامز پر کام جاری رکھنے کے لیے لاگ اِن کریں۔",
        "auth.email": "ای میل ایڈریس",
        "auth.emailPlaceholder": "اپنی ای میل درج کریں",
        "auth.password": "پاس ورڈ",
        "auth.passwordPlaceholder": "اپنا پاس ورڈ درج کریں",
        "auth.login": "لاگ اِن",
        "auth.noAccount": "اکاؤنٹ نہیں ہے؟",
        "auth.signup": "سائن اَپ",
        "auth.createEyebrow": "اپنا اکاؤنٹ بنائیں",
        "auth.createTitle": "اکاؤنٹ بنائیں",
        "auth.createHelp": "AIRA فیچرز استعمال کرنے اور اپنا کام منظم رکھنے کے لیے رجسٹر کریں۔",
        "auth.fullName": "پورا نام",
        "auth.fullNamePlaceholder": "اپنا پورا نام درج کریں",
        "auth.createPasswordPlaceholder": "پاس ورڈ بنائیں",
        "auth.confirmPassword": "پاس ورڈ کی تصدیق",
        "auth.confirmPasswordPlaceholder": "اپنے پاس ورڈ کی تصدیق کریں",
        "auth.hasAccount": "پہلے سے اکاؤنٹ ہے؟"
    }
};

const originalTextNodes = new WeakMap();

function translate(key, language = getSavedSettings().language || "en") {
    return AIRA_TRANSLATIONS[language]?.[key] || AIRA_TRANSLATIONS.en[key] || key;
}

function applyTranslations(language) {
    document.querySelectorAll("[data-i18n]").forEach(node => {
        node.textContent = translate(node.dataset.i18n, language);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(node => {
        node.setAttribute("placeholder", translate(node.dataset.i18nPlaceholder, language));
    });
    document.querySelectorAll("[data-i18n-title]").forEach(node => {
        node.setAttribute("title", translate(node.dataset.i18nTitle, language));
    });
    localizeStaticContent(language);
}

function localizeStaticContent(language) {
    document.documentElement.lang = language || "en";
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
    document.body.classList.toggle("rtl-language", language === "ur");

    const topTitle = document.querySelector(".top-title-text");
    if (topTitle) topTitle.textContent = translate("app.title", language);

    const footer = document.querySelector(".footer");
    if (footer) footer.textContent = translate("app.footer", language);

    const sidebarList = document.querySelector("#sidebar ul");
    if (sidebarList) localizeSidebarLinks(sidebarList, language);

    setText(".page-home .hero-copy .eyebrow", "home.eyebrow", language);
    setText(".page-home .hero-copy h1", "home.title", language);
    setText(".page-home .hero-copy p", "home.subtitle", language);
    setText(".page-home .hero-actions .primary-btn", "home.startSrs", language);
    setText(".page-home .hero-actions .secondary-btn", "home.createUml", language);
    setText(".page-home .highlight-label", "home.workflowLabel", language);
    setText(".page-home .highlight-card h3", "home.workflowTitle", language);
    setText(".page-home .highlight-card p", "home.workflowText", language);
    document.querySelectorAll(".page-home .metric-card span").forEach((node, index) => {
        const keys = ["home.metricTools", "home.metricSrs", "home.metricUml"];
        if (keys[index]) node.textContent = translate(keys[index], language);
    });
    setText(".page-home .section-heading .eyebrow", "home.capabilities", language);
    setText(".page-home .section-heading h2", "home.capabilitiesTitle", language);

    const featureCards = document.querySelectorAll(".page-home .feature-card");
    const featureKeys = [
        ["home.featureSpecTag", "home.featureSrsTitle", "home.featureSrsText"],
        ["home.featureModelTag", "home.featureUmlTitle", "home.featureUmlText"],
        ["home.featureReviewTag", "home.featureAnalysisTitle", "home.featureAnalysisText"],
        ["home.featureInterpretTag", "home.featureImageTitle", "home.featureImageText"]
    ];
    featureCards.forEach((card, index) => {
        const keys = featureKeys[index];
        if (!keys) return;
        const tag = card.querySelector(".feature-tag");
        const title = card.querySelector("h3");
        const text = card.querySelector("p");
        if (tag) tag.textContent = translate(keys[0], language);
        if (title) title.textContent = translate(keys[1], language);
        if (text) text.textContent = translate(keys[2], language);
    });
    localizeCommonPhrases(language);
}

function setText(selector, key, language) {
    const node = document.querySelector(selector);
    if (node) node.textContent = translate(key, language);
}

const AIRA_COMMON_PHRASES = {
    es: {
        "Welcome Back": "Bienvenido de nuevo",
        "Login to continue working on your requirements and diagrams.": "Inicia sesion para continuar trabajando en tus requisitos y diagramas.",
        "Email Address": "Correo electronico",
        "Password": "Contrasena",
        "Login": "Iniciar sesion",
        "Create Account": "Crear cuenta",
        "Create Your Account": "Crea tu cuenta",
        "Register to access AIRA features and keep your work organized.": "Registrate para acceder a AIRA y mantener tu trabajo organizado.",
        "Full Name": "Nombre completo",
        "Confirm Password": "Confirmar contrasena",
        "Sign Up": "Registrarse",
        "Generate Software Requirement Specification": "Generar especificacion de requisitos de software",
        "Project Title": "Titulo del proyecto",
        "Project Idea": "Idea del proyecto",
        "Upload Source File": "Subir archivo fuente",
        "Upload File": "Subir archivo",
        "Advanced details": "Detalles avanzados",
        "Project Domain": "Dominio del proyecto",
        "Output Detail Level": "Nivel de detalle",
        "Main Users / Actors": "Usuarios / actores principales",
        "Main Features": "Funciones principales",
        "Data Managed": "Datos gestionados",
        "Generate SRS": "Generar SRS",
        "Generated SRS Preview": "Vista previa del SRS generado",
        "Edit": "Editar",
        "Download": "Descargar",
        "Generate UML Diagram": "Generar diagrama UML",
        "Check SRS Ambiguity": "Comprobar ambiguedad del SRS",
        "Saved Activity": "Actividad guardada",
        "My History": "Mi historial",
        "View and reuse your previously generated SRS, UML diagrams, and AI analysis results.": "Consulta y reutiliza tus SRS, diagramas UML y analisis generados.",
        "Enter your email": "Ingresa tu correo",
        "Enter your password": "Ingresa tu contrasena",
        "Enter your full name": "Ingresa tu nombre completo",
        "Create a password": "Crea una contrasena",
        "Confirm your password": "Confirma tu contrasena"
    },
    fr: {
        "Welcome Back": "Bon retour",
        "Login to continue working on your requirements and diagrams.": "Connectez-vous pour continuer vos exigences et diagrammes.",
        "Email Address": "Adresse e-mail",
        "Password": "Mot de passe",
        "Login": "Connexion",
        "Create Account": "Creer un compte",
        "Create Your Account": "Creez votre compte",
        "Register to access AIRA features and keep your work organized.": "Inscrivez-vous pour acceder a AIRA et organiser votre travail.",
        "Full Name": "Nom complet",
        "Confirm Password": "Confirmer le mot de passe",
        "Sign Up": "Inscription",
        "Generate Software Requirement Specification": "Generer la specification des exigences logicielles",
        "Project Title": "Titre du projet",
        "Project Idea": "Idee du projet",
        "Upload Source File": "Importer un fichier source",
        "Upload File": "Importer un fichier",
        "Advanced details": "Details avances",
        "Project Domain": "Domaine du projet",
        "Output Detail Level": "Niveau de detail",
        "Main Users / Actors": "Utilisateurs / acteurs principaux",
        "Main Features": "Fonctionnalites principales",
        "Data Managed": "Donnees gerees",
        "Generate SRS": "Generer SRS",
        "Generated SRS Preview": "Apercu du SRS genere",
        "Edit": "Modifier",
        "Download": "Telecharger",
        "Generate UML Diagram": "Generer un diagramme UML",
        "Check SRS Ambiguity": "Verifier l'ambiguite du SRS",
        "Saved Activity": "Activite enregistree",
        "My History": "Mon historique",
        "View and reuse your previously generated SRS, UML diagrams, and AI analysis results.": "Consultez et reutilisez vos SRS, diagrammes UML et analyses.",
        "Enter your email": "Entrez votre e-mail",
        "Enter your password": "Entrez votre mot de passe",
        "Enter your full name": "Entrez votre nom complet",
        "Create a password": "Creez un mot de passe",
        "Confirm your password": "Confirmez votre mot de passe"
    },
    de: {
        "Welcome Back": "Willkommen zurueck",
        "Login to continue working on your requirements and diagrams.": "Melden Sie sich an, um an Anforderungen und Diagrammen weiterzuarbeiten.",
        "Email Address": "E-Mail-Adresse",
        "Password": "Passwort",
        "Login": "Anmelden",
        "Create Account": "Konto erstellen",
        "Create Your Account": "Erstellen Sie Ihr Konto",
        "Register to access AIRA features and keep your work organized.": "Registrieren Sie sich, um AIRA zu nutzen und Ihre Arbeit zu organisieren.",
        "Full Name": "Vollstandiger Name",
        "Confirm Password": "Passwort bestatigen",
        "Sign Up": "Registrieren",
        "Generate Software Requirement Specification": "Software-Anforderungsspezifikation erstellen",
        "Project Title": "Projekttitel",
        "Project Idea": "Projektidee",
        "Upload Source File": "Quelldatei hochladen",
        "Upload File": "Datei hochladen",
        "Advanced details": "Erweiterte Details",
        "Project Domain": "Projektdomane",
        "Output Detail Level": "Detailgrad",
        "Main Users / Actors": "Hauptnutzer / Akteure",
        "Main Features": "Hauptfunktionen",
        "Data Managed": "Verwaltete Daten",
        "Generate SRS": "SRS erstellen",
        "Generated SRS Preview": "Vorschau des erstellten SRS",
        "Edit": "Bearbeiten",
        "Download": "Herunterladen",
        "Generate UML Diagram": "UML-Diagramm erstellen",
        "Check SRS Ambiguity": "SRS-Mehrdeutigkeit pruefen",
        "Saved Activity": "Gespeicherte Aktivitat",
        "My History": "Mein Verlauf",
        "View and reuse your previously generated SRS, UML diagrams, and AI analysis results.": "Zeigen Sie Ihre frueheren SRS, UML-Diagramme und Analysen an.",
        "Enter your email": "E-Mail eingeben",
        "Enter your password": "Passwort eingeben",
        "Enter your full name": "Vollstandigen Namen eingeben",
        "Create a password": "Passwort erstellen",
        "Confirm your password": "Passwort bestatigen"
    }
};

const AIRA_COMMON_EXTRA = {
    es: {
        "Requirement Review": "Revision de requisitos",
        "SRS Ambiguity Checker": "Comprobador de ambiguedad SRS",
        "Upload an SRS document. The system will analyze the requirements\n                and identify ambiguous or unclear statements using AI.": "Sube un documento SRS. El sistema analizara los requisitos e identificara enunciados ambiguos o poco claros usando IA.",
        "Upload SRS Document": "Subir documento SRS",
        "Optional: paste SRS text here if you do not want to upload a file...": "Opcional: pega aqui el texto SRS si no quieres subir un archivo...",
        "Attach SRS File": "Adjuntar archivo SRS",
        "Supported formats: PDF, DOC, DOCX, TXT": "Formatos admitidos: PDF, DOC, DOCX, TXT",
        "Check Ambiguity": "Comprobar ambiguedad",
        "Ambiguity Analysis Preview": "Vista previa del analisis de ambiguedad",
        "Diagram Workspace": "Espacio de diagramas",
        "Provide your system description or upload an SRS document.\n                AIRA will generate UML diagram output and let you refine it visually.": "Proporciona la descripcion del sistema o sube un documento SRS. AIRA generara el diagrama UML y te permitira ajustarlo visualmente.",
        "Select UML Diagram Type": "Seleccionar tipo de diagrama UML",
        "Use Case Diagram": "Diagrama de casos de uso",
        "Class Diagram": "Diagrama de clases",
        "Sequence Diagram": "Diagrama de secuencia",
        "ERD Diagram": "Diagrama ERD",
        "Activity Diagram": "Diagrama de actividad",
        "System Description or Upload File": "Descripcion del sistema o archivo",
        "Write your system description, workflow, or modeling request here...": "Escribe aqui la descripcion del sistema, flujo de trabajo o solicitud de modelado...",
        "Attach File": "Adjuntar archivo",
        "Generated UML Preview": "Vista previa del UML generado",
        "Edit Diagram": "Editar diagrama",
        "Visual Interpretation": "Interpretacion visual",
        "Upload a UML diagram image. The system will analyze the diagram\n                and generate a detailed textual description.": "Sube una imagen de diagrama UML. El sistema analizara el diagrama y generara una descripcion textual detallada.",
        "Upload UML Diagram Image": "Subir imagen de diagrama UML",
        "Attach Image": "Adjuntar imagen",
        "Supported formats: PNG, JPG, JPEG": "Formatos admitidos: PNG, JPG, JPEG",
        "Analyze UML Image": "Analizar imagen UML",
        "Generated Description Preview": "Vista previa de la descripcion generada",
        "The UML image description will appear here.": "La descripcion de la imagen UML aparecera aqui.",
        "User Guide": "Guia de usuario",
        "How to Use AIRA": "Como usar AIRA",
        "Use these steps when you are new to the system.": "Usa estos pasos si eres nuevo en el sistema.",
        "Create or login to your account": "Crea o inicia sesion en tu cuenta",
        "Signup first, then login so AIRA can save your generated work in My History.": "Registrate primero y luego inicia sesion para que AIRA guarde tu trabajo en Mi historial.",
        "Open Generate SRS, enter a project title and idea, or upload a source file, then generate the document.": "Abre Generar SRS, escribe el titulo y la idea del proyecto, o sube un archivo fuente, y genera el documento.",
        "Open Generate UML, describe your system, choose a diagram type, then edit the diagram if needed.": "Abre Generar UML, describe el sistema, elige un tipo de diagrama y editalo si es necesario.",
        "Check SRS quality": "Comprobar calidad del SRS",
        "Open AI Analysis, paste or upload SRS text, and review ambiguity or improvement suggestions.": "Abre Analisis IA, pega o sube el texto SRS y revisa ambiguedades o sugerencias de mejora.",
        "Describe UML images": "Describir imagenes UML",
        "Open UML Image Description, upload a UML image, and AIRA will extract and explain the diagram.": "Abre Descripcion de imagen UML, sube una imagen UML y AIRA extraera y explicara el diagrama.",
        "Reuse saved work": "Reutilizar trabajo guardado",
        "Open My History to view previous activity and reuse generated content in another tool.": "Abre Mi historial para ver actividad anterior y reutilizar contenido generado en otra herramienta.",
        "Files and Exports": "Archivos y exportaciones",
        "PDF / DOC": "PDF / DOC",
        "PNG / PDF": "PNG / PDF",
        "Select": "Seleccionar",
        "Delete": "Eliminar",
        "Connector": "Conector",
        "Text": "Texto",
        "Note": "Nota",
        "Frame": "Marco",
        "Actor": "Actor",
        "Boundary": "Limite",
        "Include": "Incluir",
        "Extend": "Extender",
        "Package": "Paquete",
        "Association": "Asociacion",
        "Dependency": "Dependencia",
        "Inheritance": "Herencia",
        "Aggregation": "Agregacion",
        "Composition": "Composicion",
        "Lifeline": "Linea de vida",
        "Activation": "Activacion",
        "Message": "Mensaje",
        "Return": "Retorno",
        "Start": "Inicio",
        "Action": "Accion",
        "Decision": "Decision",
        "Merge": "Fusionar",
        "Object": "Objeto",
        "Entity": "Entidad",
        "Table": "Tabla",
        "Attribute": "Atributo",
        "Relationship": "Relacion",
        "Duplicate": "Duplicar",
        "Bring to Front": "Traer al frente"
        ,"Checking ambiguity with trained model...": "Comprobando ambiguedad con el modelo entrenado...",
        "Please paste SRS text or attach an SRS file first.": "Pega texto SRS o adjunta primero un archivo SRS.",
        "Unable to check ambiguity.": "No se pudo comprobar la ambiguedad.",
        "Ambiguity checking failed.": "La comprobacion de ambiguedad fallo.",
        "No complete requirements were detected in the provided text.": "No se detectaron requisitos completos en el texto proporcionado.",
        "Total Requirements:": "Requisitos totales:",
        "Ambiguous:": "Ambiguos:",
        "Clear:": "Claros:",
        "Please attach a UML diagram image first.": "Adjunta primero una imagen de diagrama UML.",
        "Reading UML image and generating description...": "Leyendo la imagen UML y generando la descripcion...",
        "Unable to analyze UML image.": "No se pudo analizar la imagen UML.",
        "Summary:": "Resumen:",
        "UML image processed successfully.": "Imagen UML procesada correctamente.",
        "Description": "Descripcion",
        "No diagram details were detected.": "No se detectaron detalles del diagrama.",
        "View Extracted Text": "Ver texto extraido",
        "UML image analysis failed.": "El analisis de la imagen UML fallo.",
        "Generating UML diagram with trained model...": "Generando diagrama UML con el modelo entrenado...",
        "Please enter a system description or attach an SRS/document file first.": "Ingresa una descripcion del sistema o adjunta primero un archivo SRS/documento.",
        "Unable to generate UML diagram.": "No se pudo generar el diagrama UML.",
        "UML generation failed.": "La generacion UML fallo."
        ,"No saved activity yet. Generate an SRS, UML diagram, or analysis to see it here.": "Aun no hay actividad guardada. Genera un SRS, un diagrama UML o un analisis para verlo aqui.",
        "Generating SRS with trained model...": "Generando SRS con el modelo entrenado...",
        "Signup": "Registro",
        "SRS Generation": "Generacion SRS",
        "SRS Analysis": "Analisis SRS",
        "UML Generation": "Generacion UML",
        "AIRA Activity": "Actividad AIRA"
    },
    fr: {
        "Requirement Review": "Revue des exigences",
        "SRS Ambiguity Checker": "Analyseur d'ambiguite SRS",
        "Upload an SRS document. The system will analyze the requirements\n                and identify ambiguous or unclear statements using AI.": "Importez un document SRS. Le systeme analysera les exigences et identifiera les phrases ambigues ou peu claires avec l'IA.",
        "Upload SRS Document": "Importer un document SRS",
        "Optional: paste SRS text here if you do not want to upload a file...": "Facultatif : collez le texte SRS ici si vous ne voulez pas importer de fichier...",
        "Attach SRS File": "Joindre un fichier SRS",
        "Supported formats: PDF, DOC, DOCX, TXT": "Formats pris en charge : PDF, DOC, DOCX, TXT",
        "Check Ambiguity": "Verifier l'ambiguite",
        "Ambiguity Analysis Preview": "Apercu de l'analyse d'ambiguite",
        "Diagram Workspace": "Espace de diagrammes",
        "Provide your system description or upload an SRS document.\n                AIRA will generate UML diagram output and let you refine it visually.": "Fournissez la description de votre systeme ou importez un document SRS. AIRA generera un diagramme UML et vous permettra de l'affiner visuellement.",
        "Select UML Diagram Type": "Selectionner le type de diagramme UML",
        "Use Case Diagram": "Diagramme de cas d'utilisation",
        "Class Diagram": "Diagramme de classes",
        "Sequence Diagram": "Diagramme de sequence",
        "ERD Diagram": "Diagramme ERD",
        "Activity Diagram": "Diagramme d'activite",
        "System Description or Upload File": "Description du systeme ou fichier",
        "Write your system description, workflow, or modeling request here...": "Ecrivez ici la description du systeme, le flux de travail ou la demande de modelisation...",
        "Attach File": "Joindre un fichier",
        "Generated UML Preview": "Apercu du UML genere",
        "Edit Diagram": "Modifier le diagramme",
        "Visual Interpretation": "Interpretation visuelle",
        "Upload a UML diagram image. The system will analyze the diagram\n                and generate a detailed textual description.": "Importez une image de diagramme UML. Le systeme analysera le diagramme et generera une description textuelle detaillee.",
        "Upload UML Diagram Image": "Importer une image de diagramme UML",
        "Attach Image": "Joindre une image",
        "Supported formats: PNG, JPG, JPEG": "Formats pris en charge : PNG, JPG, JPEG",
        "Analyze UML Image": "Analyser l'image UML",
        "Generated Description Preview": "Apercu de la description generee",
        "The UML image description will appear here.": "La description de l'image UML apparaitra ici.",
        "User Guide": "Guide utilisateur",
        "How to Use AIRA": "Comment utiliser AIRA",
        "Use these steps when you are new to the system.": "Suivez ces etapes si vous decouvrez le systeme.",
        "Create or login to your account": "Creez un compte ou connectez-vous",
        "Signup first, then login so AIRA can save your generated work in My History.": "Inscrivez-vous d'abord, puis connectez-vous pour qu'AIRA enregistre votre travail dans Mon historique.",
        "Open Generate SRS, enter a project title and idea, or upload a source file, then generate the document.": "Ouvrez Generer SRS, saisissez le titre et l'idee du projet, ou importez un fichier source, puis genereez le document.",
        "Open Generate UML, describe your system, choose a diagram type, then edit the diagram if needed.": "Ouvrez Generer UML, decrivez votre systeme, choisissez un type de diagramme, puis modifiez-le si necessaire.",
        "Check SRS quality": "Verifier la qualite du SRS",
        "Open AI Analysis, paste or upload SRS text, and review ambiguity or improvement suggestions.": "Ouvrez Analyse IA, collez ou importez le texte SRS, puis examinez les ambiguities ou suggestions d'amelioration.",
        "Describe UML images": "Decrire les images UML",
        "Open UML Image Description, upload a UML image, and AIRA will extract and explain the diagram.": "Ouvrez Description d'image UML, importez une image UML, et AIRA extraira puis expliquera le diagramme.",
        "Reuse saved work": "Reutiliser le travail enregistre",
        "Open My History to view previous activity and reuse generated content in another tool.": "Ouvrez Mon historique pour voir l'activite precedente et reutiliser le contenu genere dans un autre outil.",
        "Files and Exports": "Fichiers et exportations",
        "PDF / DOC": "PDF / DOC",
        "PNG / PDF": "PNG / PDF",
        "General": "General",
        "Select": "Selectionner",
        "Delete": "Supprimer",
        "Connector": "Connecteur",
        "Text": "Texte",
        "Note": "Note",
        "Frame": "Cadre",
        "Actor": "Acteur",
        "Boundary": "Limite",
        "Include": "Inclure",
        "Extend": "Etendre",
        "Package": "Paquet",
        "Association": "Association",
        "Dependency": "Dependance",
        "Inheritance": "Heritage",
        "Aggregation": "Agregation",
        "Composition": "Composition",
        "Lifeline": "Ligne de vie",
        "Activation": "Activation",
        "Message": "Message",
        "Return": "Retour",
        "Start": "Debut",
        "Action": "Action",
        "Decision": "Decision",
        "Merge": "Fusion",
        "Object": "Objet",
        "Entity": "Entite",
        "Table": "Table",
        "Attribute": "Attribut",
        "Relationship": "Relation",
        "Duplicate": "Dupliquer",
        "Bring to Front": "Mettre au premier plan"
        ,"Checking ambiguity with trained model...": "Verification de l'ambiguite avec le modele entraine...",
        "Please paste SRS text or attach an SRS file first.": "Collez du texte SRS ou joignez d'abord un fichier SRS.",
        "Unable to check ambiguity.": "Impossible de verifier l'ambiguite.",
        "Ambiguity checking failed.": "La verification de l'ambiguite a echoue.",
        "No complete requirements were detected in the provided text.": "Aucune exigence complete n'a ete detectee dans le texte fourni.",
        "Total Requirements:": "Exigences totales :",
        "Ambiguous:": "Ambigues :",
        "Clear:": "Claires :",
        "Please attach a UML diagram image first.": "Veuillez d'abord joindre une image de diagramme UML.",
        "Reading UML image and generating description...": "Lecture de l'image UML et generation de la description...",
        "Unable to analyze UML image.": "Impossible d'analyser l'image UML.",
        "Summary:": "Resume :",
        "UML image processed successfully.": "Image UML traitee avec succes.",
        "Description": "Description",
        "No diagram details were detected.": "Aucun detail du diagramme n'a ete detecte.",
        "View Extracted Text": "Voir le texte extrait",
        "UML image analysis failed.": "L'analyse de l'image UML a echoue.",
        "Generating UML diagram with trained model...": "Generation du diagramme UML avec le modele entraine...",
        "Please enter a system description or attach an SRS/document file first.": "Saisissez une description du systeme ou joignez d'abord un fichier SRS/document.",
        "Unable to generate UML diagram.": "Impossible de generer le diagramme UML.",
        "UML generation failed.": "La generation UML a echoue."
        ,"No saved activity yet. Generate an SRS, UML diagram, or analysis to see it here.": "Aucune activite enregistree pour le moment. Generez un SRS, un diagramme UML ou une analyse pour l'afficher ici.",
        "Generating SRS with trained model...": "Generation du SRS avec le modele entraine...",
        "Signup": "Inscription",
        "SRS Generation": "Generation SRS",
        "SRS Analysis": "Analyse SRS",
        "UML Generation": "Generation UML",
        "AIRA Activity": "Activite AIRA"
    },
    de: {
        "Requirement Review": "Anforderungspruefung",
        "SRS Ambiguity Checker": "SRS-Mehrdeutigkeitspruefung",
        "Upload an SRS document. The system will analyze the requirements\n                and identify ambiguous or unclear statements using AI.": "Laden Sie ein SRS-Dokument hoch. Das System analysiert die Anforderungen und erkennt mehrdeutige oder unklare Aussagen mit KI.",
        "Upload SRS Document": "SRS-Dokument hochladen",
        "Optional: paste SRS text here if you do not want to upload a file...": "Optional: Fuegen Sie hier SRS-Text ein, wenn Sie keine Datei hochladen moechten...",
        "Attach SRS File": "SRS-Datei anhaengen",
        "Supported formats: PDF, DOC, DOCX, TXT": "Unterstuetzte Formate: PDF, DOC, DOCX, TXT",
        "Check Ambiguity": "Mehrdeutigkeit pruefen",
        "Ambiguity Analysis Preview": "Vorschau der Mehrdeutigkeitsanalyse",
        "Diagram Workspace": "Diagramm-Arbeitsbereich",
        "Provide your system description or upload an SRS document.\n                AIRA will generate UML diagram output and let you refine it visually.": "Geben Sie Ihre Systembeschreibung ein oder laden Sie ein SRS-Dokument hoch. AIRA erstellt ein UML-Diagramm und laesst es visuell verfeinern.",
        "Select UML Diagram Type": "UML-Diagrammtyp auswaehlen",
        "Use Case Diagram": "Anwendungsfalldiagramm",
        "Class Diagram": "Klassendiagramm",
        "Sequence Diagram": "Sequenzdiagramm",
        "ERD Diagram": "ERD-Diagramm",
        "Activity Diagram": "Aktivitaetsdiagramm",
        "System Description or Upload File": "Systembeschreibung oder Datei",
        "Write your system description, workflow, or modeling request here...": "Schreiben Sie hier Ihre Systembeschreibung, Ihren Ablauf oder Modellierungswunsch...",
        "Attach File": "Datei anhaengen",
        "Generated UML Preview": "Vorschau des erstellten UML",
        "Edit Diagram": "Diagramm bearbeiten",
        "Visual Interpretation": "Visuelle Interpretation",
        "Upload a UML diagram image. The system will analyze the diagram\n                and generate a detailed textual description.": "Laden Sie ein UML-Diagrammbild hoch. Das System analysiert das Diagramm und erstellt eine detaillierte Textbeschreibung.",
        "Upload UML Diagram Image": "UML-Diagrammbild hochladen",
        "Attach Image": "Bild anhaengen",
        "Supported formats: PNG, JPG, JPEG": "Unterstuetzte Formate: PNG, JPG, JPEG",
        "Analyze UML Image": "UML-Bild analysieren",
        "Generated Description Preview": "Vorschau der erstellten Beschreibung",
        "The UML image description will appear here.": "Die UML-Bildbeschreibung wird hier angezeigt.",
        "User Guide": "Benutzerhandbuch",
        "How to Use AIRA": "So verwenden Sie AIRA",
        "Use these steps when you are new to the system.": "Verwenden Sie diese Schritte, wenn Sie neu im System sind.",
        "Create or login to your account": "Konto erstellen oder anmelden",
        "Signup first, then login so AIRA can save your generated work in My History.": "Registrieren Sie sich zuerst und melden Sie sich dann an, damit AIRA Ihre Arbeit im Verlauf speichern kann.",
        "Open Generate SRS, enter a project title and idea, or upload a source file, then generate the document.": "Oeffnen Sie SRS erstellen, geben Sie Projekttitel und Idee ein oder laden Sie eine Quelldatei hoch, und erstellen Sie dann das Dokument.",
        "Open Generate UML, describe your system, choose a diagram type, then edit the diagram if needed.": "Oeffnen Sie UML erstellen, beschreiben Sie Ihr System, waehlen Sie einen Diagrammtyp und bearbeiten Sie das Diagramm bei Bedarf.",
        "Check SRS quality": "SRS-Qualitaet pruefen",
        "Open AI Analysis, paste or upload SRS text, and review ambiguity or improvement suggestions.": "Oeffnen Sie KI-Analyse, fuegen Sie SRS-Text ein oder laden Sie ihn hoch, und pruefen Sie Mehrdeutigkeiten oder Verbesserungsvorschlaege.",
        "Describe UML images": "UML-Bilder beschreiben",
        "Open UML Image Description, upload a UML image, and AIRA will extract and explain the diagram.": "Oeffnen Sie UML-Bildbeschreibung, laden Sie ein UML-Bild hoch, und AIRA extrahiert und erklaert das Diagramm.",
        "Reuse saved work": "Gespeicherte Arbeit wiederverwenden",
        "Open My History to view previous activity and reuse generated content in another tool.": "Oeffnen Sie Mein Verlauf, um fruehere Aktivitaeten anzusehen und generierte Inhalte wiederzuverwenden.",
        "Files and Exports": "Dateien und Exporte",
        "PDF / DOC": "PDF / DOC",
        "PNG / PDF": "PNG / PDF",
        "General": "Allgemein",
        "Select": "Auswaehlen",
        "Delete": "Loeschen",
        "Connector": "Verbinder",
        "Text": "Text",
        "Note": "Notiz",
        "Frame": "Rahmen",
        "Actor": "Akteur",
        "Boundary": "Grenze",
        "Include": "Einbeziehen",
        "Extend": "Erweitern",
        "Package": "Paket",
        "Association": "Assoziation",
        "Dependency": "Abhaengigkeit",
        "Inheritance": "Vererbung",
        "Aggregation": "Aggregation",
        "Composition": "Komposition",
        "Lifeline": "Lebenslinie",
        "Activation": "Aktivierung",
        "Message": "Nachricht",
        "Return": "Rueckgabe",
        "Start": "Start",
        "Action": "Aktion",
        "Decision": "Entscheidung",
        "Merge": "Zusammenfuehren",
        "Object": "Objekt",
        "Entity": "Entitaet",
        "Table": "Tabelle",
        "Attribute": "Attribut",
        "Relationship": "Beziehung",
        "Duplicate": "Duplizieren",
        "Bring to Front": "In den Vordergrund"
        ,"Checking ambiguity with trained model...": "Mehrdeutigkeit wird mit dem trainierten Modell geprueft...",
        "Please paste SRS text or attach an SRS file first.": "Fuegen Sie zuerst SRS-Text ein oder haengen Sie eine SRS-Datei an.",
        "Unable to check ambiguity.": "Mehrdeutigkeit konnte nicht geprueft werden.",
        "Ambiguity checking failed.": "Mehrdeutigkeitspruefung fehlgeschlagen.",
        "No complete requirements were detected in the provided text.": "Im bereitgestellten Text wurden keine vollstaendigen Anforderungen erkannt.",
        "Total Requirements:": "Anforderungen insgesamt:",
        "Ambiguous:": "Mehrdeutig:",
        "Clear:": "Klar:",
        "Please attach a UML diagram image first.": "Haengen Sie zuerst ein UML-Diagrammbild an.",
        "Reading UML image and generating description...": "UML-Bild wird gelesen und Beschreibung erstellt...",
        "Unable to analyze UML image.": "UML-Bild konnte nicht analysiert werden.",
        "Summary:": "Zusammenfassung:",
        "UML image processed successfully.": "UML-Bild erfolgreich verarbeitet.",
        "Description": "Beschreibung",
        "No diagram details were detected.": "Es wurden keine Diagrammdetails erkannt.",
        "View Extracted Text": "Extrahierten Text anzeigen",
        "UML image analysis failed.": "UML-Bildanalyse fehlgeschlagen.",
        "Generating UML diagram with trained model...": "UML-Diagramm wird mit dem trainierten Modell erstellt...",
        "Please enter a system description or attach an SRS/document file first.": "Geben Sie zuerst eine Systembeschreibung ein oder haengen Sie eine SRS-/Dokumentdatei an.",
        "Unable to generate UML diagram.": "UML-Diagramm konnte nicht erstellt werden.",
        "UML generation failed.": "UML-Erstellung fehlgeschlagen."
        ,"No saved activity yet. Generate an SRS, UML diagram, or analysis to see it here.": "Noch keine gespeicherte Aktivitaet. Erstellen Sie ein SRS, ein UML-Diagramm oder eine Analyse, um sie hier zu sehen.",
        "Generating SRS with trained model...": "SRS wird mit dem trainierten Modell erstellt...",
        "Signup": "Registrierung",
        "SRS Generation": "SRS-Erstellung",
        "SRS Analysis": "SRS-Analyse",
        "UML Generation": "UML-Erstellung",
        "UML Image Description": "UML-Bildbeschreibung",
        "AIRA Activity": "AIRA-Aktivitaet"
    },
    ur: {
        "Welcome Back": "خوش آمدید",
        "Login to continue working on your requirements and diagrams.": "اپنے تقاضوں اور ڈایاگرامز پر کام جاری رکھنے کے لیے لاگ اِن کریں۔",
        "Email Address": "ای میل ایڈریس",
        "Password": "پاس ورڈ",
        "Login": "لاگ اِن",
        "Create Account": "اکاؤنٹ بنائیں",
        "Create Your Account": "اپنا اکاؤنٹ بنائیں",
        "Register to access AIRA features and keep your work organized.": "AIRA فیچرز استعمال کرنے اور اپنا کام منظم رکھنے کے لیے رجسٹر کریں۔",
        "Full Name": "پورا نام",
        "Confirm Password": "پاس ورڈ کی تصدیق",
        "Sign Up": "سائن اَپ",
        "Generate Software Requirement Specification": "سافٹ ویئر تقاضوں کی تفصیل بنائیں",
        "Project Title": "پروجیکٹ عنوان",
        "Project Idea": "پروجیکٹ آئیڈیا",
        "Upload Source File": "سورس فائل اپ لوڈ کریں",
        "Upload File": "فائل اپ لوڈ کریں",
        "Advanced details": "ایڈوانس تفصیلات",
        "Project Domain": "پروجیکٹ ڈومین",
        "Output Detail Level": "آؤٹ پٹ تفصیل کی سطح",
        "Main Users / Actors": "مرکزی صارفین / ایکٹرز",
        "Main Features": "مرکزی فیچرز",
        "Data Managed": "منظم ڈیٹا",
        "Generate SRS": "SRS بنائیں",
        "Generated SRS Preview": "بنائے گئے SRS کا پری ویو",
        "Edit": "ترمیم",
        "Download": "ڈاؤن لوڈ",
        "Generate UML Diagram": "UML ڈایاگرام بنائیں",
        "Check SRS Ambiguity": "SRS ابہام چیک کریں",
        "Saved Activity": "محفوظ سرگرمی",
        "My History": "میری ہسٹری",
        "View and reuse your previously generated SRS, UML diagrams, and AI analysis results.": "اپنے پہلے بنائے گئے SRS، UML ڈایاگرامز، اور AI تجزیہ نتائج دیکھیں اور دوبارہ استعمال کریں۔",
        "Enter your email": "اپنی ای میل درج کریں",
        "Enter your password": "اپنا پاس ورڈ درج کریں",
        "Enter your full name": "اپنا پورا نام درج کریں",
        "Create a password": "پاس ورڈ بنائیں",
        "Confirm your password": "اپنے پاس ورڈ کی تصدیق کریں",
        "Requirement Review": "تقاضوں کا جائزہ",
        "SRS Ambiguity Checker": "SRS ابہام چیکر",
        "Upload an SRS document. The system will analyze the requirements\n                and identify ambiguous or unclear statements using AI.": "SRS دستاویز اپ لوڈ کریں۔ سسٹم تقاضوں کا تجزیہ کرے گا اور AI کے ذریعے مبہم یا غیر واضح بیانات شناخت کرے گا۔",
        "Upload SRS Document": "SRS دستاویز اپ لوڈ کریں",
        "Optional: paste SRS text here if you do not want to upload a file...": "اختیاری: اگر فائل اپ لوڈ نہیں کرنی تو SRS متن یہاں پیسٹ کریں...",
        "Attach SRS File": "SRS فائل منسلک کریں",
        "Supported formats: PDF, DOC, DOCX, TXT": "سپورٹڈ فارمیٹس: PDF, DOC, DOCX, TXT",
        "Check Ambiguity": "ابہام چیک کریں",
        "Ambiguity Analysis Preview": "ابہام تجزیہ پری ویو",
        "Diagram Workspace": "ڈایاگرام ورک اسپیس",
        "Provide your system description or upload an SRS document.\n                AIRA will generate UML diagram output and let you refine it visually.": "اپنے سسٹم کی تفصیل دیں یا SRS دستاویز اپ لوڈ کریں۔ AIRA UML ڈایاگرام بنائے گا اور آپ اسے بصری طور پر بہتر کر سکیں گے۔",
        "Select UML Diagram Type": "UML ڈایاگرام قسم منتخب کریں",
        "Use Case Diagram": "یوز کیس ڈایاگرام",
        "Class Diagram": "کلاس ڈایاگرام",
        "Sequence Diagram": "سیکوئنس ڈایاگرام",
        "ERD Diagram": "ERD ڈایاگرام",
        "Activity Diagram": "ایکٹیویٹی ڈایاگرام",
        "System Description or Upload File": "سسٹم کی تفصیل یا فائل اپ لوڈ",
        "Write your system description, workflow, or modeling request here...": "اپنے سسٹم کی تفصیل، ورک فلو، یا ماڈلنگ درخواست یہاں لکھیں...",
        "Attach File": "فائل منسلک کریں",
        "Attach Diagram to Edit": "ترمیم کے لیے ڈایاگرام منسلک کریں",
        "Open Editor": "ایڈیٹر کھولیں",
        "Generated UML Preview": "بنائے گئے UML کا پری ویو",
        "Edit Diagram": "ڈایاگرام میں ترمیم",
        "Visual Interpretation": "بصری تشریح",
        "Upload a UML diagram image. The system will analyze the diagram\n                and generate a detailed textual description.": "UML ڈایاگرام تصویر اپ لوڈ کریں۔ سسٹم ڈایاگرام کا تجزیہ کر کے تفصیلی متن وضاحت بنائے گا۔",
        "Upload UML Diagram Image": "UML ڈایاگرام تصویر اپ لوڈ کریں",
        "Attach Image": "تصویر منسلک کریں",
        "Supported formats: PNG, JPG, JPEG": "سپورٹڈ فارمیٹس: PNG, JPG, JPEG",
        "Analyze UML Image": "UML تصویر کا تجزیہ کریں",
        "Generated Description Preview": "بنائی گئی وضاحت کا پری ویو",
        "The UML image description will appear here.": "UML تصویر کی وضاحت یہاں ظاہر ہوگی۔",
        "User Guide": "یوزر گائیڈ",
        "How to Use AIRA": "AIRA استعمال کرنے کا طریقہ",
        "Use these steps when you are new to the system.": "اگر آپ سسٹم میں نئے ہیں تو یہ مراحل استعمال کریں۔",
        "Create or login to your account": "اکاؤنٹ بنائیں یا لاگ اِن کریں",
        "Signup first, then login so AIRA can save your generated work in My History.": "پہلے سائن اَپ کریں، پھر لاگ اِن کریں تاکہ AIRA آپ کا بنایا ہوا کام میری ہسٹری میں محفوظ کر سکے۔",
        "Open Generate SRS, enter a project title and idea, or upload a source file, then generate the document.": "Generate SRS کھولیں، پروجیکٹ عنوان اور آئیڈیا درج کریں یا سورس فائل اپ لوڈ کریں، پھر دستاویز بنائیں۔",
        "Open Generate UML, describe your system, choose a diagram type, then edit the diagram if needed.": "Generate UML کھولیں، سسٹم کی تفصیل دیں، ڈایاگرام قسم منتخب کریں، پھر ضرورت ہو تو ڈایاگرام میں ترمیم کریں۔",
        "Check SRS quality": "SRS معیار چیک کریں",
        "Open AI Analysis, paste or upload SRS text, and review ambiguity or improvement suggestions.": "AI Analysis کھولیں، SRS متن پیسٹ یا اپ لوڈ کریں، اور ابہام یا بہتری کی تجاویز دیکھیں۔",
        "Describe UML images": "UML تصاویر کی وضاحت کریں",
        "Open UML Image Description, upload a UML image, and AIRA will extract and explain the diagram.": "UML Image Description کھولیں، UML تصویر اپ لوڈ کریں، اور AIRA ڈایاگرام نکال کر سمجھائے گا۔",
        "Reuse saved work": "محفوظ کام دوبارہ استعمال کریں",
        "Open My History to view previous activity and reuse generated content in another tool.": "پچھلی سرگرمی دیکھنے اور بنایا گیا مواد دوبارہ استعمال کرنے کے لیے My History کھولیں۔",
        "Files and Exports": "فائلز اور ایکسپورٹس",
        "PDF / DOC": "PDF / DOC",
        "PNG / PDF": "PNG / PDF",
        "General": "جنرل",
        "Select": "منتخب",
        "Delete": "حذف کریں",
        "Connector": "کنیکٹر",
        "Text": "متن",
        "Note": "نوٹ",
        "Frame": "فریم",
        "Actor": "ایکٹر",
        "Boundary": "باؤنڈری",
        "Include": "انکلوڈ",
        "Extend": "ایکسٹینڈ",
        "Package": "پیکیج",
        "Association": "ایسوسی ایشن",
        "Dependency": "ڈیپنڈنسی",
        "Inheritance": "انہیریٹنس",
        "Aggregation": "ایگریگیشن",
        "Composition": "کمپوزیشن",
        "Lifeline": "لائف لائن",
        "Activation": "ایکٹیویشن",
        "Message": "پیغام",
        "Return": "واپسی",
        "Start": "شروع",
        "Action": "عمل",
        "Decision": "فیصلہ",
        "Merge": "مرج",
        "Object": "آبجیکٹ",
        "Entity": "اینٹٹی",
        "Table": "ٹیبل",
        "Attribute": "ایٹریبیوٹ",
        "Relationship": "رشتہ",
        "Duplicate": "نقل بنائیں",
        "Bring to Front": "آگے لائیں",
        "Checking ambiguity with trained model...": "ٹرینڈ ماڈل سے ابہام چیک کیا جا رہا ہے...",
        "Please paste SRS text or attach an SRS file first.": "پہلے SRS متن پیسٹ کریں یا SRS فائل منسلک کریں۔",
        "Unable to check ambiguity.": "ابہام چیک نہیں ہو سکا۔",
        "Ambiguity checking failed.": "ابہام چیکنگ ناکام ہو گئی۔",
        "No complete requirements were detected in the provided text.": "دیے گئے متن میں مکمل تقاضے نہیں ملے۔",
        "Total Requirements:": "کل تقاضے:",
        "Ambiguous:": "مبہم:",
        "Clear:": "واضح:",
        "Please attach a UML diagram image first.": "پہلے UML ڈایاگرام تصویر منسلک کریں۔",
        "Reading UML image and generating description...": "UML تصویر پڑھی جا رہی ہے اور وضاحت بن رہی ہے...",
        "Unable to analyze UML image.": "UML تصویر کا تجزیہ نہیں ہو سکا۔",
        "Summary:": "خلاصہ:",
        "UML image processed successfully.": "UML تصویر کامیابی سے پروسیس ہو گئی۔",
        "Description": "وضاحت",
        "No diagram details were detected.": "ڈایاگرام کی تفصیلات نہیں ملیں۔",
        "View Extracted Text": "نکالا گیا متن دیکھیں",
        "UML image analysis failed.": "UML تصویر تجزیہ ناکام ہو گیا۔",
        "Generating UML diagram with trained model...": "ٹرینڈ ماڈل سے UML ڈایاگرام بنایا جا رہا ہے...",
        "Please enter a system description or attach an SRS/document file first.": "پہلے سسٹم کی تفصیل درج کریں یا SRS/دستاویز فائل منسلک کریں۔",
        "Unable to generate UML diagram.": "UML ڈایاگرام نہیں بن سکا۔",
        "UML generation failed.": "UML جنریشن ناکام ہو گئی۔",
        "No saved activity yet. Generate an SRS, UML diagram, or analysis to see it here.": "ابھی کوئی محفوظ سرگرمی نہیں۔ اسے یہاں دیکھنے کے لیے SRS، UML ڈایاگرام، یا تجزیہ بنائیں۔",
        "Generating SRS with trained model...": "ٹرینڈ ماڈل سے SRS بنایا جا رہا ہے...",
        "Signup": "سائن اَپ",
        "SRS Generation": "SRS جنریشن",
        "SRS Analysis": "SRS تجزیہ",
        "UML Generation": "UML جنریشن",
        "UML Image Description": "UML تصویر کی وضاحت",
        "AIRA Activity": "AIRA سرگرمی"
    }
};

Object.keys(AIRA_COMMON_EXTRA).forEach(language => {
    AIRA_COMMON_PHRASES[language] = {
        ...(AIRA_COMMON_PHRASES[language] || {}),
        ...AIRA_COMMON_EXTRA[language]
    };
});

function localizeCommonPhrases(language) {
    const translatePhrase = value => translateCommonPhrase(value, language);

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
        const parent = node.parentElement;
        if (!parent || parent.closest("script, style, [data-i18n], .page-home")) return;
        const text = node.nodeValue.trim();
        if (!text) return;
        if (!originalTextNodes.has(node)) originalTextNodes.set(node, text);
        const original = originalTextNodes.get(node);
        const translated = translatePhrase(original);
        node.nodeValue = node.nodeValue.replace(text, translated);
    });

    document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach(node => {
        if (node.dataset.i18nPlaceholder) return;
        if (!node.dataset.originalPlaceholder) node.dataset.originalPlaceholder = node.getAttribute("placeholder") || "";
        node.setAttribute("placeholder", translatePhrase(node.dataset.originalPlaceholder));
    });
}

function uiPhrase(text, language = getSavedSettings().language || "en") {
    return translateCommonPhrase(text, language);
}

function translateCommonPhrase(text, language = getSavedSettings().language || "en") {
    const dictionary = AIRA_COMMON_PHRASES[language];
    if (!dictionary) return text;
    if (dictionary[text]) return dictionary[text];
    const normalized = normalizePhrase(text);
    const match = Object.keys(dictionary).find(key => normalizePhrase(key) === normalized);
    return match ? dictionary[match] : text;
}

function normalizePhrase(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function renderHistoryItems(items) {
    const historyList = document.getElementById("historyList");
    if (!historyList) return;
    historyList.innerHTML = "";

    if (!items.length) {
        historyList.innerHTML = `<div class="history-empty">${escapeHTML(uiPhrase("No saved activity yet. Generate an SRS, UML diagram, or analysis to see it here."))}</div>`;
        return;
    }

    items.forEach(item => {
        const div = document.createElement("div");
        div.className = "history-item";
        const canReuse = true;
        div.innerHTML = `
          <div class="history-header">
            <span class="history-type">${escapeHTML(formatActivityType(item.activity_type))}</span>
            <span class="history-date">${escapeHTML(formatHistoryDate(item.created_at))}</span>
          </div>
          <div class="history-prompt">${escapeHTML(item.project_title || item.title || "AIRA Activity")}</div>
          <p class="history-description">${escapeHTML(item.description || "")}</p>
          <div class="history-actions"></div>`;

        if (canReuse) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Reuse";
            button.addEventListener("click", () => reuseHistoryItem(item));
            div.querySelector(".history-actions")?.appendChild(button);
        }
        historyList.appendChild(div);
    });
}

function reuseHistoryItem(item) {
    const payload = {
        activity_type: item.activity_type,
        title: item.title || "",
        project_title: item.project_title || item.title || "",
        reusable_text: item.reusable_text || item.description || item.project_title || item.title || "",
        saved_output: item.saved_output || ""
    };
    localStorage.setItem("aira_reuse_payload", JSON.stringify(payload));
    window.location.href = getReuseTargetPage(item.activity_type);
}

function getReuseTargetPage(activityType) {
    if (activityType === "srs_generation") return "generate-srs.html";
    if (activityType === "srs_analysis") return "check-srs.html";
    if (activityType === "uml_image_description") return "upload-uml.html";
    return "generate-uml.html";
}

function formatActivityType(type) {
    const labels = {
        login: uiPhrase("Login"),
        signup: uiPhrase("Signup"),
        srs_generation: uiPhrase("SRS Generation"),
        srs_analysis: uiPhrase("SRS Analysis"),
        uml_generation: uiPhrase("UML Generation"),
        uml_image_description: uiPhrase("UML Image Description"),
        edit: uiPhrase("Edit"),
        download: uiPhrase("Download")
    };
    return labels[type] || uiPhrase("AIRA Activity");
}

function formatHistoryDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
}

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("srsAnalysisModeBtn")) setAnalysisMode("srs");

    // UML Image Description
    attachPreview({
        fileInputId: "umlImageUpload",
        previewId: "inlineImagePreview"
    });
    initializeUmlClipboardPaste();

    // Generate UML (fileUpload)
    attachPreview({
        fileInputId: "fileUpload",
        previewId: "umlInlinePreview"
    });
    document.getElementById("fileUpload")?.addEventListener("change", handleUmlSourceFileChange);

    // SRS page
    attachPreview({
        fileInputId: "srsFile",
        previewId: "srsInlinePreview"
    });

    attachPreview({
        fileInputId: "generateSrsFiles",
        previewId: "generateSrsFilesPreview"
    });
    wireSrsUmlTitleInference();

    enhanceDiagramToolbar();
});

function resetGeneratedUmlResult() {
    const out = document.getElementById("umlOutputBox");
    const content = document.getElementById("umlOutputContent");
    const editor = document.getElementById("diagramEditor");
    const svg = document.getElementById("diagramConnectors");

    if (out) out.style.display = "none";
    if (content) {
        content.style.display = "none";
        content.innerHTML = "";
    }
    if (editor && svg) clearDiagramCanvas(editor, svg);
    lastGeneratedUmlDiagram = null;
    lastGeneratedUmlType = "usecase";
    clearProfessionalPlantUmlPreview();
}

function openUmlSourceFilePicker() {
    const input = document.getElementById("fileUpload");
    if (!input) return;

    // Generate UML accepts exactly one source document. Clearing the native
    // selection first guarantees the next choice replaces the previous file.
    input.value = "";
    fileSelectionRegistry.fileUpload = [];
    const preview = document.getElementById("umlInlinePreview");
    if (preview) {
        preview.innerHTML = "";
        preview.style.display = "none";
        preview.classList.remove("multi-file-preview");
    }
    resetGeneratedUmlResult();
    input.click();
}

function openDiagramEditorFilePicker() {
    const input = document.getElementById("diagramEditAttach");
    if (!input) return;
    input.value = "";
    input.click();
}

async function handleUmlSourceFileChange(event) {
    const file = event?.target?.files?.[0];
    resetGeneratedUmlResult();
    if (!file) {
        attachedUmlSourceDiagram = null;
        return;
    }

    if (isUmlDiagramReferenceFile(file)) {
        await attachDiagramImageForGeneration(file);
        return;
    }

    attachedUmlSourceDiagram = null;
}

function isUmlDiagramReferenceFile(file) {
    if (!file) return false;
    return (
        /\.(airauml|json|png|jpe?g|webp|svg)$/i.test(file.name || "") ||
        String(file.type || "").startsWith("image/")
    );
}

function wireSrsUmlTitleInference() {
    const imageInput = document.getElementById("generateSrsFiles");
    const titleInput = document.getElementById("srsProjectTitle");
    if (!imageInput || !titleInput) return;

    imageInput.addEventListener("change", () => {
        const file = Array.from(imageInput.files || []).find(item => item.type.startsWith("image/"));
        if (!file) {
            if (titleInput.value.trim() === lastAutoSrsTitle) titleInput.value = "";
            lastAutoSrsTitle = "";
            return;
        }
        const fallbackTitle = inferTitleFromFileName(file.name);
        titleInput.value = fallbackTitle;
        lastAutoSrsTitle = fallbackTitle;

        if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
            inferTitleFromSvgFile(file).then(title => {
                const nextTitle = title || fallbackTitle;
                titleInput.value = nextTitle;
                lastAutoSrsTitle = nextTitle;
            });
            return;
        }

        inferTitleFromUmlImageFile(file).then(title => {
            if (title && (!titleInput.value.trim() || titleInput.value.trim() === fallbackTitle || titleInput.value.trim() === lastAutoSrsTitle)) {
                titleInput.value = title;
                lastAutoSrsTitle = title;
            }
        }).catch(() => {});
    });
}

function inferTitleFromSvgFile(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result || "");
            const titleMatch = text.match(/<title[^>]*>(.*?)<\/title>/i);
            if (titleMatch?.[1]) {
                resolve(cleanInferredTitle(titleMatch[1]));
                return;
            }

            const textMatch = text.match(/<text[^>]*>(.*?)<\/text>/i);
            resolve(textMatch?.[1] ? cleanInferredTitle(textMatch[1]) : "");
        };
        reader.onerror = () => resolve("");
        reader.readAsText(file);
    });
}

function inferTitleFromUmlImageFile(file) {
    return fileToDataUrl(file)
        .then(imageData => fetch(`${AIRA_API_BASE}/api/uml-image-title`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                imageData,
                fileName: file.name,
                mimeType: file.type
            })
        }))
        .then(response => response.ok ? response.json() : null)
        .then(result => {
            const title = String(result?.title || "").trim();
            return title ? cleanInferredTitle(title) : "";
        });
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function inferTitleFromFileName(fileName) {
    const baseTitle = String(fileName || "")
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const cleanedTitle = baseTitle
        .replace(/\b(uml|diagram)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

    return cleanInferredTitle(cleanedTitle || baseTitle);
}

function isGenericDiagramTitle(value) {
    return /^(activity|activity diagram|class|class diagram|sequence|sequence diagram|use case|use case diagram|erd|er diagram|uml|uml diagram|diagram|image|flowchart)$/i
        .test(String(value || "").trim());
}

function cleanInferredTitle(value) {
    const title = toTitleCase(correctCommonTypos(String(value || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\b[jil]\b$/i, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80)));
    return title && !isGenericDiagramTitle(title) ? title : "";
}

/* ================= BUTTON-ONLY DUMMY OUTPUTS ================= */
async function generateSRSPreview() {
    let title = document.getElementById("srsProjectTitle")?.value?.trim();
    const detail = document.getElementById("srsDetailLevel")?.value?.trim();
    const actors = document.getElementById("srsActors")?.value?.trim();
    const dataManaged = document.getElementById("srsDataManaged")?.value?.trim();
    const notes = document.getElementById("srsPromptInput")?.value?.trim();
    const uploadedFiles = Array.from(document.getElementById("generateSrsFiles")?.files || []);
    const referenceFile = uploadedFiles.find(file => !file.type.startsWith("image/"));
    const umlImageFile = uploadedFiles.find(file => file.type.startsWith("image/"));
    const titleInput = document.getElementById("srsProjectTitle");
    if (!title && titleInput) {
        title = inferSrsTitleFromBrief(notes);
        titleInput.value = title;
    }
    if (!title && umlImageFile && titleInput) {
        title = inferTitleFromFileName(umlImageFile.name);
        titleInput.value = title;
    }
    const features = Array.from(document.querySelectorAll("#srsFeatureChips input:checked"))
        .map(input => input.value);
    const out = document.getElementById("srsOutputBox");
    const content = document.getElementById("srsOutputContent");

    if (out && content) {
        out.style.display = "block";
        document.body.classList.add("srs-generation-active");
        updateSrsRibbonDockState();
        content.innerHTML = `<div class="generation-status">${escapeHTML(uiPhrase("Generating SRS with trained model..."))}</div>`;
        out.scrollIntoView({ behavior: "smooth", block: "start" });

        const payload = {
            userId: getCurrentUserId(),
            language: getSrsLanguagePreference(),
            title,
            detail,
            actors,
            dataManaged,
            features,
            notes,
            referenceFileName: referenceFile?.name || "",
            umlImageFileName: umlImageFile?.name || "",
            uploadedFiles: await prepareUploadedFilesForBackend(uploadedFiles)
        };

        try {
            const response = await fetch(`${AIRA_API_BASE}/api/generate-srs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                handleAccessApiError(result, "srs_generation");
                throw new Error(result.error || "Model request failed");
            }

            if (!result.srs_html) {
                throw new Error("The backend did not return a usable SRS document. Please check that the uploaded file contains readable text.");
            }
            content.innerHTML = result.srs_html;
            ensureCompleteSrsTableOfContents(content);
            ensureSrsSystemDiagrams(content);
            await refreshAccessSummary();
        } catch (error) {
            const errorMessage = getSrsGenerationErrorMessage(error);
            content.innerHTML = `
              <div class="generation-status error">
                ${escapeHTML(errorMessage)}
              </div>`;
        }
    }
}

function inferSrsTitleFromBrief(brief) {
    const firstSentence = String(brief || "").split(/[.!?\n]/)[0]
        .replace(/^(build|create|develop|design|make)\s+(an?\s+)?/i, "")
        .replace(/\b(that|which|where|for)\b.*$/i, "")
        .trim();
    if (firstSentence && firstSentence.length <= 80) return toTitleCase(firstSentence);
    return "The Proposed System";
}

const STANDARD_SRS_TOC_ITEMS = [
    "1. Introduction",
    "1.1 Purpose",
    "1.2 Scope",
    "1.3 Intended Audience",
    "1.4 Definitions and Abbreviations",
    "1.5 Document Overview",
    "2. Overall Description",
    "2.1 Product Perspective",
    "2.2 Product Functions",
    "2.3 User Classes and Characteristics",
    "2.4 Operating Environment",
    "2.5 Design and Implementation Constraints",
    "2.6 Assumptions and Dependencies",
    "2.7 System Diagrams",
    "3. System Features",
    "4. Functional Requirements",
    "5. Non-Functional Requirements",
    "6. External Interface Requirements",
    "6.1 User Interface Requirements",
    "6.2 Hardware Interface Requirements",
    "6.3 Software Interface Requirements",
    "6.4 Communication Interface Requirements",
    "7. Data Requirements",
    "8. Security Requirements",
    "9. Performance Requirements",
    "10. Reliability and Availability Requirements",
    "11. Acceptance Criteria",
    "12. Out of Scope",
    "13. Conclusion",
    "14. Appendix"
];

function getStandardSrsTocItems() {
    return [...STANDARD_SRS_TOC_ITEMS];
}

function buildSrsTocSectionHTML(items) {
    const safeItems = (items?.length ? items : getStandardSrsTocItems())
        .map(item => String(item || "").trim())
        .filter(Boolean);
    return `
        <section class="srs-toc">
          <h2>Table of Contents</h2>
          <ol>
            ${safeItems.map(item => `<li class="${/^\d+\.\d+\s+/.test(item) ? "toc-subitem" : "toc-major"}">${escapeHTML(item)}</li>`).join("")}
          </ol>
        </section>`;
}

function getSrsHeadingItemsFromContent(content) {
    return getStandardSrsTocItems();
}

function ensureCompleteSrsTableOfContents(content) {
    if (!content) return;
    const documentRoot = content.querySelector(".srs-document") || content.firstElementChild || content;
    const existingToc = documentRoot.querySelector?.(".srs-toc");
    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildSrsTocSectionHTML(getSrsHeadingItemsFromContent(content));
    const nextToc = wrapper.firstElementChild;
    if (!nextToc) return;

    if (existingToc) {
        existingToc.replaceWith(nextToc);
        return;
    }

    const coverBreak = documentRoot.querySelector?.(".page-break");
    if (coverBreak?.parentNode) {
        coverBreak.insertAdjacentElement("afterend", nextToc);
        return;
    }

    const firstMajorHeading = documentRoot.querySelector?.("h2.major-heading");
    if (firstMajorHeading?.parentNode) {
        const pageBreak = document.createElement("div");
        pageBreak.className = "page-break";
        firstMajorHeading.parentNode.insertBefore(pageBreak, firstMajorHeading);
        firstMajorHeading.parentNode.insertBefore(nextToc, firstMajorHeading);
    }
}

function getSrsProjectTitleFromContent(content) {
    const titleLine = content?.querySelector(".cover-project-title")?.textContent || "";
    return titleLine.replace(/^Project Name:\s*/i, "").trim() || "Proposed System";
}

function buildSrsSystemDiagramsHTML(projectTitle) {
    const safeTitle = escapeHTML(projectTitle);
    return `
        <section class="srs-system-diagrams">
          <h2 class="major-heading">2.7 System Diagrams</h2>
          <p>The following system model summaries describe the expected users, system boundary, data flow, and main stored records for ${safeTitle}. These models support the requirements described in the remaining sections of this SRS.</p>

          <div class="srs-diagram-card">
            <h3>Figure 1: Use Case Overview</h3>
            <table class="srs-model-table">
              <thead><tr><th>Actor</th><th>Main Use Cases</th><th>Purpose</th></tr></thead>
              <tbody>
                <tr><td>User</td><td>Log in, submit information, view output, download reports</td><td>Uses the system to complete daily work and receive system results.</td></tr>
                <tr><td>Admin</td><td>Manage records, monitor activity, maintain system data</td><td>Controls administrative records and keeps the system organized.</td></tr>
              </tbody>
            </table>
          </div>

          <div class="srs-diagram-card">
            <h3>Figure 2: Context and Data Flow Overview</h3>
            <table class="srs-model-table">
              <thead><tr><th>Source</th><th>Flow</th><th>Destination</th></tr></thead>
              <tbody>
                <tr><td>User Interface</td><td>Input requests, uploaded files, commands, and form data</td><td>${safeTitle}</td></tr>
                <tr><td>${safeTitle}</td><td>Validated records, generated outputs, and reports</td><td>User Interface</td></tr>
                <tr><td>${safeTitle}</td><td>Store and retrieve users, records, outputs, and history</td><td>Database</td></tr>
              </tbody>
            </table>
          </div>

          <div class="srs-diagram-card">
            <h3>Figure 3: Data Model Overview</h3>
            <table class="srs-model-table">
              <thead><tr><th>Entity</th><th>Key Data</th><th>Relationship</th></tr></thead>
              <tbody>
                <tr><td>Users</td><td>user_id, name, email, role</td><td>Users create and access system records.</td></tr>
                <tr><td>System Records</td><td>record_id, details, status, timestamps</td><td>Records are processed by the system and may produce reports.</td></tr>
                <tr><td>Reports / Outputs</td><td>output_id, type, generated date, file data</td><td>Outputs are generated from validated records and user requests.</td></tr>
              </tbody>
            </table>
          </div>
        </section>`;
}

function ensureSrsSystemDiagrams(content) {
    if (!content) return;
    const documentRoot = content.querySelector(".srs-document") || content.firstElementChild || content;
    if (documentRoot.querySelector?.(".srs-system-diagrams")) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildSrsSystemDiagramsHTML(getSrsProjectTitleFromContent(content));
    const section = wrapper.firstElementChild;
    if (!section) return;

    const systemFeaturesHeading = Array.from(documentRoot.querySelectorAll("h2.major-heading"))
        .find(heading => /^3\.\s+System Features/i.test(heading.textContent.trim()));
    if (systemFeaturesHeading?.parentNode) {
        systemFeaturesHeading.parentNode.insertBefore(section, systemFeaturesHeading);
        return;
    }

    const appendixHeading = Array.from(documentRoot.querySelectorAll("h2.major-heading"))
        .find(heading => /Appendix/i.test(heading.textContent));
    if (appendixHeading?.parentNode) {
        appendixHeading.parentNode.insertBefore(section, appendixHeading);
    } else {
        documentRoot.appendChild(section);
    }
}

function initializeSrsRibbonDocking() {
    if (!document.body.classList.contains("page-generate-srs")) return;
    window.addEventListener("scroll", updateSrsRibbonDockState, { passive: true });
    window.addEventListener("resize", updateSrsRibbonDockState);
    updateSrsRibbonDockState();
}

function updateSrsRibbonDockState() {
    if (!document.body.classList.contains("page-generate-srs")) return;
    const outputBox = document.getElementById("srsOutputBox");
    const ribbon = document.querySelector(".srs-download-ribbon");
    const generated = document.body.classList.contains("srs-generation-active")
        && outputBox
        && outputBox.style.display !== "none"
        && ribbon;

    if (!generated) {
        document.body.classList.remove("srs-ribbon-docked");
        return;
    }

    const headerHeight = document.querySelector(".topbar")?.offsetHeight || 76;
    const outputTop = outputBox.getBoundingClientRect().top;
    document.body.classList.toggle("srs-ribbon-docked", outputTop <= headerHeight);
}

function getSrsGenerationErrorMessage(error) {
    const message = String(error?.message || "").trim();
    if (/failed to fetch/i.test(message)) {
        return `Backend server is not reachable at ${AIRA_API_BASE}. Start the backend with npm.cmd start, then generate the SRS again.`;
    }
    if (/model request failed/i.test(message)) {
        return "The backend received the request but could not generate the SRS. Check the backend terminal for the exact error, then try again.";
    }
    return message || "SRS generation failed. Please check the uploaded file and try again.";
}

function getSrsLanguagePreference() {
    if (!hasUnlimitedAccess()) return "English";
    const language = getSavedSettings().language || "en";
    const labels = {
        en: "English",
        es: "Spanish",
        fr: "French",
        de: "German",
        ur: "Urdu",
        ar: "Arabic"
    };
    return labels[language] || "English";
}

async function prepareUploadedFilesForBackend(files) {
    const prepared = [];
    const selectedFiles = files
        .slice(0, 1);

    for (const file of selectedFiles) {
        const isImage = file.type.startsWith("image/");
        const preparedImage = isImage ? await prepareImageForOcr(file) : null;

        if (!isImage && file.size > 4500000) {
            prepared.push({
                fileName: file.name,
                mimeType: file.type,
                fileSize: file.size,
                skipped: true
            });
            continue;
        }

        prepared.push({
            fileName: file.name,
            mimeType: preparedImage?.mimeType || file.type,
            fileSize: preparedImage?.fileSize || file.size,
            originalMimeType: file.type,
            fileData: preparedImage?.fileData || await fileToDataUrl(file)
        });
    }
    return prepared;
}

function prepareImageForOcr(file) {
    return fileToDataUrl(file).then(dataUrl => new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const maxSide = 1800;
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const pngData = canvas.toDataURL("image/png");
            resolve({
                fileData: pngData,
                mimeType: "image/png",
                fileSize: Math.round((pngData.length * 3) / 4)
            });
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
    }));
}

function buildSRSPreviewHTML({ title, domain, detail, actors, dataManaged, features, notes, referenceFileName, umlImageFileName }) {
    const inferredTitle = title || inferProjectTitleFromInput(notes, umlImageFileName, referenceFileName);
    const projectTitle = toTitleCase(correctCommonTypos(inferredTitle || "The Proposed System"));
    const projectDomain = domain || "General Software";
    const projectActors = normalizeActors(splitCsv(actors || inferActorsFromDomain(projectDomain)));
    const projectData = splitCsv(dataManaged || "User records, system records, generated outputs, activity history");
    const projectFeatures = features.length ? features : ["login", "manage records", "generate reports", "download reports"];
    const scope = notes || getSrsDefaultScope(projectTitle, projectDomain);
    const functionalRequirements = buildPreviewFunctionalRequirements(projectFeatures, projectActors, projectDomain);
    const domainRequirements = buildDomainFunctionalRequirements(projectDomain, projectActors);
    const dataRequirements = buildPreviewDataRequirements(projectData, projectDomain);
    const nonFunctionalRequirements = buildPreviewNonFunctionalRequirements(projectDomain);

    return `
      <article class="srs-document">
        <h1>Software Requirements Specification (SRS)</h1>
        <p class="cover-for">for</p>
        <p class="cover-project-title">Project Name: ${escapeHTML(projectTitle)}</p>

        <h2 class="cover-heading">Project Members</h2>
        ${AIRA_PROJECT_MEMBERS.map(member => `<p class="cover-member">${escapeHTML(member)}</p>`).join("")}

        <div class="page-break"></div>
        ${buildSrsTocSectionHTML(getStandardSrsTocItems())}

        <h2 class="tested-heading">Tested By Table</h2>
        <table class="tested-by-table">
          <thead>
            <tr><th>Tester Name</th><th>Role</th><th>Test Date</th><th>Signature</th></tr>
          </thead>
          <tbody>
            <tr><td>____________________</td><td>____________________</td><td>____________________</td><td>____________________</td></tr>
          </tbody>
        </table>

        <h2 class="major-heading">1. Introduction</h2>
        <p>This ${escapeHTML(detail || "Detailed")} SRS defines the expected behavior, constraints, and quality requirements for ${escapeHTML(projectTitle)} in the ${escapeHTML(projectDomain)} domain.</p>

        <h3>1.1 Purpose</h3>
        <p>The purpose of this document is to describe what the system shall do and how stakeholders can validate the completed system.</p>

        <h3>1.2 Scope</h3>
        <p>${escapeHTML(scope)}</p>

        <h3>1.3 Intended Audience</h3>
        <p>This document is intended for project supervisors, developers, testers, administrators, and end users who need to understand the expected behavior of ${escapeHTML(projectTitle)}.</p>

        <h2 class="major-heading">2. Overall Description</h2>
        <h3>2.1 Product Perspective</h3>
        <p>${escapeHTML(projectTitle)} will provide a web-based platform for ${escapeHTML(projectActors.join(", "))}. The system will organize records, support daily operations, and provide controlled access to stored information.</p>

        <h3>2.2 User Classes</h3>
        ${formatRequirements(projectActors.map(actor => describeActor(actor, projectDomain)))}

        <h3>2.3 Operating Environment</h3>
        ${formatRequirements([
            "The system shall run on modern web browsers such as Chrome, Edge, and Firefox.",
            "The system shall use a backend service for data processing and business logic.",
            "The system shall use a database to store users, records, transactions, and generated outputs."
        ])}

        ${buildSrsSystemDiagramsHTML(projectTitle)}

        <h2 class="major-heading">3. Functional Requirements</h2>
        ${formatRequirements([...functionalRequirements, ...domainRequirements])}

        <h2 class="major-heading">4. Non-Functional Requirements</h2>
        ${formatRequirements(nonFunctionalRequirements)}

        <h2 class="major-heading">5. Data Requirements</h2>
        ${formatRequirements(dataRequirements)}

        <h2 class="major-heading">6. Security Requirements</h2>
        ${formatRequirements([
            "The system shall authenticate users before allowing access to protected features.",
            "The system shall restrict administrative functions to authorized users.",
            "The system shall validate uploaded files before processing.",
            "The system shall keep sensitive data protected.",
            "The system shall maintain access control between administrative and normal user functions."
        ])}

        <h2 class="major-heading">7. External Interface Requirements</h2>
        ${formatRequirements([
            "The system shall provide forms for entering, updating, and searching records.",
            "The system shall display confirmation messages after successful operations.",
            "The system shall provide clear navigation between dashboard, records, reports, and account features.",
            "The system shall provide download or print options for important reports where applicable."
        ])}

        <h2 class="major-heading">8. Performance and Reliability Requirements</h2>
        ${formatRequirements([
            "The system shall load common pages within an acceptable response time under normal usage.",
            "The system shall preserve stored records after successful save operations.",
            "The system shall show meaningful error messages if an operation fails.",
            "The system shall allow authorized users to retry failed operations without losing entered data."
        ])}

        <h2 class="major-heading">9. Acceptance Criteria</h2>
        ${formatRequirements([
            "All selected features shall be visible and usable from the interface.",
            "Generated SRS content shall be editable before download.",
            "The system shall show useful error messages for missing or invalid inputs.",
            "The system shall generate a structured document with clear headings and sections.",
            "The system shall separate administrative operations from normal user operations."
        ])}

        <h2 class="major-heading">10. Appendix</h2>
        <h3>Appendix A: Priority Levels</h3>
        <p>High priority requirements are required for the first complete version. Medium and low priority items may be improved in later iterations.</p>
      </article>`;
}

function inferProjectTitleFromInput(notes, umlImageFileName, referenceFileName) {
    const cleanedNotes = String(notes || "").trim();
    if (cleanedNotes) {
        return cleanedNotes
            .split(/[.!?\n]/)[0]
            .replace(/^generate\s+(an?\s+)?srs\s+(for|of)\s+/i, "")
            .slice(0, 70);
    }

    const fileName = umlImageFileName || referenceFileName || "";
    if (fileName) {
        return fileName
            .replace(/\.[^.]+$/, "")
            .replace(/[-_]+/g, " ");
    }

    return "The Proposed System";
}

function getSrsDefaultScope(projectTitle, projectDomain) {
    return `${projectTitle} is a ${projectDomain.toLowerCase()} system designed to support its users through a web-based interface. The system scope includes core user interactions, data handling, reporting, security controls, and operational workflows required for the project.`;
}

function splitCsv(value) {
    return value.split(",").map(item => item.trim()).filter(Boolean);
}

function correctCommonTypos(value) {
    return String(value)
        .replaceAll(/arsficilinteligence/gi, "artificial intelligence")
        .replaceAll(/artifical/gi, "artificial")
        .replaceAll(/artficial/gi, "artificial")
        .replaceAll(/inteligence/gi, "intelligence")
        .replaceAll(/intelliegence/gi, "intelligence")
        .replaceAll(/anaiyzer/gi, "analyzer")
        .replaceAll(/analizer/gi, "analyzer")
        .replaceAll(/analyser/gi, "analyzer")
        .replaceAll(/libarary/gi, "library")
        .replaceAll(/managment/gi, "management")
        .replaceAll(/mangement/gi, "management")
        .replaceAll(/requirment/gi, "requirement")
        .replaceAll(/requriement/gi, "requirement")
        .replaceAll(/documnet/gi, "document")
        .replaceAll(/diagrm/gi, "diagram")
        .replaceAll(/genearted/gi, "generated")
        .replaceAll(/forcasting/gi, "forecasting")
        .replaceAll(/forecating/gi, "forecasting")
        .replaceAll(/helth/gi, "health")
        .replaceAll(/hosptial/gi, "hospital")
        .replaceAll(/passongor/gi, "passenger")
        .replaceAll(/passanger/gi, "passenger")
        .replaceAll(/cheks/gi, "checks")
        .replaceAll(/ecommerece/gi, "ecommerce");
}

function toTitleCase(value) {
    const acronyms = new Set(["ai", "aira", "api", "doc", "docx", "erd", "fr", "http", "https", "ml", "nfr", "pdf", "png", "srs", "ui", "uml"]);
    return correctCommonTypos(value)
        .toLowerCase()
        .replace(/\b[a-z][a-z0-9-]*\b/g, word => {
            if (acronyms.has(word)) return word.toUpperCase();
            return word.split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join("-");
        });
}

function inferActorsFromDomain(domain) {
    if (domain === "Library Management") return "Member, Librarian, Admin";
    if (domain === "Healthcare") return "Patient, Doctor, Admin";
    if (domain === "Forecasting / Prediction") return "Analyst, Manager, Admin";
    if (domain === "E-Commerce") return "Customer, Admin";
    return "User, Admin";
}

function normalizeActors(actors) {
    return actors.map(actor => toTitleCase(actor)).filter(Boolean);
}

function buildPreviewFunctionalRequirements(features, actors, domain) {
    return features.map(feature => {
        const action = normalizeFeatureAction(feature);
        const actor = choosePreviewActor(feature, actors, domain);
        return `The system shall allow ${actor.toLowerCase()}s to ${action}.`;
    });
}

function normalizeFeatureAction(feature) {
    const map = {
        "login": "log in using valid credentials",
        "search records": "search and filter records",
        "manage records": "add, update, and delete authorized records",
        "upload files": "upload supported files",
        "download reports": "download reports in supported formats",
        "generate reports": "generate reports from stored data",
        "dashboard analytics": "view dashboard analytics",
        "notifications": "receive system notifications",
        "forecasting": "generate forecasts from available data",
        "payment processing": "process payments securely"
    };

    return map[feature] || feature;
}

function choosePreviewActor(feature, actors, domain) {
    const lower = feature.toLowerCase();
    const admin = actors.find(actor => actor.toLowerCase().includes("admin"));
    const librarian = actors.find(actor => actor.toLowerCase().includes("librarian"));
    const doctor = actors.find(actor => actor.toLowerCase().includes("doctor"));
    const analyst = actors.find(actor => actor.toLowerCase().includes("analyst"));
    const first = actors[0] || "User";

    if (domain === "Library Management") {
        if (lower.includes("manage") || lower.includes("report")) return librarian || admin || first;
        if (lower.includes("search") || lower.includes("download")) return first;
    }
    if (domain === "Healthcare") {
        if (lower.includes("manage") || lower.includes("report")) return doctor || admin || first;
    }
    if (domain === "Forecasting / Prediction") {
        if (lower.includes("forecast") || lower.includes("dashboard") || lower.includes("report")) return analyst || first;
    }
    if ((lower.includes("manage") || lower.includes("report")) && admin) return admin;
    return first;
}

function buildDomainFunctionalRequirements(domain, actors) {
    if (domain === "Library Management") {
        return [
            "The system shall allow members to view available books.",
            "The system shall allow librarians to issue books to members.",
            "The system shall allow librarians to record returned books.",
            "The system shall allow librarians to update book availability status.",
            "The system shall allow administrators to manage user accounts and access permissions."
        ];
    }
    if (domain === "Healthcare") {
        return [
            "The system shall allow patients to manage appointment requests.",
            "The system shall allow doctors to view patient records assigned to them.",
            "The system shall allow authorized staff to upload and manage medical reports.",
            "The system shall allow administrators to manage user roles and access permissions."
        ];
    }
    if (domain === "Forecasting / Prediction") {
        return [
            "The system shall allow analysts to upload datasets.",
            "The system shall allow analysts to generate prediction results.",
            "The system shall allow users to view forecast charts.",
            "The system shall allow managers to download forecast reports."
        ];
    }
    return [];
}

function describeActor(actor, domain) {
    const lower = actor.toLowerCase();
    if (lower.includes("admin")) return `${actor} shall manage user accounts, permissions, and system settings.`;
    if (lower.includes("librarian")) return `${actor} shall manage books, borrowing records, returns, and library reports.`;
    if (lower.includes("patient")) return `${actor} shall view healthcare information and submit allowed requests.`;
    if (lower.includes("doctor")) return `${actor} shall review patient-related records and manage healthcare reports.`;
    if (lower.includes("analyst")) return `${actor} shall upload datasets, generate forecasts, and review analytical results.`;
    return `${actor} shall use the system to perform authorized ${domain.toLowerCase()} operations.`;
}

function buildPreviewNonFunctionalRequirements(domain) {
    return [
        "The system shall validate all required input fields before submission.",
        "The system shall provide a clear, consistent, and responsive user interface.",
        "The system shall protect user data from unauthorized access.",
        "The system shall support modern browsers including Chrome, Edge, and Firefox.",
        "The system shall allow users to review generated or stored information before downloading it.",
        `The system shall maintain reliable access to important ${domain.toLowerCase()} records.`
    ];
}

function buildPreviewDataRequirements(dataItems, domain) {
    const requirements = dataItems.map(item => `The system shall store and manage ${item.toLowerCase()}.`);
    if (domain === "Library Management") {
        requirements.push("The system shall store book title, author, category, availability status, and borrowing details.");
        requirements.push("The system shall store member and librarian account information.");
    }
    if (domain === "Healthcare") {
        requirements.push("The system shall store patient profiles, appointment details, and medical report references.");
    }
    if (domain === "Forecasting / Prediction") {
        requirements.push("The system shall store uploaded datasets, prediction results, and generated reports.");
    }
    return requirements;
}

function formatRequirements(items) {
    return items.map((item, index) => {
        const labelMatch = String(item || "").match(/^([A-Za-z][A-Za-z0-9 /&().-]{1,42}:\s*)(.*)$/);
        const body = labelMatch
            ? `<strong>${escapeHTML(labelMatch[1].trim())}</strong> ${escapeHTML(labelMatch[2])}`
            : escapeHTML(item);
        return `<p class="srs-list-item"><strong>${index + 1}.</strong> ${body}</p>`;
    }).join("");
}

function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function renderAmbiguityResults(result, list) {
    if (result?.professional_report) {
        const content = list.closest(".output-content");
        if (content) {
            content.innerHTML = renderProfessionalAnalysisReport(result.professional_report, {
                sourceLabel: uiPhrase("Uploaded SRS document")
            });
            return;
        }
    }

    const results = Array.isArray(result?.results) ? result.results : [];
    const summary = result?.summary || {};
    const total = Number(summary.total ?? results.length);
    const ambiguous = Number(summary.ambiguous ?? results.filter(item => item.ambiguous).length);
    const clear = Number(summary.clear ?? Math.max(total - ambiguous, 0));

    const rows = results.length
        ? results.map(item => {
            const terms = Array.isArray(item.detected_terms) && item.detected_terms.length
                ? `<span class="ai-terms">Terms: ${item.detected_terms.map(escapeHTML).join(", ")}</span>`
                : `<span class="ai-terms">No vague term detected</span>`;
            const status = item.ambiguous ? "Ambiguous" : "Clear";
            const className = item.ambiguous ? "ai-result-warning" : "ai-result-clear";
            return `
              <li class="${className}">
                <strong>${status}:</strong> ${escapeHTML(item.requirement || "")}
                ${terms}
              </li>`;
        }).join("")
        : `<li>${escapeHTML(uiPhrase("No complete requirements were detected in the provided text."))}</li>`;

    list.innerHTML = `
      <li class="ai-result-summary">
        <strong>${escapeHTML(uiPhrase("Total Requirements:"))}</strong> ${total}
        <span><strong>${escapeHTML(uiPhrase("Ambiguous:"))}</strong> ${ambiguous}</span>
        <span><strong>${escapeHTML(uiPhrase("Clear:"))}</strong> ${clear}</span>
      </li>
      ${rows}`;
}

function normalizeUiDiagramType(type) {
    const value = String(type || "usecase")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");
    const aliases = {
        usecase: "usecase",
        use_case: "usecase",
        use_case_diagram: "usecase",
        usecase_diagram: "usecase",
        class: "class",
        class_diagram: "class",
        sequence: "sequence",
        sequence_diagram: "sequence",
        erd: "erd",
        er_diagram: "erd",
        erd_diagram: "erd",
        entity_relationship_diagram: "erd",
        activity: "activity",
        activity_diagram: "activity"
    };
    return aliases[value] || value;
}

async function collectTextFromInputAndFile(textarea, file) {
    const parts = [];
    const typedText = String(textarea?.value || "").trim();
    if (typedText) parts.push(typedText);
    if (file) {
        try {
            const extracted = await extractFileContent(file);
            if (extracted?.text) parts.push(extracted.text);
        } catch (error) {
            console.warn("Attached file text extraction failed:", error);
        }
    }
    return parts.join("\n\n").trim();
}

function readableDiagramTypeLabel(diagramType) {
    return {
        usecase: "Use Case Diagram",
        use_case: "Use Case Diagram",
        class: "Class Diagram",
        sequence: "Sequence Diagram",
        erd: "ER Diagram",
        activity: "Activity Diagram",
        deployment: "Deployment Diagram",
        component: "Component Diagram",
        package: "Package Diagram",
        state: "State Diagram"
    }[normalizeUiDiagramType(diagramType)] || "UML Diagram";
}

function inferProjectNameFromFile(file) {
    const base = String(file?.name || "Uploaded Project")
        .replace(/\.[^.]+$/, "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return base || "Uploaded Project";
}

function buildUmlFallbackText(file, diagramType, diagramReference) {
    const targetType = readableDiagramTypeLabel(diagramType);
    const fileName = file?.name || diagramReference?.name || "attached input";
    if (diagramReference?.imageData || diagramReference?.projectJson) {
        return [
            `Generate a professional ${targetType} by converting the attached diagram input.`,
            `Source diagram file: ${fileName}.`,
            "Read the visual labels, actors, classes, entities, lifelines, activities, decisions, relationships, and flow from the attached diagram.",
            "Do not create generic sample content. Preserve the real meaning of the attached diagram and convert it into the selected target UML type."
        ].join("\n");
    }
    if (!file) return "";
    return [
        `Generate a professional ${targetType} for the uploaded document.`,
        `Uploaded file: ${file.name}.`,
        `Project/topic inferred from file name: ${inferProjectNameFromFile(file)}.`,
        "If the document text cannot be fully extracted, use the project/topic name and selected diagram type to create a complete, domain-specific UML diagram instead of returning an empty result."
    ].join("\n");
}

async function analyzeUMLImage() {
    const out = document.getElementById("umlImageDescriptionBox");
    const content = document.getElementById("umlImageDescriptionContent");
    const file = document.getElementById("umlImageUpload")?.files?.[0];
    if (!out || !content) return;

    out.style.display = "none";
    if (!file) {
        out.style.display = "block";
        content.innerHTML = `<p>${escapeHTML(uiPhrase("Please attach a UML diagram image first."))}</p>`;
        return;
    }

    out.style.display = "block";
    content.innerHTML = `<p><em>${escapeHTML(uiPhrase("Reading UML image and generating description..."))}</em></p>`;

    try {
        const isAiraProject = /\.(airauml|json)$/i.test(file.name);
        let imageData = "";
        let diagramProject = null;
        if (isAiraProject) {
            diagramProject = JSON.parse(await file.text());
            if (diagramProject?.format !== "aira-uml-project") {
                throw new Error(uiPhrase("The selected JSON file is not an editable AIRA UML diagram."));
            }
        } else if (/\.svg$/i.test(file.name) || file.type === "image/svg+xml") {
            imageData = await svgFileToPngDataUrl(file);
        } else {
            imageData = await fileToDataUrl(file);
        }
        const response = await fetch(`${AIRA_API_BASE}/api/describe-uml-image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: getCurrentUserId(),
                imageData,
                diagramProject,
                diagramType: inferUmlTypeFromFileName(file.name),
                fileName: file.name,
                mimeType: file.type,
                context: "",
                language: getSrsLanguagePreference()
            })
        });
        const result = await response.json();
        if (!response.ok) {
            handleAccessApiError(result, "uml_analysis");
            throw new Error(result.error || uiPhrase("Unable to analyze UML image."));
        }

        content.innerHTML = renderProfessionalAnalysisReport(result.professional_report, { sourceLabel: file.name });
        out.scrollIntoView({ behavior: "smooth", block: "start" });
        await refreshAccessSummary();
    } catch (error) {
        out.style.display = "block";
        content.innerHTML = `<p>${escapeHTML(error.message || uiPhrase("UML image analysis failed."))}</p>`;
    }
}

function selectPastedUMLDiagram(blob, mimeType = "image/png") {
    const input = document.getElementById("umlImageUpload");
    if (!input || !blob) return;

    const extension = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
        "image/bmp": "bmp",
        "image/svg+xml": "svg"
    }[mimeType] || "png";
    const file = new File([blob], `pasted-uml-diagram-${Date.now()}.${extension}`, {
        type: mimeType,
        lastModified: Date.now()
    });

    setInputFiles(input, [file]);
    input.dataset.skipFileAccumulation = "true";
    input.dispatchEvent(new Event("change"));

    const status = document.getElementById("umlPasteStatus");
    if (status) {
        status.textContent = "Pasted UML diagram is ready for analysis. Select its diagram type if auto-detection is uncertain.";
    }
    resetUmlDescriptionResult();
}

function inferUmlTypeFromFileName(fileName) {
    const value = String(fileName || "").toLowerCase();
    const matches = [
        ["sequence", "sequence"],
        ["use case", "usecase"],
        ["usecase", "usecase"],
        ["class", "class"],
        ["activity", "activity"],
        ["deployment", "deployment"],
        ["component", "component"],
        ["package", "package"],
        ["state", "state"],
        ["communication", "communication"],
        ["architecture", "architecture"],
        ["interface", "architecture"],
        ["data flow", "data_flow"],
        ["dfd", "data_flow"],
        ["entity relationship", "erd"],
        ["er diagram", "erd"],
        ["erd", "erd"]
    ];
    return matches.find(([keyword]) => value.includes(keyword))?.[1] || "";
}

function resetUmlDescriptionResult() {
    const box = document.getElementById("umlImageDescriptionBox");
    const content = document.getElementById("umlImageDescriptionContent");
    if (box) box.style.display = "none";
    if (content) {
        content.contentEditable = "false";
        content.innerHTML = `<p><em>${escapeHTML(uiPhrase("The UML image description will appear here."))}</em></p>`;
    }
}

function initializeUmlClipboardPaste() {
    if (!document.getElementById("umlImageUpload")) return;
    document.addEventListener("paste", event => {
        const imageItem = Array.from(event.clipboardData?.items || [])
            .find(item => item.kind === "file" && item.type.startsWith("image/"));
        if (!imageItem) return;

        const blob = imageItem.getAsFile();
        if (!blob) return;
        event.preventDefault();
        selectPastedUMLDiagram(blob, imageItem.type);
    });
}

async function svgFileToPngDataUrl(file) {
    const sourceUrl = URL.createObjectURL(file);
    try {
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error(uiPhrase("Unable to read the SVG diagram.")));
            image.src = sourceUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(image.naturalWidth || 1200, 600);
        canvas.height = Math.max(image.naturalHeight || 800, 400);
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
    } finally {
        URL.revokeObjectURL(sourceUrl);
    }
}

async function sendUMLPrompt() {
    const ta = document.getElementById("promptInput");
    const pv = document.getElementById("umlInlinePreview");
    const out = document.getElementById("umlOutputBox");
    const content = document.getElementById("umlOutputContent");
    const typeSelect = document.getElementById("umlType");
    const diagramType = typeSelect ? typeSelect.value : "usecase";
    if (!out || !content) return;

    out.style.display = "block";
    content.style.display = "block";
    content.innerHTML = `<p><em>${escapeHTML(uiPhrase("Generating UML diagram with trained model..."))}</em></p>`;
    try {
        const file = document.getElementById("fileUpload")?.files?.[0];
        const diagramReference = attachedUmlSourceDiagram;
        const textSourceFile = isUmlDiagramReferenceFile(file) ? null : file;
        let text = await collectTextFromInputAndFile(ta, textSourceFile);
        const fallbackText = buildUmlFallbackText(file, diagramType, diagramReference);
        if (diagramReference?.imageData || diagramReference?.projectJson) {
            text = [text, fallbackText].filter(Boolean).join("\n\n");
        } else if (!text && file) {
            text = fallbackText;
        }
        if (!text && !diagramReference?.imageData && !diagramReference?.projectJson) {
            content.innerHTML = `<p>${escapeHTML(uiPhrase("Please enter a system description, attach an SRS/document file, or attach a UML diagram image first."))}</p>`;
            return;
        }

        const response = await fetch(`${AIRA_API_BASE}/api/generate-uml`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text,
                diagramType,
                diagramReference,
                userId: getCurrentUserId(),
                language: getSrsLanguagePreference()
            })
        });
        const result = await response.json();
        if (!response.ok) {
            handleAccessApiError(result, "uml_generation");
            throw new Error(result.error || uiPhrase("Unable to generate UML diagram."));
        }
        if (!isGeneratedUmlMeaningful(result.diagram)) {
            throw new Error("The model did not return enough UML elements. Please enter a clearer system description or upload an SRS with functional requirements.");
        }

        const normalizedType = normalizeUiDiagramType(
            result.diagram?.diagram_type || result.diagram_type || diagramType
        );
        lastGeneratedUmlDiagram = result.diagram;
        lastGeneratedUmlType = normalizedType;

        const professionalRendered = await renderProfessionalPlantUmlPreview(result.diagram?.plantuml || "");
        if (!professionalRendered) {
            throw new Error("Professional UML rendering failed. Please try again with a clearer prompt or a smaller document.");
        }
        const editor = document.getElementById("diagramEditor");
        const svg = document.getElementById("diagramConnectors");
        if (editor && svg) clearDiagramCanvas(editor, svg);
        diagramEditEnabled = false;
        content.style.display = "none";
        content.innerHTML = "";
        out.scrollIntoView({ behavior: "smooth", block: "start" });
        await refreshAccessSummary();
    } catch (error) {
        content.style.display = "block";
        content.innerHTML = `<p>${escapeHTML(error.message || uiPhrase("UML generation failed."))}</p>`;
    }
}

function isGeneratedUmlMeaningful(diagram) {
    if (!diagram || typeof diagram !== "object") return false;
    const collections = [
        diagram.actors,
        diagram.use_cases,
        diagram.classes,
        diagram.class_details,
        diagram.entities,
        diagram.entity_details,
        diagram.messages,
        diagram.actions
    ];
    return collections.some(items => Array.isArray(items) && items.length > 0);
}

let selectedDiagramTool = "select";
let diagramElementCount = 1;
let diagramEditEnabled = false;
let selectedDiagramNode = null;
let selectedDiagramConnector = null;
let connectorStartNode = null;
let diagramClipboard = null;
let diagramBackgroundImage = null;
let attachedUmlSourceDiagram = null;
let currentPlantUmlSource = "";
let currentPlantUmlSvg = "";
let lastGeneratedUmlDiagram = null;
let lastGeneratedUmlType = "usecase";
const diagramUndoStack = [];
const DIAGRAM_UNDO_LIMIT = 50;
let diagramUndoRestoring = false;

function getDiagramUndoSnapshot() {
    const project = serializeDiagramProject();
    project.exportedAt = "";
    return JSON.stringify(project);
}

function resetDiagramUndoHistory() {
    diagramUndoStack.length = 0;
}

function pushDiagramUndoState() {
    if (diagramUndoRestoring) return;
    const snapshot = getDiagramUndoSnapshot();
    if (diagramUndoStack[diagramUndoStack.length - 1] === snapshot) return;
    diagramUndoStack.push(snapshot);
    if (diagramUndoStack.length > DIAGRAM_UNDO_LIMIT) diagramUndoStack.shift();
}

function undoDiagramChange() {
    if (!diagramEditEnabled || diagramUndoStack.length === 0) return;
    const snapshot = diagramUndoStack.pop();
    if (!snapshot) return;

    try {
        diagramUndoRestoring = true;
        restoreDiagramProjectSnapshot(JSON.parse(snapshot));
    } finally {
        diagramUndoRestoring = false;
    }
}

function hasEditableDiagramContent() {
    const editor = document.getElementById("diagramEditor");
    const svg = document.getElementById("diagramConnectors");
    return Boolean(
        editor?.dataset.backgroundImage ||
        editor?.querySelector(".diagram-node") ||
        svg?.querySelector(".connector-line")
    );
}

const diagramConnectorTools = new Set([
    "connector",
    "message",
    "return-message",
    "association",
    "dependency",
    "inheritance",
    "aggregation",
    "composition",
    "relationship",
    "include",
    "extend"
]);

function isDiagramConnectorTool(tool) {
    return diagramConnectorTools.has(tool);
}

const CONNECTOR_MERGE_TOLERANCE = 5;

function enhanceDiagramToolbar() {
    const icons = {
        Select: "↖",
        Undo: "↶",
        Delete: "⌫",
        Connector: "↗",
        Text: "T",
        Note: "▱",
        Frame: "▯",
        Actor: "",
        "Use Case": "⬭",
        Boundary: "▭",
        Include: "⋯",
        Extend: "⋯",
        Class: "▤",
        Interface: "◫",
        Package: "▣",
        Association: "─",
        Dependency: "┄",
        Inheritance: "△",
        Aggregation: "◇",
        Composition: "◆",
        Lifeline: "┆",
        Activation: "▌",
        Message: "→",
        Return: "↢",
        Alt: "▱",
        Loop: "▱",
        Start: "●",
        Action: "▭",
        Decision: "◇",
        "Fork/Join": "━",
        Swimlane: "▥",
        Merge: "◇",
        Object: "▭",
        End: "◉",
        Entity: "▦",
        Table: "▤",
        PK: "PK",
        FK: "↪",
        Attribute: "○",
        Relationship: "◇",
        "Weak Entity": "▧",
        Cardinality: "1..*"
    };

    document.querySelectorAll(".diagram-toolbar .tool-btn").forEach(button => {
        if (button.dataset.enhanced === "true") return;
        const label = button.textContent.trim();
        const icon = icons[label] || "□";
        const actorGlyphClass = label === "Actor" ? " actor-tool-glyph" : "";
        button.innerHTML = `<span class="tool-glyph${actorGlyphClass}">${icon}</span><span class="tool-label">${label}</span>`;
        button.dataset.enhanced = "true";
        button.title = label;
    });
}

function getDiagramTypeLabel(type) {
    const labels = {
        usecase: "Use Case Diagram",
        use_case: "Use Case Diagram",
        class: "Class Diagram",
        sequence: "Sequence Diagram",
        erd: "ERD Diagram",
        activity: "Activity Diagram"
    };

    return labels[type] || "UML Diagram";
}

function seedDiagramPreview(type) {
    const editor = document.getElementById("diagramEditor");
    const svg = document.getElementById("diagramConnectors");
    if (!editor || !svg) return;

    clearDiagramCanvas(editor, svg);
    const seeds = getDiagramSeeds(type);
    seeds.forEach(seed => addInitialDiagramNode(seed.tool, seed.label, seed.left, seed.top));
    requestAnimationFrame(() => {
        getSeedConnections(type, seeds).forEach(connection => {
            addConnectorBetweenNodes(connection[0], connection[1], type === "sequence" ? "message" : "connector");
        });
    });
}

function clearDiagramCanvas(editor, svg) {
    editor.querySelectorAll(".diagram-node").forEach(node => node.remove());
    svg.innerHTML = "";
    clearDiagramEditorBackground(editor);
    diagramElementCount = 1;
    selectedDiagramNode = null;
    selectedDiagramConnector = null;
    connectorStartNode = null;
}

function openBlankDiagramEditor() {
    const out = document.getElementById("umlOutputBox");
    const content = document.getElementById("umlOutputContent");
    const editor = document.getElementById("diagramEditor");
    const svg = document.getElementById("diagramConnectors");
    if (!out || !editor || !svg) return;

    out.style.display = "block";
    if (content) {
        content.style.display = "none";
        content.innerHTML = "";
    }
    clearDiagramCanvas(editor, svg);
    resetDiagramUndoHistory();
    clearProfessionalPlantUmlPreview();
    showDiagramWorkspace();
    enableDiagramEditingAfterGeneration();
    editor.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function renderProfessionalPlantUmlPreview(source) {
    const preview = document.getElementById("plantUmlPreview");
    const stage = document.getElementById("plantUmlPreviewStage");
    const status = document.getElementById("plantUmlPreviewStatus");
    const workspace = document.getElementById("diagramWorkspace");
    const sourceButton = document.getElementById("plantUmlSourceEditButton");
    const cleanSource = String(source || "").trim();

    currentPlantUmlSource = cleanSource;
    currentPlantUmlSvg = "";

    if (!preview || !stage || !cleanSource) {
        showDiagramWorkspace();
        return false;
    }

    preview.hidden = false;
    stage.innerHTML = `<p><em>${escapeHTML(uiPhrase("Rendering professional UML diagram..."))}</em></p>`;
    if (status) status.textContent = "";

    try {
        const response = await fetch(`${AIRA_API_BASE}/api/render-plantuml`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: cleanSource, format: "svg" })
        });
        const payload = await response.text();
        if (!response.ok) {
            let message = payload;
            try {
                message = JSON.parse(payload).error || payload;
            } catch {
                // The renderer may return plain text errors.
            }
            throw new Error(message || "PlantUML rendering failed.");
        }

        currentPlantUmlSvg = payload;
        stage.innerHTML = payload;
        stage.querySelector("svg")?.setAttribute("aria-label", "Professionally rendered UML diagram");
        if (status) {
            status.textContent = "Rendered with standard PlantUML notation. Use Edit Source for text-level changes.";
        }
        workspace?.classList.add("professional-preview-active");
        if (sourceButton) sourceButton.hidden = false;
        return true;
    } catch (error) {
        preview.hidden = true;
        stage.innerHTML = "";
        if (status) status.textContent = "";
        if (sourceButton) sourceButton.hidden = true;
        togglePlantUmlSourceEditor(false);
        const content = document.getElementById("umlOutputContent");
        if (content) {
            content.style.display = "block";
            content.innerHTML = `<p>${escapeHTML(error.message || "Professional UML rendering is unavailable.")}</p>`;
        }
        return false;
    }
}

function clearProfessionalPlantUmlPreview() {
    currentPlantUmlSource = "";
    currentPlantUmlSvg = "";
    const preview = document.getElementById("plantUmlPreview");
    const stage = document.getElementById("plantUmlPreviewStage");
    const sourceButton = document.getElementById("plantUmlSourceEditButton");
    if (preview) preview.hidden = true;
    if (stage) stage.innerHTML = "";
    if (sourceButton) sourceButton.hidden = true;
    togglePlantUmlSourceEditor(false);
}

function togglePlantUmlSourceEditor(forceOpen) {
    const panel = document.getElementById("plantUmlSourceEditor");
    const textarea = document.getElementById("plantUmlSourceText");
    if (!panel || !textarea) return;
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : panel.hidden;
    panel.hidden = !shouldOpen;
    if (shouldOpen) {
        textarea.value = currentPlantUmlSource || "";
        textarea.focus();
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
}

async function applyPlantUmlSourceEdit() {
    const textarea = document.getElementById("plantUmlSourceText");
    const status = document.getElementById("plantUmlPreviewStatus");
    const editor = document.getElementById("diagramEditor");
    const svg = document.getElementById("diagramConnectors");
    const preview = document.getElementById("plantUmlPreview");
    const stage = document.getElementById("plantUmlPreviewStage");
    const workspace = document.getElementById("diagramWorkspace");
    const sourceButton = document.getElementById("plantUmlSourceEditButton");
    const source = String(textarea?.value || "").trim();
    if (!source) {
        if (status) status.textContent = "Please enter PlantUML source before applying changes.";
        return;
    }
    if (!/@startuml/i.test(source) || !/@enduml/i.test(source)) {
        if (status) status.textContent = "PlantUML source must include @startuml and @enduml.";
        return;
    }
    if (status) status.textContent = "Applying PlantUML changes...";
    if (preview) preview.hidden = false;
    if (stage) {
        stage.innerHTML = `<p><em>${escapeHTML(uiPhrase("Rendering professional UML diagram..."))}</em></p>`;
    }

    try {
        const response = await fetch(`${AIRA_API_BASE}/api/render-plantuml`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source, format: "svg" })
        });
        const payload = await response.text();
        if (!response.ok) {
            let message = payload;
            try {
                message = JSON.parse(payload).error || payload;
            } catch {
                // The renderer may return plain text errors.
            }
            throw new Error(message || "PlantUML rendering failed.");
        }

        currentPlantUmlSvg = payload;
        currentPlantUmlSource = source;
        if (stage) {
            stage.innerHTML = payload;
            stage.querySelector("svg")?.setAttribute("aria-label", "Professionally rendered UML diagram");
        }
        workspace?.classList.add("professional-preview-active");
        if (sourceButton) sourceButton.hidden = false;
        if (lastGeneratedUmlDiagram && typeof lastGeneratedUmlDiagram === "object") {
            lastGeneratedUmlDiagram = { ...lastGeneratedUmlDiagram, plantuml: source };
        }
        if (editor && svg) {
            clearDiagramCanvas(editor, svg);
            diagramEditEnabled = false;
        }
        togglePlantUmlSourceEditor(false);
        if (status) {
            status.textContent = "Updated diagram rendered. Downloads will use this edited PlantUML version.";
        }
    } catch (error) {
        if (stage) {
            stage.innerHTML = "";
        }
        if (status) {
            status.textContent = error.message || "PlantUML source could not be rendered. Please fix the source and try again.";
        }
    }
}

function showDiagramWorkspace() {
    document.getElementById("diagramWorkspace")?.classList.remove("professional-preview-active");
}

function openProfessionalPlantUmlInEditor() {
    const editor = document.getElementById("diagramEditor");
    const svg = document.getElementById("diagramConnectors");
    const workspace = document.getElementById("diagramWorkspace");
    const preview = document.getElementById("plantUmlPreview");
    if (!editor || !svg || !currentPlantUmlSvg) return false;

    workspace?.classList.remove("professional-preview-active");
    if (preview) preview.hidden = true;
    clearDiagramCanvas(editor, svg);
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(currentPlantUmlSvg)}`;
    setDiagramEditorBackground(svgDataUrl);
    editor.dataset.professionalPlantUmlBackground = "true";
    resetDiagramUndoHistory();
    enableDiagramEditingAfterGeneration();
    return true;
}

function toggleDiagramWorkspace(button) {
    const workspace = document.getElementById("diagramWorkspace");
    const preview = document.getElementById("plantUmlPreview");
    if (!workspace) return;

    const isHidden = workspace.classList.contains("professional-preview-active");
    if (isHidden) {
        workspace.classList.remove("professional-preview-active");
        if (preview) preview.hidden = true;
        if (!hasEditableDiagramContent() && currentPlantUmlSvg) {
            openProfessionalPlantUmlInEditor();
        } else if (!hasEditableDiagramContent() && lastGeneratedUmlDiagram) {
            renderGeneratedDiagramOnCanvas(lastGeneratedUmlDiagram, lastGeneratedUmlType);
            enableDiagramEditingAfterGeneration();
        }
        if (button) button.textContent = "Done Editing";
        workspace.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }

    if (currentPlantUmlSvg && !hasEditableDiagramContent()) {
        workspace.classList.add("professional-preview-active");
        if (preview) preview.hidden = false;
        if (button) button.textContent = "Edit Diagram";
        preview?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }

    toggleDiagramEdit(button);
}

function clearDiagramEditorBackground(editor = document.getElementById("diagramEditor")) {
    if (!editor) return;
    editor.classList.remove("has-attached-diagram");
    editor.style.removeProperty("background-image");
    editor.style.removeProperty("background-repeat");
    editor.style.removeProperty("background-position");
    editor.style.removeProperty("background-size");
    delete editor.dataset.backgroundImage;
    delete editor.dataset.professionalPlantUmlBackground;
    diagramBackgroundImage = null;
}

function renderGeneratedDiagramOnCanvas(diagram, fallbackType) {
    const editor = document.getElementById("diagramEditor");
    const svg = document.getElementById("diagramConnectors");
    if (!editor || !svg) return;

    clearDiagramCanvas(editor, svg);

    const type = normalizeUiDiagramType(diagram?.diagram_type || fallbackType);
    const nodes = buildGeneratedDiagramNodes(diagram || {}, type);
    if (!nodes.length) {
        throw new Error("The generated UML response did not contain renderable diagram elements.");
    }
    nodes.forEach(seed => addInitialDiagramNode(seed.tool, seed.label, seed.left, seed.top));
    editor.scrollLeft = 0;
    editor.scrollTop = 0;

    requestAnimationFrame(() => {
        const connections = buildGeneratedDiagramConnections(diagram || {}, type, nodes);
        connections.forEach(connection => addConnectorBetweenNodes(connection[0], connection[1], connection[2] || "connector"));
        editor.scrollLeft = 0;
        editor.scrollTop = 0;
    });
}

function buildGeneratedDiagramNodes(diagram, type) {
    if (type === "usecase") {
        const actors = uniqueDiagramLabels(diagram.actors || []);
        const useCases = uniqueDiagramLabels(diagram.use_cases || []);
        const nodes = [];
        actors.slice(0, 3).forEach((actor, index) => {
            nodes.push({ tool: "actor", label: escapeHTML(actor), left: 70, top: 65 + index * 165 });
        });
        useCases.slice(0, 10).forEach((useCase, index) => {
            const row = index % 5;
            const col = Math.floor(index / 5);
            nodes.push({ tool: "usecase", label: escapeHTML(useCase), left: 315 + col * 285, top: 55 + row * 88 });
        });
        return nodes;
    }

    if (type === "class") {
        return normalizeDiagramClasses(diagram).slice(0, 8).map((classItem, index) => ({
            tool: "class",
            label: formatClassNodeLabel(classItem),
            left: 80 + (index % 3) * 285,
            top: 65 + Math.floor(index / 3) * 185,
        }));
    }

    if (type === "erd") {
        return normalizeDiagramEntities(diagram).slice(0, 8).map((entityItem, index) => ({
            tool: "entity",
            label: formatEntityNodeLabel(entityItem),
            left: 80 + (index % 3) * 285,
            top: 65 + Math.floor(index / 3) * 185,
        }));
    }

    if (type === "sequence") {
        const messages = Array.isArray(diagram.messages) ? diagram.messages : [];
        const messageParticipants = messages.flatMap(message => [message.from, message.to]);
        const participants = uniqueDiagramLabels([...(diagram.actors || []), ...messageParticipants]);
        const nodes = participants.slice(0, 5).map((participant, index) => ({
            tool: "lifeline",
            label: escapeHTML(participant),
            left: 70 + index * 180,
            top: 55,
        }));
        messages.slice(0, 5).forEach((message, index) => {
            nodes.push({
                tool: "note",
                label: escapeHTML(message.action || "Request"),
                left: 235,
                top: 150 + index * 78,
            });
        });
        return nodes;
    }

    if (type === "activity") {
        const actions = uniqueDiagramLabels(diagram.actions || []).slice(0, 8);
        if (!actions.length) return [];
        const nodes = [{ tool: "start-node", label: "", left: 395, top: 35 }];
        actions.forEach((action, index) => {
            nodes.push({
                tool: index === 1 && actions.length > 3 ? "decision" : "action",
                label: escapeHTML(action),
                left: index === 1 && actions.length > 3 ? 360 : 315,
                top: 105 + index * 90,
            });
        });
        nodes.push({ tool: "end-node", label: "", left: 395, top: 130 + actions.length * 90 });
        return nodes;
    }

    return [];
}

function buildGeneratedDiagramConnections(diagram, type, nodes) {
    if (type === "usecase") {
        const actorLabels = uniqueDiagramLabels(diagram.actors || []).slice(0, 3);
        const useCaseLabels = uniqueDiagramLabels(diagram.use_cases || []).slice(0, 10);
        const actorCount = actorLabels.length;
        const useCaseCount = useCaseLabels.length;
        const links = Array.isArray(diagram.links) ? diagram.links : [];
        const connections = [];

        if (links.length) {
            links.forEach(link => {
                const actorIndex = findDiagramLabelIndex(actorLabels, link.actor);
                const useCaseIndex = findDiagramLabelIndex(useCaseLabels, link.use_case);
                if (actorIndex >= 0 && useCaseIndex >= 0 && actorIndex < actorCount && useCaseIndex < useCaseCount) {
                    connections.push([actorIndex, actorCount + useCaseIndex, "association"]);
                }
            });
        }

        if (!connections.length) {
            for (let index = 0; index < useCaseCount; index += 1) {
                connections.push([0, actorCount + index, "association"]);
            }
        }
        return connections;
    }

    if (type === "sequence") {
        const messages = Array.isArray(diagram.messages) ? diagram.messages : [];
        const participants = uniqueDiagramLabels([
            ...(diagram.actors || []),
            ...messages.flatMap(message => [message.from, message.to]),
        ]).slice(0, 5);
        const connections = messages.map(message => [
            findDiagramLabelIndex(participants, message.from),
            findDiagramLabelIndex(participants, message.to),
            "message",
        ]).filter(connection => connection[0] >= 0 && connection[1] >= 0);
        return connections.length
            ? connections
            : Array.from({ length: Math.max(participants.length - 1, 0) }, (_, index) => [index, index + 1, "message"]);
    }

    if (type === "class" || type === "erd") {
        const items = type === "class" ? normalizeDiagramClasses(diagram) : normalizeDiagramEntities(diagram);
        const names = items.slice(0, 8).map(item => item.name);
        const relationships = Array.isArray(diagram.relationships) ? diagram.relationships : [];
        const connections = relationships.map(relationship => [
            findDiagramLabelIndex(names, relationship.from),
            findDiagramLabelIndex(names, relationship.to),
            type === "class" ? (relationship.type || "association") : "connector",
        ]).filter(connection => connection[0] >= 0 && connection[1] >= 0);
        return connections.length
            ? connections
            : nodes.slice(1).map((_, index) => [index, index + 1, type === "class" ? "association" : "connector"]);
    }

    return nodes.slice(1).map((_, index) => [index, index + 1, type === "class" ? "association" : "connector"]);
}

function findDiagramLabelIndex(labels, value) {
    const wanted = normalizeDiagramLabelKey(value);
    if (!wanted) return -1;
    return labels.findIndex(label => {
        const key = normalizeDiagramLabelKey(label);
        return key === wanted || key.includes(wanted) || wanted.includes(key);
    });
}

function normalizeDiagramLabelKey(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/&amp;/g, "and")
        .replace(/[_-]+/g, " ")
        .replace(/[^a-z0-9]+/g, "")
        .trim();
}

function normalizeDiagramClasses(diagram) {
    if (Array.isArray(diagram.class_details) && diagram.class_details.length) return diagram.class_details;
    return uniqueDiagramLabels(diagram.classes || []).map(name => ({
        name,
        attributes: [],
        methods: []
    }));
}

function normalizeDiagramEntities(diagram) {
    if (Array.isArray(diagram.entity_details) && diagram.entity_details.length) return diagram.entity_details;
    return uniqueDiagramLabels(diagram.entities || []).map(name => ({
        name,
        attributes: []
    }));
}

function formatClassNodeLabel(classItem) {
    const name = escapeHTML(classItem.name || "Class");
    const attributes = (classItem.attributes || ["id", "name"]).slice(0, 4).map(item => `+ ${escapeHTML(item)}`);
    const methods = (classItem.methods || ["save()", "update()"]).slice(0, 3).map(item => `+ ${escapeHTML(item)}`);
    return [name, ...attributes, ...methods].join("<br>");
}

function formatEntityNodeLabel(entityItem) {
    const name = escapeHTML(entityItem.name || "Entity");
    const attributes = (entityItem.attributes || ["id", "name", "created_at"]).slice(0, 5).map((item, index) => {
        const prefix = index === 0 ? "* " : "";
        return `${prefix}${escapeHTML(item)}`;
    });
    return [name, ...attributes].join("<br>");
}

function uniqueDiagramLabels(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
        .map(item => String(item || "").trim())
        .filter(item => {
            const key = item.toLowerCase();
            if (!item || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function enableDiagramEditingAfterGeneration() {
    diagramEditEnabled = true;
    const editor = document.getElementById("diagramEditor");
    const button = document.getElementById("diagramEditButton");
    if (editor) editor.classList.add("editing");
    document.querySelectorAll("#diagramEditor .diagram-node").forEach(node => {
        node.contentEditable = "false";
        node.dataset.textEditing = "false";
    });
    document.querySelectorAll(".tool-btn").forEach(btn => {
        btn.disabled = false;
    });
    if (button) button.textContent = "Done Editing";
}

async function attachDiagramImageForEditing(file) {
    const editor = document.getElementById("diagramEditor");
    const out = document.getElementById("umlOutputBox");
    const content = document.getElementById("umlOutputContent");
    if (!editor || !file) return;
    if (/\.(airauml|json)$/i.test(file.name)) {
        await loadDiagramProjectForEditing(file);
        return;
    }
    if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|svg)$/i.test(file.name)) {
        if (content) {
            content.style.display = "block";
            content.innerHTML = `<p>${escapeHTML(uiPhrase("Please attach a PNG, JPG, WEBP, SVG, or AIRA UML project file."))}</p>`;
        }
        return;
    }

    if (out) out.style.display = "block";
    clearProfessionalPlantUmlPreview();
    showDiagramWorkspace();
    const svg = document.getElementById("diagramConnectors");
    if (svg) clearDiagramCanvas(editor, svg);
    const dataUrl = await fileToDataUrl(file);
    setDiagramEditorBackground(dataUrl);
    resetDiagramUndoHistory();
    enableDiagramEditingAfterGeneration();
    editor.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function attachDiagramImageForGeneration(file) {
    const preview = document.getElementById("umlInlinePreview");
    const content = document.getElementById("umlOutputContent");
    if (!file) return;

    resetGeneratedUmlResult();

    if (/\.(airauml|json)$/i.test(file.name)) {
        const projectText = await file.text();
        attachedUmlSourceDiagram = {
            name: file.name,
            mimeType: "application/vnd.aira.uml+json",
            projectJson: projectText
        };
        try {
            await loadDiagramProjectForEditing(new File([projectText], file.name, { type: file.type || "application/json" }));
        } catch {
            // The source can still be used for generation even if visual editing fails.
        }
        if (preview) {
            preview.style.display = "block";
            preview.classList.remove("multi-file-preview");
            preview.innerHTML = `
                <div class="file-preview-card">
                    <div class="file-preview-icon">UML</div>
                    <div class="file-preview-info">
                        <strong>${escapeHTML(file.name)}</strong>
                        <span>Editable AIRA diagram attached as generation input.</span>
                    </div>
                </div>`;
        }
        return;
    }

    if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|svg)$/i.test(file.name)) {
        attachedUmlSourceDiagram = null;
        if (content) {
            content.style.display = "block";
            content.innerHTML = `<p>${escapeHTML(uiPhrase("Please attach a PNG, JPG, WEBP, SVG, or AIRA UML project file."))}</p>`;
        }
        return;
    }

    const isSvg = /\.svg$/i.test(file.name) || file.type === "image/svg+xml";
    const imageData = isSvg ? await svgFileToPngDataUrl(file) : await fileToDataUrl(file);
    attachedUmlSourceDiagram = {
        name: file.name,
        mimeType: isSvg ? "image/png" : (file.type || "image/png"),
        imageData
    };

    if (preview) {
        preview.style.display = "block";
        preview.classList.remove("multi-file-preview");
        preview.innerHTML = `
            <div class="file-preview-card image-preview-card">
                <img src="${imageData}" alt="">
                <div class="file-preview-info">
                    <strong>${escapeHTML(file.name)}</strong>
                    <span>Diagram input attached. It will be used for UML generation.</span>
                </div>
            </div>`;
    }
}

function setDiagramEditorBackground(dataUrl) {
    const editor = document.getElementById("diagramEditor");
    if (!editor || !dataUrl) return;
    editor.dataset.backgroundImage = dataUrl;
    editor.style.setProperty("background-image", `url("${dataUrl}")`, "important");
    editor.style.setProperty("background-repeat", "no-repeat", "important");
    editor.style.setProperty("background-position", "center", "important");
    editor.style.setProperty("background-size", "contain", "important");
    editor.classList.add("has-attached-diagram");
    diagramBackgroundImage = new Image();
    diagramBackgroundImage.src = dataUrl;
}

function restoreDiagramProjectSnapshot(project, options = {}) {
    const editor = document.getElementById("diagramEditor");
    const svg = document.getElementById("diagramConnectors");
    const out = document.getElementById("umlOutputBox");
    const content = document.getElementById("umlOutputContent");
    if (!editor || !svg || !project || !Array.isArray(project.nodes)) return;

    if (out) out.style.display = "block";
    if (document.getElementById("umlType") && project.diagramType) {
        document.getElementById("umlType").value = project.diagramType;
    }
    clearProfessionalPlantUmlPreview();
    showDiagramWorkspace();
    if (content) {
        content.style.display = "none";
        content.innerHTML = "";
    }

    clearDiagramCanvas(editor, svg);
    if (project.backgroundImage) setDiagramEditorBackground(project.backgroundImage);

    project.nodes.forEach(item => {
        const node = document.createElement("div");
        node.className = item.className || "diagram-node rectangle-node";
        if (!node.classList.contains("diagram-node")) node.classList.add("diagram-node");
        node.contentEditable = "false";
        node.dataset.textEditing = "false";
        node.style.left = `${Number(item.left) || 0}px`;
        node.style.top = `${Number(item.top) || 0}px`;
        node.innerHTML = item.html || "";
        ensureDiagramNodeId(node);
        if (item.nodeId) node.dataset.nodeId = item.nodeId;
        node.addEventListener("pointerdown", startDiagramDrag);
        node.addEventListener("click", selectDiagramNode);
        node.addEventListener("dblclick", editSelectedDiagramNode);
        node.addEventListener("contextmenu", showDiagramContextMenu);
        editor.appendChild(node);
    });

    ensureConnectorMarkers(svg);
    (project.connectors || []).forEach(item => {
        if (!item.from || !item.to) return;
        const connector = createConnectorElement(item.connectorType || "connector");
        connector.dataset.from = item.from;
        connector.dataset.to = item.to;
        if (item.routePoints) connector.dataset.routePoints = item.routePoints;
        if (item.customRoutePoints) {
            connector.dataset.customRoute = "true";
            connector.dataset.customRoutePoints = item.customRoutePoints;
        }
        if (item.fromSide) connector.dataset.fromSide = item.fromSide;
        if (item.toSide) connector.dataset.toSide = item.toSide;
        svg.appendChild(connector);
        updateConnectorLine(connector);
    });

    enableDiagramEditingAfterGeneration();
    updateAllConnectorLines();
    if (options.scroll !== false) editor.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function loadDiagramProjectForEditing(file) {
    const editor = document.getElementById("diagramEditor");
    const svg = document.getElementById("diagramConnectors");
    const out = document.getElementById("umlOutputBox");
    const content = document.getElementById("umlOutputContent");
    if (!editor || !svg) return;

    try {
        const project = JSON.parse(await file.text());
        if (project?.format !== "aira-uml-project" || !Array.isArray(project.nodes)) {
            throw new Error("Invalid AIRA UML project file.");
        }

        restoreDiagramProjectSnapshot(project);
        resetDiagramUndoHistory();
    } catch (error) {
        if (content) {
            content.style.display = "block";
            content.innerHTML = `<p>${escapeHTML(error.message || "Could not open this editable diagram file.")}</p>`;
        }
    }
}

function getSeedConnections(type, seeds) {
    if (type === "usecase") return [[0, 1], [0, 2]];
    if (type === "activity") return [[0, 1], [1, 2], [2, 3], [3, 4]];
    if (type === "erd") return [[0, 1], [1, 2]];
    return seeds.slice(1).map((_, index) => [index, index + 1]);
}

function getDiagramSeeds(type) {
    if (type === "erd") {
        return [
            { tool: "entity", label: "User<br>* user_id<br>email", left: 70, top: 70 },
            { tool: "entity", label: "Project<br>* project_id<br>title", left: 330, top: 70 },
            { tool: "entity", label: "Report<br>* report_id<br>created_at", left: 590, top: 70 },
            { tool: "relationship", label: "creates", left: 285, top: 230 }
        ];
    }
    if (type === "class") {
        return [
            { tool: "class", label: "User<br>+ email<br>+ login()", left: 70, top: 70 },
            { tool: "class", label: "Record<br>+ id<br>+ update()", left: 330, top: 70 },
            { tool: "interface", label: "&lt;&lt;interface&gt;&gt;<br>Service<br>+ process()", left: 590, top: 70 }
        ];
    }
    if (type === "sequence") {
        return [
            { tool: "lifeline", label: "User", left: 80, top: 60 },
            { tool: "lifeline", label: "Frontend", left: 300, top: 60 },
            { tool: "lifeline", label: "Backend", left: 520, top: 60 },
            { tool: "lifeline", label: "Database", left: 740, top: 60 }
        ];
    }
    if (type === "activity") {
        return [
            { tool: "start-node", label: "", left: 390, top: 45 },
            { tool: "action", label: "Submit Request", left: 330, top: 120 },
            { tool: "decision", label: "Valid?", left: 350, top: 215 },
            { tool: "action", label: "Save Result", left: 330, top: 325 },
            { tool: "end-node", label: "", left: 390, top: 420 }
        ];
    }

    return [
        { tool: "actor", label: "User", left: 70, top: 80 },
        { tool: "usecase", label: "Login", left: 270, top: 80 },
        { tool: "usecase", label: "Generate Diagram", left: 520, top: 80 },
        { tool: "system-boundary", label: "System Boundary", left: 230, top: 205 }
    ];
}

function addInitialDiagramNode(tool, label, left, top) {
    const editor = document.getElementById("diagramEditor");
    if (!editor) return;

    const node = document.createElement("div");
    node.className = `diagram-node ${getDiagramNodeClass(tool)}`;
    node.contentEditable = "false";
    ensureDiagramNodeId(node);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.innerHTML = label;
    node.addEventListener("pointerdown", startDiagramDrag);
    node.addEventListener("click", selectDiagramNode);
    node.addEventListener("dblclick", editSelectedDiagramNode);
    node.addEventListener("contextmenu", showDiagramContextMenu);
    editor.appendChild(node);
}

function addConnectorBetweenNodes(fromIndex, toIndex, type = "connector") {
    const editor = document.getElementById("diagramEditor");
    const svg = document.getElementById("diagramConnectors");
    if (!editor || !svg) return;
    ensureConnectorMarkers(svg);

    const nodes = editor.querySelectorAll(".diagram-node");
    if (!nodes[fromIndex] || !nodes[toIndex]) return;

    const line = createConnectorElement(type);
    line.dataset.from = ensureDiagramNodeId(nodes[fromIndex]);
    line.dataset.to = ensureDiagramNodeId(nodes[toIndex]);
    delete line.dataset.customRoute;
    delete line.dataset.customRoutePoints;
    delete line.dataset.customBend;
    delete line.dataset.offsetX;
    delete line.dataset.offsetY;
    svg.appendChild(line);
    updateConnectorLine(line);
}

function selectDiagramTool(tool, button) {
    if (!diagramEditEnabled && tool !== "select") return;

    selectedDiagramTool = tool;
    connectorStartNode = null;

    document.querySelectorAll(".tool-btn").forEach(btn => {
        btn.classList.remove("active");
    });

    if (button) button.classList.add("active");
    updateConnectorHint();
}

function addDiagramElement(event) {
    if (!diagramEditEnabled) return;

    const editor = document.getElementById("diagramEditor");
    const svg = document.getElementById("diagramConnectors");
    if (!editor || (event.target !== editor && event.target !== svg)) return;
    if (selectedDiagramTool === "select") return;
    if (isDiagramConnectorTool(selectedDiagramTool)) return;

    const rect = editor.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    pushDiagramUndoState();
    addDiagramToolAt(selectedDiagramTool, x, y);
}

function dragDiagramTool(event, tool) {
    if (!diagramEditEnabled || tool === "select") {
        event.preventDefault();
        return;
    }

    event.dataTransfer.setData("text/plain", tool);
}

function allowDiagramDrop(event) {
    if (!diagramEditEnabled) return;
    event.preventDefault();
}

function dropDiagramTool(event) {
    if (!diagramEditEnabled) return;
    event.preventDefault();

    const editor = document.getElementById("diagramEditor");
    if (!editor) return;

    const tool = event.dataTransfer.getData("text/plain");
    if (!tool || tool === "select") return;
    if (isDiagramConnectorTool(tool)) {
        selectedDiagramTool = tool;
        updateConnectorHint();
        return;
    }

    const rect = editor.getBoundingClientRect();
    pushDiagramUndoState();
    addDiagramToolAt(tool, event.clientX - rect.left, event.clientY - rect.top);
}

function addDiagramToolAt(tool, x, y) {
    const editor = document.getElementById("diagramEditor");
    if (!editor) return;

    if (tool === "connector" || tool === "message") {
        updateConnectorHint();
        return;
    }

    const node = document.createElement("div");
    node.className = `diagram-node ${getDiagramNodeClass(tool)}`;
    node.contentEditable = "false";
    ensureDiagramNodeId(node);
    node.style.left = `${Math.max(12, x - 55)}px`;
    node.style.top = `${Math.max(12, y - 22)}px`;
    node.innerHTML = getDiagramNodeLabel(tool);
    node.addEventListener("pointerdown", startDiagramDrag);
    node.addEventListener("click", selectDiagramNode);
    node.addEventListener("dblclick", editSelectedDiagramNode);
    node.addEventListener("contextmenu", showDiagramContextMenu);
    editor.appendChild(node);
    diagramElementCount += 1;
}

function getDiagramNodeLabel(tool) {
    if (tool === "class") return `Class${diagramElementCount}<br>+ attribute<br>+ method()`;
    if (tool === "interface") return `&lt;&lt;interface&gt;&gt;<br>Service${diagramElementCount}<br>+ operation()`;
    if (tool === "package") return `Package ${diagramElementCount}`;
    if (tool === "frame") return `Frame ${diagramElementCount}`;
    if (tool === "association") return "Association";
    if (tool === "dependency") return "Dependency";
    if (tool === "inheritance") return "Inheritance";
    if (tool === "aggregation") return "Aggregation";
    if (tool === "composition") return "Composition";
    if (tool === "lifeline") return `Object ${diagramElementCount}`;
    if (tool === "activation") return "";
    if (tool === "return-message") return "Return";
    if (tool === "alt-fragment") return "alt";
    if (tool === "loop-fragment") return "loop";
    if (tool === "start-node") return "";
    if (tool === "action") return `Action ${diagramElementCount}`;
    if (tool === "decision") return "Decision";
    if (tool === "fork-join") return "";
    if (tool === "swimlane") return `Swimlane ${diagramElementCount}`;
    if (tool === "merge") return "Merge";
    if (tool === "object-node") return `Object ${diagramElementCount}`;
    if (tool === "end-node") return "";
    if (tool === "entity") return `Entity ${diagramElementCount}`;
    if (tool === "table") return `Table${diagramElementCount}<br>PK id<br>FK user_id`;
    if (tool === "primary-key") return "PK";
    if (tool === "foreign-key") return "FK";
    if (tool === "attribute") return "Attribute";
    if (tool === "relationship") return "Relationship";
    if (tool === "weak-entity") return `Weak Entity ${diagramElementCount}`;
    if (tool === "cardinality") return "1..*";
    if (tool === "usecase") return `Use Case ${diagramElementCount}`;
    if (tool === "system-boundary") return "System Boundary";
    if (tool === "include") return "&lt;&lt;include&gt;&gt;";
    if (tool === "extend") return "&lt;&lt;extend&gt;&gt;";
    if (tool === "actor") return "Actor";
    if (tool === "note") return "Note";
    if (tool === "text") return "Label";
    return "Element";
}

function getDiagramNodeClass(tool) {
    const classMap = {
        actor: "actor-node",
        usecase: "usecase-node",
        "system-boundary": "system-boundary-node",
        class: "class-node",
        interface: "interface-node",
        package: "package-node",
        frame: "system-boundary-node",
        association: "text-node",
        dependency: "text-node",
        inheritance: "relationship-node",
        aggregation: "relationship-node",
        composition: "relationship-node",
        lifeline: "lifeline-node",
        activation: "activation-node",
        "return-message": "text-node",
        "alt-fragment": "system-boundary-node",
        "loop-fragment": "system-boundary-node",
        "start-node": "start-node",
        action: "action-node",
        decision: "decision-node",
        "fork-join": "fork-join-node",
        swimlane: "swimlane-node",
        merge: "decision-node",
        "object-node": "action-node",
        "end-node": "end-node",
        entity: "entity-node",
        table: "entity-node",
        "primary-key": "attribute-node",
        "foreign-key": "attribute-node",
        attribute: "attribute-node",
        relationship: "relationship-node",
        "weak-entity": "weak-entity-node",
        cardinality: "text-node",
        include: "text-node",
        extend: "text-node",
        note: "note-node",
        text: "text-node"
    };

    return classMap[tool] || "rectangle-node";
}

function addConnector(editor, type = "connector") {
    const nodes = editor.querySelectorAll(".diagram-node");
    const svg = document.getElementById("diagramConnectors");
    if (!svg || nodes.length < 2) return;
    ensureConnectorMarkers(svg);

    const line = createConnectorElement(type);
    line.dataset.from = ensureDiagramNodeId(nodes[nodes.length - 2]);
    line.dataset.to = ensureDiagramNodeId(nodes[nodes.length - 1]);
    svg.appendChild(line);
    updateConnectorLine(line);
}

function addConnectorBetweenElements(fromNode, toNode, type = "connector") {
    const editor = document.getElementById("diagramEditor");
    const svg = document.getElementById("diagramConnectors");
    if (!editor || !svg || !fromNode || !toNode || fromNode === toNode) return;
    ensureConnectorMarkers(svg);

    const line = createConnectorElement(type);
    line.dataset.from = ensureDiagramNodeId(fromNode);
    line.dataset.to = ensureDiagramNodeId(toNode);
    delete line.dataset.customRoute;
    delete line.dataset.customRoutePoints;
    delete line.dataset.customBend;
    delete line.dataset.offsetX;
    delete line.dataset.offsetY;
    svg.appendChild(line);
    updateConnectorLine(line);
}

function ensureConnectorMarkers(svg) {
    if (svg.querySelector("#airaConnectorMarkers")) return;

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.setAttribute("id", "airaConnectorMarkers");

    const markers = [
        {
            id: "aira-arrow",
            fill: "#28415f",
            stroke: "#28415f",
            path: "M 0 0 L 10 5 L 0 10 z"
        },
        {
            id: "aira-triangle",
            fill: "#ffffff",
            stroke: "#28415f",
            path: "M 0 0 L 10 5 L 0 10 z"
        },
        {
            id: "aira-diamond",
            fill: "#ffffff",
            stroke: "#28415f",
            path: "M 0 5 L 5 0 L 10 5 L 5 10 z"
        },
        {
            id: "aira-diamond-filled",
            fill: "#28415f",
            stroke: "#28415f",
            path: "M 0 5 L 5 0 L 10 5 L 5 10 z"
        }
    ];

    markers.forEach(markerConfig => {
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        marker.setAttribute("id", markerConfig.id);
        marker.setAttribute("markerWidth", "10");
        marker.setAttribute("markerHeight", "10");
        marker.setAttribute("refX", "9");
        marker.setAttribute("refY", "5");
        marker.setAttribute("orient", "auto");
        marker.setAttribute("markerUnits", "strokeWidth");

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", markerConfig.path);
        path.setAttribute("fill", markerConfig.fill);
        path.setAttribute("stroke", markerConfig.stroke);
        path.setAttribute("stroke-width", "1.2");
        marker.appendChild(path);
        defs.appendChild(marker);
    });

    svg.prepend(defs);
}

function createConnectorElement(type = "connector") {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const dashedTypes = new Set(["message", "return-message", "dependency", "include", "extend"]);
    const classNames = ["connector-line", `${type}-line`];
    if (dashedTypes.has(type)) classNames.push("message-line");
    path.setAttribute("class", classNames.join(" "));
    if (["message", "return-message", "dependency", "include", "extend"].includes(type)) {
        path.setAttribute("marker-end", "url(#aira-arrow)");
    }
    if (type === "inheritance") {
        path.setAttribute("marker-end", "url(#aira-triangle)");
    }
    if (type === "aggregation") {
        path.setAttribute("marker-start", "url(#aira-diamond)");
    }
    if (type === "composition") {
        path.setAttribute("marker-start", "url(#aira-diamond-filled)");
    }
    path.dataset.connectorType = type;
    path.addEventListener("click", selectDiagramConnector);
    path.addEventListener("pointerdown", startConnectorDrag);
    path.addEventListener("contextmenu", showDiagramContextMenu);
    return path;
}

function ensureDiagramNodeId(node) {
    if (!node.dataset.nodeId) {
        node.dataset.nodeId = `diagram-node-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    }
    return node.dataset.nodeId;
}

function updateAllConnectorLines() {
    document.querySelectorAll("#diagramConnectors .connector-line").forEach(updateConnectorLine);
    if (selectedDiagramConnector) renderConnectorHandles(selectedDiagramConnector);
}

function updateConnectorLine(line) {
    const editor = document.getElementById("diagramEditor");
    if (!editor || !line?.dataset?.from || !line?.dataset?.to) return;

    const fromNode = document.querySelector(`[data-node-id="${line.dataset.from}"]`);
    const toNode = document.querySelector(`[data-node-id="${line.dataset.to}"]`);
    if (!fromNode || !toNode) return;

    ensureDiagramSvgCoversContent(editor);
    const first = fromNode.getBoundingClientRect();
    const second = toNode.getBoundingClientRect();
    const area = editor.getBoundingClientRect();
    const endpoints = getConnectorEdgePoints(first, second, area, line);
    const route = buildConnectorRoute(line, endpoints);
    const middlePoint = route[Math.floor(route.length / 2)] || route[0];

    line.setAttribute("d", connectorRouteToPath(route));
    line.dataset.routePoints = JSON.stringify(route);
    line.dataset.x1 = endpoints.x1;
    line.dataset.y1 = endpoints.y1;
    line.dataset.x2 = endpoints.x2;
    line.dataset.y2 = endpoints.y2;
    line.dataset.midX = middlePoint.x;
    line.dataset.midY = middlePoint.y;
    if (line.classList.contains("selected")) renderConnectorHandles(line);
}

function ensureDiagramSvgCoversContent(editor) {
    const svg = document.getElementById("diagramConnectors");
    if (!editor || !svg) return;
    let maxRight = Math.max(editor.clientWidth, 1200);
    let maxBottom = Math.max(editor.clientHeight, 760);

    editor.querySelectorAll(".diagram-node").forEach(node => {
        const right = (parseInt(node.style.left, 10) || 0) + node.offsetWidth + 140;
        const bottom = (parseInt(node.style.top, 10) || 0) + node.offsetHeight + 140;
        maxRight = Math.max(maxRight, right);
        maxBottom = Math.max(maxBottom, bottom);
    });

    svg.style.width = `${maxRight}px`;
    svg.style.height = `${maxBottom}px`;
}

function buildConnectorRoute(connector, endpoints) {
    const start = { x: endpoints.x1, y: endpoints.y1 };
    const end = { x: endpoints.x2, y: endpoints.y2 };
    let rawRoute = null;

    if (connector.dataset.customRoute === "true") {
        rawRoute = parseConnectorRoute(connector.dataset.customRoutePoints);
    }

    if (!rawRoute || rawRoute.length < 2) {
        const offsetX = Number(connector.dataset.offsetX || 0);
        const offsetY = Number(connector.dataset.offsetY || 0);
        const midX = connector.dataset.customBend === "true"
            ? Number(connector.dataset.midX || ((start.x + end.x) / 2))
            : (start.x + end.x) / 2 + offsetX;
        const midY = connector.dataset.customBend === "true"
            ? Number(connector.dataset.midY || ((start.y + end.y) / 2))
            : (start.y + end.y) / 2 + offsetY;

        rawRoute = [
            start,
            { x: midX, y: start.y },
            { x: midX, y: midY },
            { x: end.x, y: midY },
            end
        ];
    } else {
        rawRoute[0] = start;
        rawRoute[rawRoute.length - 1] = end;
    }

    return normalizeConnectorRoute(orthogonalizeConnectorRoute(rawRoute));
}

function parseConnectorRoute(value) {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return null;
        const points = parsed
            .map(point => ({ x: Number(point.x), y: Number(point.y) }))
            .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
        return points.length >= 2 ? points : null;
    } catch {
        return null;
    }
}

function connectorRouteToPath(route) {
    if (!route.length) return "";
    return route
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");
}

function orthogonalizeConnectorRoute(points) {
    if (points.length < 2) return points;
    const route = [{ ...points[0] }];

    points.slice(1).forEach(point => {
        const last = route[route.length - 1];
        const next = { ...point };
        const sameX = Math.abs(last.x - next.x) <= CONNECTOR_MERGE_TOLERANCE;
        const sameY = Math.abs(last.y - next.y) <= CONNECTOR_MERGE_TOLERANCE;

        if (!sameX && !sameY) {
            route.push({ x: next.x, y: last.y });
        }
        route.push(next);
    });

    return route;
}

function normalizeConnectorRoute(points) {
    let route = points.map(point => ({
        x: Math.round(point.x * 10) / 10,
        y: Math.round(point.y * 10) / 10
    }));
    let changed = true;

    while (changed) {
        changed = false;
        route = route.reduce((cleaned, point) => {
            const previous = cleaned[cleaned.length - 1];
            if (!previous) return [point];

            if (Math.abs(previous.x - point.x) <= CONNECTOR_MERGE_TOLERANCE) point.x = previous.x;
            if (Math.abs(previous.y - point.y) <= CONNECTOR_MERGE_TOLERANCE) point.y = previous.y;

            if (Math.abs(previous.x - point.x) <= CONNECTOR_MERGE_TOLERANCE &&
                Math.abs(previous.y - point.y) <= CONNECTOR_MERGE_TOLERANCE) {
                changed = true;
                return cleaned;
            }

            cleaned.push(point);
            return cleaned;
        }, []);

        for (let index = 1; index < route.length - 1; index += 1) {
            const previous = route[index - 1];
            const current = route[index];
            const next = route[index + 1];
            const sameVerticalLine = Math.abs(previous.x - current.x) <= CONNECTOR_MERGE_TOLERANCE &&
                Math.abs(current.x - next.x) <= CONNECTOR_MERGE_TOLERANCE;
            const sameHorizontalLine = Math.abs(previous.y - current.y) <= CONNECTOR_MERGE_TOLERANCE &&
                Math.abs(current.y - next.y) <= CONNECTOR_MERGE_TOLERANCE;

            if (sameVerticalLine || sameHorizontalLine) {
                route.splice(index, 1);
                changed = true;
                break;
            }
        }
    }

    return route;
}

function getDiagramPointerPoint(event) {
    const editor = document.getElementById("diagramEditor");
    if (!editor) return { x: 0, y: 0 };
    const rect = editor.getBoundingClientRect();
    return {
        x: event.clientX - rect.left + editor.scrollLeft,
        y: event.clientY - rect.top + editor.scrollTop
    };
}

function setConnectorCustomRoute(connector, route) {
    connector.dataset.customRoute = "true";
    connector.dataset.customRoutePoints = JSON.stringify(route);
    connector.dataset.customBend = "true";
}

function getCurrentConnectorRoute(connector) {
    return parseConnectorRoute(connector.dataset.routePoints) || [];
}

function getNearestConnectorSegment(route, point) {
    if (route.length < 2) return 0;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < route.length - 1; index += 1) {
        const distance = getPointToSegmentDistance(point, route[index], route[index + 1]);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
        }
    }

    return nearestIndex;
}

function getPointToSegmentDistance(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function getConnectorEdgePoints(first, second, area, connector = null) {
    const editor = document.getElementById("diagramEditor");
    const scrollLeft = editor?.scrollLeft || 0;
    const scrollTop = editor?.scrollTop || 0;
    const a = {
        left: first.left - area.left + scrollLeft,
        top: first.top - area.top + scrollTop,
        width: first.width,
        height: first.height
    };
    const b = {
        left: second.left - area.left + scrollLeft,
        top: second.top - area.top + scrollTop,
        width: second.width,
        height: second.height
    };
    const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
    const bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    const dx = bc.x - ac.x;
    const dy = bc.y - ac.y;
    const fromAuto = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
    const toAuto = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "left" : "right") : (dy >= 0 ? "top" : "bottom");
    const fromSide = connector?.dataset?.fromSide || fromAuto;
    const toSide = connector?.dataset?.toSide || toAuto;
    const start = getSidePoint(a, fromSide);
    const end = getSidePoint(b, toSide);

    return {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y
    };
}

function getSidePoint(box, side) {
    const centerX = box.left + box.width / 2;
    const centerY = box.top + box.height / 2;
    if (side === "left") return { x: box.left, y: centerY };
    if (side === "right") return { x: box.left + box.width, y: centerY };
    if (side === "top") return { x: centerX, y: box.top };
    return { x: centerX, y: box.top + box.height };
}

function getNearestSide(node, clientX, clientY) {
    const rect = node.getBoundingClientRect();
    const distances = [
        { side: "left", value: Math.abs(clientX - rect.left) },
        { side: "right", value: Math.abs(clientX - rect.right) },
        { side: "top", value: Math.abs(clientY - rect.top) },
        { side: "bottom", value: Math.abs(clientY - rect.bottom) }
    ];
    distances.sort((a, b) => a.value - b.value);
    return distances[0].side;
}

function getDiagramNodeAtClientPoint(clientX, clientY) {
    const directNode = document.elementsFromPoint(clientX, clientY)
        .find(element => element?.classList?.contains("diagram-node"));
    if (directNode) return directNode;

    let nearestNode = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    document.querySelectorAll("#diagramEditor .diagram-node").forEach(node => {
        const rect = node.getBoundingClientRect();
        const padded = {
            left: rect.left - 28,
            right: rect.right + 28,
            top: rect.top - 28,
            bottom: rect.bottom + 28
        };
        if (clientX < padded.left || clientX > padded.right || clientY < padded.top || clientY > padded.bottom) return;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(clientX - centerX, clientY - centerY);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestNode = node;
        }
    });
    return nearestNode;
}

function reconnectConnectorEndpoint(connector, role, pointerEvent) {
    if (!connector || !pointerEvent) return;
    const targetNode = getDiagramNodeAtClientPoint(pointerEvent.clientX, pointerEvent.clientY);
    if (!targetNode) {
        updateConnectorLine(connector);
        renderConnectorHandles(connector);
        return;
    }

    const targetId = ensureDiagramNodeId(targetNode);
    if (role === "start") {
        if (targetId === connector.dataset.to) return;
        connector.dataset.from = targetId;
        connector.dataset.fromSide = getNearestSide(targetNode, pointerEvent.clientX, pointerEvent.clientY);
    } else {
        if (targetId === connector.dataset.from) return;
        connector.dataset.to = targetId;
        connector.dataset.toSide = getNearestSide(targetNode, pointerEvent.clientX, pointerEvent.clientY);
    }

    delete connector.dataset.customRoute;
    delete connector.dataset.customRoutePoints;
    delete connector.dataset.customBend;
    delete connector.dataset.offsetX;
    delete connector.dataset.offsetY;
    updateConnectorLine(connector);
    renderConnectorHandles(connector);
}

function handleConnectorNodeClick(node) {
    if (!isDiagramConnectorTool(selectedDiagramTool)) return false;

    if (!connectorStartNode) {
        connectorStartNode = node;
        setSelectedDiagramNode(node);
        node.classList.add("connector-start");
        updateConnectorHint("Now click the shape you want to connect to.");
        return true;
    }

    if (connectorStartNode === node) {
        connectorStartNode.classList.remove("connector-start");
        connectorStartNode = null;
        updateConnectorHint();
        return true;
    }

    pushDiagramUndoState();
    addConnectorBetweenElements(connectorStartNode, node, selectedDiagramTool);
    connectorStartNode.classList.remove("connector-start");
    connectorStartNode = null;
    setSelectedDiagramNode(node);
    updateConnectorHint("Connector added. Click another first shape, or choose Select.");
    return true;
}

function updateConnectorHint(text) {
    document.querySelectorAll(".connector-hint").forEach(hint => hint.remove());
}

function startDiagramDrag(event) {
    if (!diagramEditEnabled || selectedDiagramTool !== "select") return;

    const node = event.currentTarget;
    if (node.dataset.textEditing === "true") return;
    if (document.activeElement?.classList?.contains("diagram-node")) {
        stopDiagramNodeTextEditing({ currentTarget: document.activeElement });
        document.activeElement.blur();
    }
    setSelectedDiagramNode(node);
    const editor = document.getElementById("diagramEditor");
    if (!editor) return;
    pushDiagramUndoState();

    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = parseInt(node.style.left, 10) || 0;
    const startTop = parseInt(node.style.top, 10) || 0;

    function moveNode(moveEvent) {
        node.style.left = `${startLeft + moveEvent.clientX - startX}px`;
        node.style.top = `${startTop + moveEvent.clientY - startY}px`;
        updateAllConnectorLines();
    }

    function stopMove() {
        window.removeEventListener("pointermove", moveNode);
        window.removeEventListener("pointerup", stopMove);
    }

    window.addEventListener("pointermove", moveNode);
    window.addEventListener("pointerup", stopMove);
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".diagram-node").forEach(node => {
        node.addEventListener("pointerdown", startDiagramDrag);
        node.addEventListener("click", selectDiagramNode);
        node.addEventListener("dblclick", editSelectedDiagramNode);
        node.addEventListener("contextmenu", showDiagramContextMenu);
        node.contentEditable = "false";
    });

    document.querySelectorAll(".tool-btn").forEach(btn => {
        btn.disabled = !btn.textContent.includes("Select");
    });
});

function selectDiagramNode(event) {
    if (!diagramEditEnabled) return;
    event.stopPropagation();
    if (handleConnectorNodeClick(event.currentTarget)) return;
    if (event.currentTarget.dataset.textEditing !== "true") {
        event.currentTarget.contentEditable = "false";
    }
    setSelectedDiagramNode(event.currentTarget);
}

function selectDiagramConnector(event) {
    if (!diagramEditEnabled) return;
    event.stopPropagation();
    setSelectedDiagramConnector(event.currentTarget);
}

function startConnectorDrag(event) {
    if (!diagramEditEnabled || selectedDiagramTool !== "select") return;

    const connector = event.currentTarget;
    setSelectedDiagramConnector(connector);
    pushDiagramUndoState();
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startRoute = getCurrentConnectorRoute(connector);
    const insertAfter = getNearestConnectorSegment(startRoute, getDiagramPointerPoint(event));
    let inserted = false;
    let workingRoute = startRoute.map(point => ({ ...point }));

    function moveConnector(moveEvent) {
        if (Math.abs(moveEvent.clientX - startX) < 3 && Math.abs(moveEvent.clientY - startY) < 3) return;
        const point = getDiagramPointerPoint(moveEvent);
        if (!inserted) {
            workingRoute.splice(insertAfter + 1, 0, point);
            inserted = true;
        } else {
            workingRoute[insertAfter + 1] = point;
        }
        setConnectorCustomRoute(connector, workingRoute);
        updateConnectorLine(connector);
    }

    function stopConnectorMove() {
        window.removeEventListener("pointermove", moveConnector);
        window.removeEventListener("pointerup", stopConnectorMove);
    }

    window.addEventListener("pointermove", moveConnector);
    window.addEventListener("pointerup", stopConnectorMove);
}

function showDiagramContextMenu(event) {
    if (!diagramEditEnabled) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.classList.contains("connector-line")) {
        setSelectedDiagramConnector(event.currentTarget);
    } else {
        setSelectedDiagramNode(event.currentTarget);
    }

    const menu = document.getElementById("diagramContextMenu");
    const workspace = document.querySelector(".diagram-workspace");
    if (!menu || !workspace) return;

    const bounds = workspace.getBoundingClientRect();
    menu.style.left = `${event.clientX - bounds.left}px`;
    menu.style.top = `${event.clientY - bounds.top}px`;
    menu.classList.add("show");
}

function hideDiagramContextMenu() {
    const menu = document.getElementById("diagramContextMenu");
    if (menu) menu.classList.remove("show");
}

function setSelectedDiagramNode(node) {
    if (selectedDiagramNode) {
        selectedDiagramNode.classList.remove("selected");
    }
    if (selectedDiagramConnector) {
        selectedDiagramConnector.classList.remove("selected");
        selectedDiagramConnector = null;
    }
    clearConnectorHandles();

    selectedDiagramNode = node;

    if (selectedDiagramNode) {
        selectedDiagramNode.classList.add("selected");
    }
}

function setSelectedDiagramConnector(connector) {
    if (selectedDiagramConnector) {
        selectedDiagramConnector.classList.remove("selected");
    }
    if (selectedDiagramNode) {
        selectedDiagramNode.classList.remove("selected");
        selectedDiagramNode = null;
    }

    selectedDiagramConnector = connector;

    if (selectedDiagramConnector) {
        selectedDiagramConnector.classList.add("selected");
        renderConnectorHandles(selectedDiagramConnector);
    } else {
        clearConnectorHandles();
    }
}

function clearConnectorHandles() {
    const svg = document.getElementById("diagramConnectors");
    if (!svg) return;
    svg.querySelectorAll(".connector-handle, .connector-handle-line").forEach(handle => handle.remove());
}

function renderConnectorHandles(connector) {
    const svg = document.getElementById("diagramConnectors");
    if (!svg || !connector) return;
    clearConnectorHandles();

    const route = getCurrentConnectorRoute(connector);
    if (route.length < 2) return;

    route.forEach((point, index) => {
        const role = index === 0 ? "start" : (index === route.length - 1 ? "end" : "route-point");
        addConnectorHandle(svg, role, point.x, point.y, index);
    });

    for (let index = 0; index < route.length - 1; index += 1) {
        const start = route[index];
        const end = route[index + 1];
        addConnectorHandle(svg, "segment", (start.x + end.x) / 2, (start.y + end.y) / 2, null, index);
    }
}

function addConnectorHandle(svg, role, x, y, routeIndex = null, segmentIndex = null) {
    const handle = document.createElementNS("http://www.w3.org/2000/svg", role === "start" || role === "end" ? "circle" : "rect");
    handle.setAttribute("class", `connector-handle connector-handle-${role}`);
    handle.dataset.role = role;
    if (routeIndex !== null) handle.dataset.routeIndex = String(routeIndex);
    if (segmentIndex !== null) handle.dataset.segmentIndex = String(segmentIndex);
    if (role === "start" || role === "end") {
        handle.setAttribute("cx", x);
        handle.setAttribute("cy", y);
        handle.setAttribute("r", 6);
    } else {
        const size = role === "segment" ? 8 : 10;
        handle.setAttribute("x", x - size / 2);
        handle.setAttribute("y", y - size / 2);
        handle.setAttribute("width", size);
        handle.setAttribute("height", size);
    }
    handle.addEventListener("pointerdown", startConnectorHandleDrag);
    svg.appendChild(handle);
}

function startConnectorHandleDrag(event) {
    if (!diagramEditEnabled || !selectedDiagramConnector) return;
    event.preventDefault();
    event.stopPropagation();

    const role = event.currentTarget.dataset.role;
    const connector = selectedDiagramConnector;
    const routeIndex = Number(event.currentTarget.dataset.routeIndex);
    const segmentIndex = Number(event.currentTarget.dataset.segmentIndex);
    const startRoute = getCurrentConnectorRoute(connector).map(point => ({ ...point }));
    let workingRoute = startRoute.map(point => ({ ...point }));
    let insertedSegmentPoint = false;
    let lastPointerEvent = event;
    pushDiagramUndoState();

    function moveHandle(moveEvent) {
        lastPointerEvent = moveEvent;
        const point = getDiagramPointerPoint(moveEvent);
        if (role === "start" || role === "end") {
            const nodeId = role === "start" ? connector.dataset.from : connector.dataset.to;
            const node = document.querySelector(`[data-node-id="${nodeId}"]`);
            if (node) {
                const side = getNearestSide(node, moveEvent.clientX, moveEvent.clientY);
                if (role === "start") connector.dataset.fromSide = side;
                else connector.dataset.toSide = side;
            }
        } else if (role === "segment" && Number.isFinite(segmentIndex)) {
            if (!insertedSegmentPoint) {
                workingRoute.splice(segmentIndex + 1, 0, point);
                insertedSegmentPoint = true;
            } else {
                workingRoute[segmentIndex + 1] = point;
            }
            setConnectorCustomRoute(connector, workingRoute);
        } else if (Number.isFinite(routeIndex) && routeIndex > 0 && routeIndex < workingRoute.length - 1) {
            workingRoute[routeIndex] = point;
            setConnectorCustomRoute(connector, workingRoute);
        }
        updateConnectorLine(connector);
        renderConnectorHandles(connector);
    }

    function stopHandleMove() {
        window.removeEventListener("pointermove", moveHandle);
        window.removeEventListener("pointerup", stopHandleMove);
        if (role === "start" || role === "end") {
            reconnectConnectorEndpoint(connector, role, lastPointerEvent);
        }
    }

    window.addEventListener("pointermove", moveHandle);
    window.addEventListener("pointerup", stopHandleMove);
}

function deleteSelectedDiagramNode() {
    if (!diagramEditEnabled) return;

    if (selectedDiagramConnector) {
        pushDiagramUndoState();
        selectedDiagramConnector.remove();
        selectedDiagramConnector = null;
        clearConnectorHandles();
        hideDiagramContextMenu();
        return;
    }

    if (!selectedDiagramNode) return;

    pushDiagramUndoState();
    const nodeId = selectedDiagramNode.dataset.nodeId;
    if (nodeId) {
        document.querySelectorAll("#diagramConnectors .connector-line").forEach(line => {
            if (line.dataset.from === nodeId || line.dataset.to === nodeId) line.remove();
        });
    }
    if (connectorStartNode === selectedDiagramNode) connectorStartNode = null;
    selectedDiagramNode.remove();
    selectedDiagramNode = null;
    updateConnectorHint();
    hideDiagramContextMenu();
}

function editSelectedDiagramNode() {
    if (!diagramEditEnabled) return;

    if (selectedDiagramConnector) {
        renderConnectorHandles(selectedDiagramConnector);
        hideDiagramContextMenu();
        return;
    }

    if (!selectedDiagramNode) return;

    pushDiagramUndoState();
    selectedDiagramNode.dataset.textEditing = "true";
    selectedDiagramNode.contentEditable = "true";
    selectedDiagramNode.focus();
    placeCaretAtEnd(selectedDiagramNode);
    selectedDiagramNode.addEventListener("blur", stopDiagramNodeTextEditing, { once: true });
    hideDiagramContextMenu();
}

function stopDiagramNodeTextEditing(event) {
    const node = event.currentTarget;
    if (!node) return;
    node.dataset.textEditing = "false";
    node.contentEditable = "false";
    updateAllConnectorLines();
}

function placeCaretAtEnd(node) {
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
}

function isEditingDiagramNodeText(target) {
    const active = target || document.activeElement;
    const node = active?.closest?.(".diagram-node");
    return Boolean(node && node.isContentEditable && (node.dataset.textEditing === "true" || active === document.activeElement));
}

function isTypingInFormControl(target) {
    const tagName = target?.tagName;
    return Boolean(
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT"
    );
}

function duplicateSelectedDiagramNode() {
    if (!diagramEditEnabled) return;

    if (selectedDiagramConnector) {
        pushDiagramUndoState();
        copySelectedDiagramItem();
        pasteDiagramItem();
        hideDiagramContextMenu();
        return;
    }

    if (!selectedDiagramNode) return;

    const editor = document.getElementById("diagramEditor");
    if (!editor) return;
    pushDiagramUndoState();

    const clone = selectedDiagramNode.cloneNode(true);
    const left = parseInt(selectedDiagramNode.style.left, 10) || 0;
    const top = parseInt(selectedDiagramNode.style.top, 10) || 0;

    clone.style.left = `${left + 24}px`;
    clone.style.top = `${top + 24}px`;
    clone.contentEditable = "false";
    clone.dataset.textEditing = "false";
    clone.classList.remove("selected");
    clone.classList.remove("connector-start");
    delete clone.dataset.nodeId;
    ensureDiagramNodeId(clone);
    clone.addEventListener("pointerdown", startDiagramDrag);
    clone.addEventListener("click", selectDiagramNode);
    clone.addEventListener("dblclick", editSelectedDiagramNode);
    clone.addEventListener("contextmenu", showDiagramContextMenu);

    editor.appendChild(clone);
    setSelectedDiagramNode(clone);
    hideDiagramContextMenu();
}

function bringSelectedDiagramNodeFront() {
    if (!diagramEditEnabled) return;

    if (selectedDiagramConnector) {
        const svg = document.getElementById("diagramConnectors");
        if (!svg) return;
        pushDiagramUndoState();
        svg.appendChild(selectedDiagramConnector);
        renderConnectorHandles(selectedDiagramConnector);
        hideDiagramContextMenu();
        return;
    }

    if (!selectedDiagramNode) return;

    const editor = document.getElementById("diagramEditor");
    if (!editor) return;

    pushDiagramUndoState();
    editor.appendChild(selectedDiagramNode);
    hideDiagramContextMenu();
}

document.addEventListener("keydown", event => {
    if (!diagramEditEnabled) return;
    if (isEditingDiagramNodeText(event.target)) return;
    if (isTypingInFormControl(event.target)) return;

    const isCopy = event.ctrlKey && event.key.toLowerCase() === "c";
    const isCut = event.ctrlKey && event.key.toLowerCase() === "x";
    const isPaste = event.ctrlKey && event.key.toLowerCase() === "v";
    const isUndo = event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "z";

    if (isUndo) {
        event.preventDefault();
        undoDiagramChange();
        return;
    }

    if (isCopy || isCut) {
        if (!selectedDiagramNode && !selectedDiagramConnector) return;
        event.preventDefault();
        copySelectedDiagramItem();
        if (isCut) deleteSelectedDiagramNode();
        return;
    }

    if (isPaste) {
        event.preventDefault();
        pushDiagramUndoState();
        pasteDiagramItem();
        return;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selectedDiagramNode) {
        event.preventDefault();
        pushDiagramUndoState();
        nudgeSelectedDiagramNode(event.key, event.shiftKey ? 10 : 2);
        return;
    }

    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (!selectedDiagramNode && !selectedDiagramConnector) return;

    event.preventDefault();
    deleteSelectedDiagramNode();
});

function copySelectedDiagramItem() {
    if (selectedDiagramNode) {
        diagramClipboard = {
            kind: "node",
            className: selectedDiagramNode.className,
            html: selectedDiagramNode.innerHTML,
            left: parseInt(selectedDiagramNode.style.left, 10) || 0,
            top: parseInt(selectedDiagramNode.style.top, 10) || 0
        };
        return;
    }

    if (selectedDiagramConnector) {
        diagramClipboard = {
            kind: "connector",
            className: selectedDiagramConnector.getAttribute("class"),
            connectorType: selectedDiagramConnector.dataset.connectorType || "connector",
            from: selectedDiagramConnector.dataset.from,
            to: selectedDiagramConnector.dataset.to,
            offsetX: Number(selectedDiagramConnector.dataset.offsetX || 24) + 24,
            offsetY: Number(selectedDiagramConnector.dataset.offsetY || 24) + 24,
            midX: Number(selectedDiagramConnector.dataset.midX || 0) + 24,
            midY: Number(selectedDiagramConnector.dataset.midY || 0) + 24,
            fromSide: selectedDiagramConnector.dataset.fromSide || "",
            toSide: selectedDiagramConnector.dataset.toSide || "",
            customRoute: selectedDiagramConnector.dataset.customRoute || "",
            customRoutePoints: selectedDiagramConnector.dataset.customRoutePoints || selectedDiagramConnector.dataset.routePoints || ""
        };
    }
}

function pasteDiagramItem() {
    if (!diagramClipboard) return;
    const editor = document.getElementById("diagramEditor");
    const svg = document.getElementById("diagramConnectors");
    if (!editor) return;

    if (diagramClipboard.kind === "node") {
        const node = document.createElement("div");
        node.className = diagramClipboard.className.replace(" selected", "").replace(" connector-start", "");
        node.contentEditable = "false";
        node.dataset.textEditing = "false";
        node.style.left = `${diagramClipboard.left + 28}px`;
        node.style.top = `${diagramClipboard.top + 28}px`;
        node.innerHTML = diagramClipboard.html;
        ensureDiagramNodeId(node);
        node.addEventListener("pointerdown", startDiagramDrag);
        node.addEventListener("click", selectDiagramNode);
        node.addEventListener("dblclick", editSelectedDiagramNode);
        node.addEventListener("contextmenu", showDiagramContextMenu);
        editor.appendChild(node);
        diagramClipboard.left += 28;
        diagramClipboard.top += 28;
        setSelectedDiagramNode(node);
        return;
    }

    if (diagramClipboard.kind === "connector" && svg) {
        ensureConnectorMarkers(svg);
        const fromNode = document.querySelector(`[data-node-id="${diagramClipboard.from}"]`);
        const toNode = document.querySelector(`[data-node-id="${diagramClipboard.to}"]`);
        if (!fromNode || !toNode) return;
        const connector = createConnectorElement(diagramClipboard.connectorType || (diagramClipboard.className?.includes("message-line") ? "message" : "connector"));
        connector.dataset.from = diagramClipboard.from;
        connector.dataset.to = diagramClipboard.to;
        connector.dataset.midX = diagramClipboard.midX;
        connector.dataset.midY = diagramClipboard.midY;
        connector.dataset.offsetX = diagramClipboard.offsetX;
        connector.dataset.offsetY = diagramClipboard.offsetY;
        connector.dataset.customBend = "true";
        if (diagramClipboard.fromSide) connector.dataset.fromSide = diagramClipboard.fromSide;
        if (diagramClipboard.toSide) connector.dataset.toSide = diagramClipboard.toSide;
        if (diagramClipboard.customRoutePoints) {
            connector.dataset.customRoute = "true";
            connector.dataset.customRoutePoints = diagramClipboard.customRoutePoints;
        }
        svg.appendChild(connector);
        updateConnectorLine(connector);
        setSelectedDiagramConnector(connector);
    }
}

function nudgeSelectedDiagramNode(key, amount) {
    const left = parseInt(selectedDiagramNode.style.left, 10) || 0;
    const top = parseInt(selectedDiagramNode.style.top, 10) || 0;
    if (key === "ArrowLeft") selectedDiagramNode.style.left = `${left - amount}px`;
    if (key === "ArrowRight") selectedDiagramNode.style.left = `${left + amount}px`;
    if (key === "ArrowUp") selectedDiagramNode.style.top = `${top - amount}px`;
    if (key === "ArrowDown") selectedDiagramNode.style.top = `${top + amount}px`;
    updateAllConnectorLines();
}

function toggleDiagramEdit(button) {
    diagramEditEnabled = !diagramEditEnabled;

    const editor = document.getElementById("diagramEditor");
    if (editor) editor.classList.toggle("editing", diagramEditEnabled);

    document.querySelectorAll("#diagramEditor .diagram-node").forEach(node => {
        node.contentEditable = "false";
        node.dataset.textEditing = "false";
    });

    document.querySelectorAll(".tool-btn").forEach(btn => {
        btn.disabled = !diagramEditEnabled && !btn.textContent.includes("Select");
    });

    if (button) button.textContent = diagramEditEnabled ? "Done Editing" : "Edit Diagram";

    if (!diagramEditEnabled) {
        setSelectedDiagramNode(null);
        setSelectedDiagramConnector(null);
        if (connectorStartNode) connectorStartNode.classList.remove("connector-start");
        connectorStartNode = null;
        updateConnectorHint();
        hideDiagramContextMenu();
        selectedDiagramTool = "select";
        document.querySelectorAll(".tool-btn").forEach(btn => btn.classList.remove("active"));
        const selectButton = document.querySelector(".tool-btn");
        if (selectButton) selectButton.classList.add("active");
    }
}

function toggleOutputEdit(contentId, button) {
    const content = document.getElementById(contentId);
    if (!content) return;

    const isEditing = content.getAttribute("contenteditable") === "true";
    content.setAttribute("contenteditable", String(!isEditing));
    button.textContent = isEditing ? "Edit" : "Done";
    if (!isEditing) content.focus();
}

function getSrsRibbonSettings() {
    const font = document.getElementById("srsRibbonFont")?.value || "Times New Roman";
    const size = Number(document.getElementById("srsRibbonSize")?.value) || 12;
    return { font, size };
}

function applySrsRibbonFormat() {
    const content = document.getElementById("srsOutputContent");
    if (!content) return;
    const { font, size } = getSrsRibbonSettings();
    if (srsSavedSelectionRange || getActiveSrsSelectionRange()) {
        content.setAttribute("contenteditable", "true");
        restoreSrsSelection();
        applyInlineStyleToSrsSelection({
            fontFamily: `"${font}", Arial, sans-serif`,
            fontSize: `${size}pt`
        });
    } else {
        content.style.fontFamily = `"${font}", Arial, sans-serif`;
        content.style.fontSize = `${size}pt`;
    }
}

function ensureSrsEditableForCommand() {
    const content = document.getElementById("srsOutputContent");
    if (!content) return null;
    if (content.getAttribute("contenteditable") !== "true") {
        content.setAttribute("contenteditable", "true");
    }
    content.focus();
    restoreSrsSelection();
    return content;
}

let srsSavedSelectionRange = null;
let srsLineHeightIndex = 0;
let srsStyleMenuTarget = null;
const srsCustomStyles = {
    normal: {},
    heading: {},
    title: {}
};

function formatSrsSelection(command, value = null) {
    if (!ensureSrsEditableForCommand()) return;
    document.execCommand(command, false, value);
    saveCurrentSrsSelection();
    updateSrsFloatingToolbar();
}

function applySrsStyle(style) {
    const content = ensureSrsEditableForCommand();
    if (!content) return;
    document.querySelectorAll(".style-tile").forEach(tile => tile.classList.remove("active"));
    const target = event?.currentTarget;
    if (target) target.classList.add("active");
    if (style === "heading") document.execCommand("formatBlock", false, "h3");
    else if (style === "title") document.execCommand("formatBlock", false, "h2");
    else document.execCommand("formatBlock", false, "p");
    if (Object.keys(srsCustomStyles[style] || {}).length) {
        applyInlineStyleToSrsSelection(srsCustomStyles[style]);
    }
    saveCurrentSrsSelection();
    updateSrsFloatingToolbar();
}

function applySrsListStyle(listStyleType) {
    const content = ensureSrsEditableForCommand();
    if (!content) return;
    restoreSrsSelection();
    document.execCommand("insertOrderedList", false, null);
    window.requestAnimationFrame(() => {
        const selection = window.getSelection();
        const node = selection?.anchorNode?.nodeType === Node.TEXT_NODE
            ? selection.anchorNode.parentElement
            : selection?.anchorNode;
        const list = node?.closest?.("ol");
        if (list) {
            list.style.listStyleType = listStyleType;
        }
        saveCurrentSrsSelection();
        updateSrsFloatingToolbar();
    });
}

function getActiveSrsSelectionRange() {
    const content = document.getElementById("srsOutputContent");
    const selection = window.getSelection();
    if (!content || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    const commonNode = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer;
    return content.contains(commonNode) ? range : null;
}

function saveCurrentSrsSelection() {
    const range = getActiveSrsSelectionRange();
    if (range) srsSavedSelectionRange = range.cloneRange();
}

function restoreSrsSelection() {
    if (!srsSavedSelectionRange) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(srsSavedSelectionRange);
}

function updateSrsFloatingToolbar() {
    const toolbar = document.getElementById("srsFloatingToolbar");
    const range = getActiveSrsSelectionRange();
    if (!toolbar || !range) {
        if (toolbar) toolbar.classList.remove("show");
        return;
    }

    srsSavedSelectionRange = range.cloneRange();
    const rect = range.getBoundingClientRect();
    const toolbarWidth = toolbar.offsetWidth || 330;
    const top = Math.max(92, rect.top - 52);
    const left = Math.min(
        Math.max(12, rect.left + (rect.width / 2) - (toolbarWidth / 2)),
        window.innerWidth - toolbarWidth - 12
    );

    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;
    toolbar.classList.add("show");
}

function syncMiniSrsFont() {
    const miniFont = document.getElementById("srsMiniFont")?.value || "Aptos";
    const ribbonFont = document.getElementById("srsRibbonFont");
    if (ribbonFont) ribbonFont.value = miniFont;
    applyInlineStyleToSrsSelection({ fontFamily: `"${miniFont}", Arial, sans-serif` });
}

function toggleSrsFontColorPalette(event) {
    event.stopPropagation();
    const palette = document.getElementById("srsFontColorPalette");
    if (!palette) return;
    const shouldShow = !palette.classList.contains("show");
    if (!shouldShow) {
        palette.classList.remove("show");
        return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    palette.style.left = `${Math.min(rect.left, window.innerWidth - 190)}px`;
    palette.style.top = `${rect.bottom + 8}px`;
    palette.classList.add("show");
}

function applySrsFontColor(color) {
    document.getElementById("srsFontColorPalette")?.classList.remove("show");
    applyInlineStyleToSrsSelection({ color });
}

function highlightSrsSelection(color = null) {
    const shadeColor = color || document.getElementById("srsShadeColor")?.value || "#fff1a8";
    applyInlineStyleToSrsSelection({ backgroundColor: shadeColor });
}

function clearSrsShading() {
    applyInlineStyleToSrsSelection({ backgroundColor: "transparent" });
}

function applySrsBorder() {
    applyInlineStyleToSrsSelection({
        border: "1px solid #0f4c81",
        borderRadius: "3px",
        padding: "0 3px"
    });
}

function applyInlineStyleToSrsSelection(styles) {
    const content = ensureSrsEditableForCommand();
    if (!content) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const commonNode = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer;
    if (!content.contains(commonNode)) return;

    const span = document.createElement("span");
    Object.assign(span.style, styles);

    try {
        range.surroundContents(span);
    } catch {
        span.appendChild(range.extractContents());
        range.insertNode(span);
    }

    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    selection.addRange(newRange);
    saveCurrentSrsSelection();
    updateSrsFloatingToolbar();
}

function setSrsLineHeight() {
    const content = ensureSrsEditableForCommand();
    if (!content) return;
    const values = ["1.15", "1.5", "2"];
    srsLineHeightIndex = (srsLineHeightIndex + 1) % values.length;
    const selection = window.getSelection();
    const node = selection?.anchorNode?.nodeType === Node.TEXT_NODE
        ? selection.anchorNode.parentElement
        : selection?.anchorNode;
    const block = node?.closest?.("p, li, h1, h2, h3, div") || content;
    block.style.lineHeight = values[srsLineHeightIndex];
    saveCurrentSrsSelection();
}

function sortSelectedSrsLines() {
    const content = ensureSrsEditableForCommand();
    const selection = window.getSelection();
    if (!content || !selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const selectedText = selection.toString();
    const sortedText = selectedText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .join("\n");
    if (!sortedText) return;
    document.execCommand("insertText", false, sortedText);
    saveCurrentSrsSelection();
}

function toggleSrsMarks() {
    const content = document.getElementById("srsOutputContent");
    if (!content) return;
    content.classList.toggle("srs-show-marks");
}

function openSrsStyleModifyMenu(event, styleName) {
    event.preventDefault();
    event.stopPropagation();
    srsStyleMenuTarget = styleName;
    const menu = document.getElementById("srsStyleContextMenu");
    if (!menu) return;
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 150)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 54)}px`;
    menu.classList.add("show");
}

function openSrsStyleModifyDialog() {
    const styleName = srsStyleMenuTarget || "normal";
    const modal = document.getElementById("srsStyleModifyModal");
    if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    const style = srsCustomStyles[styleName] || {};
    document.getElementById("styleModifyFont").value = String(style.fontFamily || document.getElementById("srsRibbonFont")?.value || "Aptos").replaceAll('"', "").split(",")[0];
    document.getElementById("styleModifySize").value = String(parseInt(style.fontSize, 10) || Number(document.getElementById("srsRibbonSize")?.value) || 12);
    document.getElementById("styleModifyColor").value = style.color || "#112033";
    document.getElementById("styleModifyBold").checked = style.fontWeight === "800" || style.fontWeight === "bold";
    document.getElementById("styleModifyItalic").checked = style.fontStyle === "italic";
    document.getElementById("styleModifyUnderline").checked = String(style.textDecoration || "").includes("underline");
    document.getElementById("srsStyleContextMenu")?.classList.remove("show");
    modal?.classList.add("show");
    modal?.setAttribute("aria-hidden", "false");
}

function openSrsStyleModifyDialogFor(styleName) {
    srsStyleMenuTarget = styleName;
    openSrsStyleModifyDialog();
}

function closeSrsStyleModifyDialog() {
    const modal = document.getElementById("srsStyleModifyModal");
    modal?.classList.remove("show");
    modal?.setAttribute("aria-hidden", "true");
}

function applySrsStyleModification() {
    const styleName = srsStyleMenuTarget || "normal";
    const font = document.getElementById("styleModifyFont")?.value || "Aptos";
    const size = Number(document.getElementById("styleModifySize")?.value) || 12;
    const color = document.getElementById("styleModifyColor")?.value || "#112033";
    const bold = document.getElementById("styleModifyBold")?.checked;
    const italic = document.getElementById("styleModifyItalic")?.checked;
    const underline = document.getElementById("styleModifyUnderline")?.checked;
    const style = {
        fontFamily: `"${font}", Arial, sans-serif`,
        fontSize: `${size}pt`,
        color,
        fontWeight: bold ? "800" : "400",
        fontStyle: italic ? "italic" : "normal",
        textDecoration: underline ? "underline" : "none"
    };
    srsCustomStyles[styleName] = style;
    const tile = document.querySelector(`.style-tile[data-style-name="${styleName}"]`);
    if (tile) {
        Object.assign(tile.style, {
            fontFamily: style.fontFamily,
            color: style.color
        });
        const preview = tile.querySelector("strong");
        if (preview) {
            preview.style.fontSize = `${Math.max(14, Math.min(22, size + 2))}px`;
            preview.style.fontWeight = style.fontWeight;
            preview.style.fontStyle = style.fontStyle;
            preview.style.textDecoration = style.textDecoration;
            preview.style.color = style.color;
        }
    }
    applyInlineStyleToSrsSelection(style);
    closeSrsStyleModifyDialog();
}

function downloadSrsFromRibbon(format) {
    const content = document.getElementById("srsOutputContent");
    if (!content) return;
    if (format !== "pdf" && !requirePremiumAccess(`${String(format).toUpperCase()} export`)) return;
    ensureCompleteSrsTableOfContents(content);
    ensureSrsSystemDiagrams(content);
    applySrsRibbonFormat();
    const baseName = "aira-generated-srs";
    let blob;
    let extension = format;
    if (format === "pdf") {
        blob = getFormattedSrsPDFBlob(content, baseName);
    } else if (format === "doc") {
        blob = getWordDocumentBlob(content, baseName);
    } else {
        blob = new Blob([content.innerText], { type: "text/plain" });
        extension = "txt";
    }
    downloadBlob(blob, `${baseName}.${extension}`);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function downloadOutput(contentId, filename) {
    const content = document.getElementById(contentId);
    if (!content) return;

    const blob = new Blob([content.innerText], { type: "text/plain" });
    downloadBlob(blob, filename);
}

async function downloadTextOutputWithPicker(contentId, baseName) {
    const content = document.getElementById(contentId);
    if (!content) return;
    if (contentId === "srsOutputContent") {
        ensureCompleteSrsTableOfContents(content);
        ensureSrsSystemDiagrams(content);
    }

    if (!window.showSaveFilePicker) {
        downloadOutput(contentId, `${baseName}.txt`);
        return;
    }

    let fileHandle;

    try {
        fileHandle = await window.showSaveFilePicker({
            suggestedName: `${baseName}.txt`,
            types: [
                {
                    description: "Text Document",
                    accept: { "text/plain": [".txt"] }
                },
                {
                    description: "Word Document",
                    accept: { "application/msword": [".doc"] }
                },
                {
                    description: "PDF Document",
                    accept: { "application/pdf": [".pdf"] }
                }
            ]
        });
    } catch (error) {
        return;
    }

    const fileName = fileHandle.name.toLowerCase();
    const text = content.innerText;
    const isSrsDocument = contentId === "srsOutputContent";
    let blob;
    if (fileName.endsWith(".pdf")) {
        blob = isSrsDocument ? getFormattedSrsPDFBlob(content, baseName) : getAnalysisPDFBlob(content, baseName);
    } else if (fileName.endsWith(".doc")) {
        blob = isSrsDocument ? getWordDocumentBlob(content, baseName) : getSimpleWordDocumentBlob(content, baseName);
    } else {
        blob = new Blob([text], { type: "text/plain" });
    }

    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
}

function getCleanProfessionalAnalysisContent(contentId) {
    const content = document.getElementById(contentId);
    if (!content) return null;

    const printable = content.cloneNode(true);
    printable.querySelectorAll(".analysis-extracted-text, details").forEach(element => element.remove());
    printable.querySelectorAll("[contenteditable]").forEach(element => element.removeAttribute("contenteditable"));
    return printable;
}

function downloadProfessionalAnalysis(contentId, format = "pdf", baseName = "aira-professional-analysis") {
    const printable = getCleanProfessionalAnalysisContent(contentId);
    if (!printable) return;
    if (format !== "pdf" && !requirePremiumAccess(`${String(format).toUpperCase()} export`)) return;
    if (format === "doc") {
        downloadBlob(getProfessionalAnalysisWordBlob(printable), `${baseName}.doc`);
        return;
    }
    if (format === "txt") {
        downloadBlob(getProfessionalAnalysisTextBlob(printable), `${baseName}.txt`);
        return;
    }
    downloadBlob(getProfessionalAnalysisPDFBlob(printable), `${baseName}.pdf`);
}

function downloadProfessionalAnalysisPDF(contentId, baseName = "aira-professional-analysis") {
    downloadProfessionalAnalysis(contentId, "pdf", baseName);
}

function getProfessionalAnalysisWordBlob(content) {
    const html = `<!DOCTYPE html>
      <html><head><meta charset="utf-8"><style>
        @page { size: A4; margin: 16mm; }
        body { color:#112033; font-family:"Segoe UI",Arial,sans-serif; font-size:10.5pt; line-height:1.5; }
        .professional-analysis-report { display:block; }
        .professional-analysis-heading { padding-bottom:12pt; border-bottom:2pt solid #0f4c81; }
        .professional-analysis-heading h2 { color:#112033; font-size:21pt; margin:6pt 0; }
        .professional-analysis-heading p, .analysis-assessment p { color:#52657d; }
        .eyebrow { color:#0f4c81; font-size:8pt; font-weight:bold; text-transform:uppercase; }
        .professional-analysis-section { margin-top:16pt; page-break-inside:avoid; }
        h3 { color:#112033; font-size:13pt; margin:0 0 7pt; }
        table { width:100%; border-collapse:collapse; margin-bottom:14pt; }
        th,td { padding:7pt; text-align:left; vertical-align:top; border:1pt solid #cbd8e6; }
        th { background:#eaf1f8; color:#0f4c81; font-weight:bold; text-transform:uppercase; }
        td:first-child { color:#0f4c81; font-weight:bold; }
        .analysis-assessment { margin-top:16pt; padding:12pt; border-left:4pt solid #10b3a3; background:#edf9f7; page-break-inside:avoid; }
      </style></head><body>${content.innerHTML}</body></html>`;
    return new Blob([html], { type: "application/msword" });
}

function getProfessionalAnalysisTextBlob(content) {
    const report = content.querySelector(".professional-analysis-report") || content;
    const parts = [];
    const header = report.querySelector(".professional-analysis-heading");
    if (header) {
        parts.push(header.querySelector("h2")?.innerText || "AIRA Professional Analysis");
        header.querySelectorAll("p").forEach(item => parts.push(item.innerText));
    }
    report.querySelectorAll(".professional-analysis-section").forEach(section => {
        parts.push("", section.querySelector("h3")?.innerText || "Analysis Details");
        const rows = Array.from(section.querySelectorAll("tr"));
        rows.forEach(row => parts.push(Array.from(row.querySelectorAll("th,td")).map(cell => cell.innerText.trim()).join(" | ")));
    });
    const assessment = report.querySelector(".analysis-assessment");
    if (assessment) {
        parts.push("", assessment.querySelector("h3")?.innerText || "Overall Assessment");
        parts.push(assessment.querySelector("p")?.innerText || "");
    }
    return new Blob([parts.join("\r\n")], { type: "text/plain;charset=utf-8" });
}

function getProfessionalAnalysisPDFBlob(content) {
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 42;
    const usableWidth = pageWidth - margin * 2;
    const streams = [];
    let stream = "";
    let y = pageHeight - margin;

    const startPage = () => {
        if (stream) streams.push(stream);
        stream = "";
        y = pageHeight - margin;
    };
    const ensureSpace = height => {
        if (y - height < margin) startPage();
    };
    const text = (value, x, size = 9, font = "F1") => {
        stream += `0.07 0.13 0.20 rg BT /${font} ${size} Tf ${x} ${y} Td (${escapePDFText(sanitizePDFText(value))}) Tj ET\n`;
    };
    const paragraph = (value, size = 9, font = "F1", after = 8, indent = 0) => {
        const lines = wrapPdfText(String(value || ""), usableWidth - indent, size);
        ensureSpace(lines.length * (size + 4) + after);
        lines.forEach(line => {
            text(line, margin + indent, size, font);
            y -= size + 4;
        });
        y -= after;
    };
    const heading = (value, size = 14) => paragraph(value, size, "F2", 8);
    const drawLine = () => {
        stream += `0.06 0.30 0.51 RG 1 w ${margin} ${y} m ${pageWidth - margin} ${y} l S\n`;
        y -= 10;
    };
    const table = element => {
        const rows = Array.from(element.querySelectorAll("tr"));
        rows.forEach((row, rowIndex) => {
            const cells = Array.from(row.querySelectorAll("th,td"));
            if (!cells.length) return;
            const cellWidth = usableWidth / cells.length;
            const wrapped = cells.map(cell => wrapPdfText(cell.innerText.trim(), cellWidth - 12, 8));
            const rowHeight = Math.max(...wrapped.map(lines => lines.length)) * 11 + 12;
            ensureSpace(rowHeight + 4);
            const bottom = y - rowHeight;
            if (rowIndex === 0) stream += `0.92 0.95 0.98 rg ${margin} ${bottom} ${usableWidth} ${rowHeight} re f\n`;
            cells.forEach((_, cellIndex) => {
                const x = margin + cellIndex * cellWidth;
                stream += `0.75 0.82 0.90 RG 0.5 w ${x} ${bottom} ${cellWidth} ${rowHeight} re S\n`;
                wrapped[cellIndex].forEach((line, lineIndex) => {
                    const lineY = y - 12 - lineIndex * 11;
                    const fill = rowIndex === 0 ? "0.06 0.30 0.51 rg" : "0.07 0.13 0.20 rg";
                    stream += `${fill} BT /${rowIndex === 0 ? "F2" : "F1"} 8 Tf ${x + 6} ${lineY} Td (${escapePDFText(sanitizePDFText(line))}) Tj ET\n`;
                });
            });
            y = bottom;
        });
        y -= 14;
    };

    const report = content.querySelector(".professional-analysis-report") || content;
    const header = report.querySelector(".professional-analysis-heading");
    if (header) {
        heading(header.querySelector("h2")?.innerText || "AIRA Professional Analysis", 18);
        Array.from(header.querySelectorAll("p")).forEach(item => paragraph(item.innerText, 9));
        drawLine();
    }
    report.querySelectorAll(".professional-analysis-section").forEach(section => {
        heading(section.querySelector("h3")?.innerText || "Analysis Details", 12);
        const tableElement = section.querySelector("table");
        if (tableElement) table(tableElement);
    });
    const assessment = report.querySelector(".analysis-assessment");
    if (assessment) {
        heading(assessment.querySelector("h3")?.innerText || "Overall Assessment", 12);
        paragraph(assessment.querySelector("p")?.innerText || "", 9);
    }
    if (stream) streams.push(stream);

    const pages = [];
    const contents = [];
    streams.forEach((pageStream, index) => {
        const footer = `BT /F1 8 Tf ${pageWidth - margin - 38} 22 Td (Page ${index + 1}) Tj ET\n`;
        const finalStream = pageStream + footer;
        contents.push(asciiBytes(`<< /Length ${finalStream.length} >>\nstream\n${finalStream}endstream`));
    });
    streams.forEach((_, index) => {
        const pageNumber = 5 + index * 2;
        pages.push(asciiBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageNumber + 1} 0 R >>`));
    });
    const kids = streams.map((_, index) => `${5 + index * 2} 0 R`).join(" ");
    const body = [];
    pages.forEach((page, index) => body.push(page, contents[index]));
    return new Blob([buildPDF([
        asciiBytes("<< /Type /Catalog /Pages 2 0 R >>"),
        asciiBytes(`<< /Type /Pages /Kids [${kids}] /Count ${streams.length} >>`),
        asciiBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
        asciiBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"),
        ...body
    ])], { type: "application/pdf" });
}

function getAnalysisPDFBlob(content, title) {
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 64;
    const bodyFontSize = 12;
    const bodyLineHeight = 18;
    const lines = getSrsExportLines(content);
    const heading = toTitleCase(title.replace(/^aira-/, "").replaceAll("-", " "));
    const pageStreams = [];
    let stream = "";
    let y = pageHeight - margin;

    const startPage = () => {
        if (stream) pageStreams.push(stream);
        stream = "";
        y = pageHeight - margin;
    };
    const ensureSpace = needed => {
        if (y - needed < margin) startPage();
    };
    const drawText = (text, x, fontSize = bodyFontSize, font = "F1") => {
        stream += `BT /${font} ${fontSize} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePDFText(sanitizePDFText(text))}) Tj ET\n`;
    };
    const drawParagraph = (text, options = {}) => {
        const fontSize = options.fontSize || bodyFontSize;
        const font = options.font || "F1";
        const lineHeight = options.lineHeight || bodyLineHeight;
        const after = options.after ?? 10;
        wrapPdfText(text, pageWidth - margin * 2, fontSize).forEach(line => {
            ensureSpace(lineHeight);
            drawText(line, margin, fontSize, font);
            y -= lineHeight;
        });
        y -= after;
    };

    drawParagraph(heading, { fontSize: 18, font: "F2", lineHeight: 24, after: 20 });
    lines.forEach(line => {
        if (/^(Summary|Description|Detected UML Text|View Extracted Text|Total Requirements|Ambiguous|Clear):?$/i.test(line)) {
            drawParagraph(line.replace(/:$/, ""), { fontSize: 14, font: "F2", lineHeight: 20, after: 8 });
        } else {
            drawParagraph(line, { after: 8 });
        }
    });
    if (stream) pageStreams.push(stream);

    const pageObjects = [];
    const contentObjects = [];
    pageStreams.forEach((pageStream, pageIndex) => {
        const footer = `BT /F1 9 Tf ${pageWidth - margin - 44} 28 Td (${escapePDFText(`Page ${pageIndex + 1}`)}) Tj ET\n`;
        const finalStream = `${pageStream}${footer}`;
        contentObjects.push(asciiBytes(`<< /Length ${finalStream.length} >>\nstream\n${finalStream}endstream`));
    });
    pageStreams.forEach((_, pageIndex) => {
        const pageObjectNumber = 5 + pageIndex * 2;
        const contentObjectNumber = pageObjectNumber + 1;
        pageObjects.push(asciiBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`));
    });

    const pageKids = pageStreams.map((_, pageIndex) => `${5 + pageIndex * 2} 0 R`).join(" ");
    const bodyObjects = [];
    pageObjects.forEach((pageObject, index) => bodyObjects.push(pageObject, contentObjects[index]));
    const objects = [
        asciiBytes("<< /Type /Catalog /Pages 2 0 R >>"),
        asciiBytes(`<< /Type /Pages /Kids [${pageKids}] /Count ${pageStreams.length} >>`),
        asciiBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>"),
        asciiBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>"),
        ...bodyObjects
    ];
    return new Blob([buildPDF(objects)], { type: "application/pdf" });
}

function getSimpleWordDocumentBlob(content, title) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${escapeHTML(title.replaceAll("-", " "))}</title>
        <style>
          body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.5; color: #111827; }
          h1 { font-size: 18pt; text-align: center; }
          h3, h4, strong { font-weight: 700; }
          p, li { margin: 0 0 10pt; }
        </style>
      </head>
      <body>
        <h1>${escapeHTML(toTitleCase(title.replace(/^aira-/, "").replaceAll("-", " ")))}</h1>
        ${content.innerHTML}
      </body>
      </html>`;
    return new Blob([html], { type: "application/msword" });
}

function downloadFormattedPDF(content, baseName) {
    const blob = getFormattedSrsPDFBlob(content, baseName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
}

function getFormattedSrsPDFBlob(content, title) {
    const ribbon = getSrsRibbonSettings();
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 72;
    const bodyFontSize = ribbon.size;
    const bodyLineHeight = Math.round(ribbon.size * 1.5);
    const documentLines = getSrsExportLines(content);
    const projectTitle = toTitleCase(extractSrsProjectTitle(documentLines) || title.replaceAll("-", " "));
    const pageStreams = [];
    let stream = "";
    let y = pageHeight - margin;

    const startPage = () => {
        if (stream) pageStreams.push(stream);
        stream = "";
        y = pageHeight - margin;
    };

    const ensureSpace = needed => {
        if (y - needed < margin) startPage();
    };

    const drawText = (text, x, fontSize = bodyFontSize, font = "F1", wordSpacing = 0) => {
        const safeText = escapePDFText(sanitizePDFText(text));
        stream += `BT /${font} ${fontSize} Tf ${wordSpacing.toFixed(2)} Tw ${x.toFixed(2)} ${y.toFixed(2)} Td (${safeText}) Tj ET\n`;
    };

    const drawRight = (text, fontSize = bodyFontSize, font = "F1", lineHeight = bodyLineHeight) => {
        const lines = wrapPdfText(text, pageWidth - margin * 2, fontSize);
        lines.forEach(line => {
            ensureSpace(lineHeight);
            const x = Math.max(margin, pageWidth - margin - estimatePDFTextWidth(line, fontSize));
            drawText(line, x, fontSize, font);
            y -= lineHeight;
        });
    };

    const drawCentered = (text, fontSize = bodyFontSize, font = "F1", lineHeight = bodyLineHeight) => {
        const lines = wrapPdfText(text, pageWidth - margin * 2, fontSize);
        lines.forEach(line => {
            ensureSpace(lineHeight);
            const x = Math.max(margin, (pageWidth - estimatePDFTextWidth(line, fontSize)) / 2);
            drawText(line, x, fontSize, font);
            y -= lineHeight;
        });
    };

    const drawParagraph = (text, options = {}) => {
        const fontSize = options.fontSize || bodyFontSize;
        const font = options.font || "F1";
        const indent = options.indent || 0;
        const lineHeight = options.lineHeight || Math.round(fontSize * 1.5);
        const after = options.after ?? 16;
        const contentWidth = pageWidth - margin * 2 - indent;
        const lines = wrapPdfText(text, contentWidth, fontSize);
        const remainingSpace = y - margin;
        if (lines.length > 1 && remainingSpace < (lineHeight * 2 + after)) {
            startPage();
        }
        lines.forEach((line, index) => {
            ensureSpace(lineHeight);
            const words = line.split(/\s+/).filter(Boolean);
            const shouldJustify = options.justify !== false && index < lines.length - 1 && words.length > 1;
            const spacing = shouldJustify
                ? Math.max(0, Math.min(3, (contentWidth - estimatePDFTextWidth(line, fontSize)) / (words.length - 1)))
                : 0;
            drawText(line, margin + indent, fontSize, font, spacing);
            y -= lineHeight;
        });
        y -= after;
    };

    const drawNumberedParagraph = (text, options = {}) => {
        const numberedMatch = String(text || "").match(/^(\d+\.\s+)(.*)$/);
        if (!numberedMatch) {
            drawParagraph(text, options);
            return;
        }

        const fontSize = options.fontSize || bodyFontSize;
        const lineHeight = options.lineHeight || bodyLineHeight;
        const after = options.after ?? 16;
        const prefix = numberedMatch[1];
        const body = numberedMatch[2] || "";
        const prefixWidth = estimatePDFTextWidth(prefix, fontSize) + 4;
        const labelMatch = body.match(/^([A-Za-z][A-Za-z0-9 /&().-]{1,42}:\s*)(.*)$/);
        const label = labelMatch ? labelMatch[1] : "";
        const rest = labelMatch ? labelMatch[2] : body;
        const labelWidth = label ? estimatePDFTextWidth(label, fontSize) + 3 : 0;
        const firstLineWidth = pageWidth - margin * 2 - prefixWidth - labelWidth;
        const followLineWidth = pageWidth - margin * 2 - prefixWidth;
        const words = sanitizePDFText(rest).split(/\s+/).filter(Boolean);
        const lines = [];
        let line = "";
        let maxWidth = firstLineWidth;

        words.forEach(word => {
            const testLine = line ? `${line} ${word}` : word;
            if (estimatePDFTextWidth(testLine, fontSize) > maxWidth && line) {
                lines.push(line);
                line = word;
                maxWidth = followLineWidth;
            } else {
                line = testLine;
            }
        });
        if (line) lines.push(line);
        if (!lines.length) lines.push("");

        const remainingSpace = y - margin;
        if (lines.length > 1 && remainingSpace < (lineHeight * 2 + after)) {
            startPage();
        }

        ensureSpace(lineHeight);
        drawText(prefix, margin, fontSize, "F2");
        if (label) drawText(label, margin + prefixWidth, fontSize, "F2");
        if (lines[0]) drawText(lines[0], margin + prefixWidth + labelWidth, fontSize, "F1");
        y -= lineHeight;

        lines.slice(1).forEach(line => {
            ensureSpace(lineHeight);
            drawText(line, margin + prefixWidth, fontSize, "F1");
            y -= lineHeight;
        });
        y -= after;
    };

    const drawLabeledParagraph = (text, options = {}) => {
        const labelMatch = String(text || "").match(/^(\d+\.\s+)?([A-Za-z][A-Za-z0-9 /&().-]{1,42}):\s*(.*)$/);
        if (!labelMatch) {
            drawParagraph(text, options);
            return;
        }

        const fontSize = options.fontSize || bodyFontSize;
        const lineHeight = options.lineHeight || bodyLineHeight;
        const after = options.after ?? 16;
        const numberPrefix = labelMatch[1] || "";
        const label = `${labelMatch[2]}:`;
        const rest = labelMatch[3] || "";
        const contentWidth = pageWidth - margin * 2;
        const numberWidth = numberPrefix ? estimatePDFTextWidth(numberPrefix, fontSize) : 0;
        const labelWidth = estimatePDFTextWidth(`${label} `, fontSize);
        const firstLineWords = [];
        let firstLine = "";

        rest.split(/\s+/).filter(Boolean).forEach(word => {
            const testLine = firstLine ? `${firstLine} ${word}` : word;
            if (estimatePDFTextWidth(testLine, fontSize) <= contentWidth - numberWidth - labelWidth || !firstLine) {
                firstLine = testLine;
            } else {
                firstLineWords.push(firstLine);
                firstLine = word;
            }
        });
        if (firstLine) firstLineWords.push(firstLine);

        ensureSpace(lineHeight);
        if (numberPrefix) drawText(numberPrefix, margin, fontSize, "F1");
        drawText(label, margin + numberWidth, fontSize, "F2");
        if (firstLineWords[0]) drawText(firstLineWords[0], margin + numberWidth + labelWidth, fontSize, "F1");
        y -= lineHeight;

        firstLineWords.slice(1).forEach(line => {
            ensureSpace(lineHeight);
            drawText(line, margin, fontSize, "F1");
            y -= lineHeight;
        });
        y -= after;
    };

    const drawTable = (x, top, widths, rowHeight, rows) => {
        const tableWidth = widths.reduce((sum, width) => sum + width, 0);
        const tableHeight = rowHeight * rows.length;
        stream += `${x} ${top} m ${x + tableWidth} ${top} l S\n`;
        rows.forEach((row, rowIndex) => {
            const rowTop = top - rowIndex * rowHeight;
            stream += `${x} ${rowTop - rowHeight} m ${x + tableWidth} ${rowTop - rowHeight} l S\n`;
            let cellX = x;
            row.forEach((cell, cellIndex) => {
                stream += `${cellX} ${rowTop} m ${cellX} ${rowTop - rowHeight} l S\n`;
                const font = rowIndex === 0 ? "F2" : "F1";
                const size = rowIndex === 0 ? 10 : 9;
                const safeCell = escapePDFText(sanitizePDFText(cell));
                stream += `BT /${font} ${size} Tf ${(cellX + 5).toFixed(2)} ${(rowTop - 16).toFixed(2)} Td (${safeCell}) Tj ET\n`;
                cellX += widths[cellIndex];
            });
            stream += `${x + tableWidth} ${rowTop} m ${x + tableWidth} ${rowTop - rowHeight} l S\n`;
        });
        y = top - tableHeight - 18;
    };

    y = pageHeight - 135;
    drawCentered("Software Requirements Specification (SRS)", 24, "F2", 34);
    y -= 12;
    drawCentered("for", 14, "F1", 24);
    y -= 12;
    drawCentered(projectTitle, 18, "F2", 30);
    y -= 38;
    drawCentered("Project Members", 15, "F2", 24);
    y -= 8;
    AIRA_PROJECT_MEMBERS.forEach(member => drawCentered(member, 14, "F1", 24));

    startPage();
    const tocIndex = documentLines.findIndex(line => /^TABLE OF CONTENTS$/i.test(line));
    const introductionIndexes = documentLines
        .map((line, index) => ({ line, index }))
        .filter(item => item.line === "1. Introduction")
        .map(item => item.index);
    const bodyIndex = introductionIndexes.length > 1 ? introductionIndexes[1] : introductionIndexes[0];
    const testedIndex = documentLines.findIndex(line => /^Tested By Table:?$/i.test(line));
    const tocEndIndex = testedIndex > tocIndex ? testedIndex : bodyIndex;
    const tocLines = tocIndex >= 0 && tocEndIndex > tocIndex
        ? documentLines.slice(tocIndex, tocEndIndex)
        : [];
    const bodyLines = bodyIndex >= 0 ? documentLines.slice(bodyIndex) : documentLines;

    tocLines.forEach((line, index) => {
        if (index === 0) {
            drawCentered(line, 17, "F2", 26);
            y -= 22;
        } else {
            drawParagraph(line, {
                indent: /^\d+\.\d+/.test(line.trim()) ? 24 : 0,
                lineHeight: 19,
                after: 3
            });
        }
    });

    startPage();
    drawCentered("Tested By Table", 17, "F2", 26);
    y -= 24;
    drawTable(margin, y, [126, 105, 110, 110], 30, [
        ["Tester Name", "Role", "Test Date", "Signature"],
        ["", "", "", ""],
        ["", "", "", ""],
    ]);

    bodyLines.forEach(line => {
        if (!line || isPdfCoverLine(line)) return;
        if (isPdfMajorHeading(line)) {
            startPage();
            drawCentered(line, 18, "F2", 28);
            y -= 36;
            return;
        }
        if (/^\d+\.\d+\s+/.test(line) || /^Appendix\s+/i.test(line)) {
            ensureSpace(128);
            drawParagraph(line, { fontSize: 13, font: "F2", lineHeight: 21, after: 10, justify: false });
            return;
        }
        if (/^\d+\.\s+/.test(line)) {
            drawNumberedParagraph(stripRequirementCode(line), { lineHeight: bodyLineHeight, after: 16 });
            return;
        }
        drawLabeledParagraph(stripRequirementCode(line), { lineHeight: bodyLineHeight, after: 16 });
    });

    if (stream) pageStreams.push(stream);

    const pageObjects = [];
    const contentObjects = [];
    pageStreams.forEach((pageStream, pageIndex) => {
        const footer = `BT /F1 9 Tf ${pageWidth - margin - 44} 28 Td (${escapePDFText(`Page ${pageIndex + 1}`)}) Tj ET\n`;
        const finalStream = `${pageStream}${footer}`;
        contentObjects.push(asciiBytes(`<< /Length ${finalStream.length} >>\nstream\n${finalStream}endstream`));
    });

    pageStreams.forEach((_, pageIndex) => {
        const pageObjectNumber = 5 + pageIndex * 2;
        const contentObjectNumber = pageObjectNumber + 1;
        pageObjects.push(asciiBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`));
    });

    const pageKids = pageStreams.map((_, pageIndex) => `${5 + pageIndex * 2} 0 R`).join(" ");
    const bodyObjects = [];
    pageObjects.forEach((pageObject, index) => {
        bodyObjects.push(pageObject, contentObjects[index]);
    });

    const objects = [
        asciiBytes("<< /Type /Catalog /Pages 2 0 R >>"),
        asciiBytes(`<< /Type /Pages /Kids [${pageKids}] /Count ${pageStreams.length} >>`),
        asciiBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>"),
        asciiBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>"),
        ...bodyObjects
    ];

    return new Blob([buildPDF(objects)], { type: "application/pdf" });
}

function getSrsExportLines(content) {
    return String(content?.innerText || "")
        .split(/\r?\n/)
        .map(line => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);
}

function extractSrsProjectTitle(lines) {
    const titleIndex = lines.findIndex(line => /^Project Title:?$/i.test(line));
    if (titleIndex >= 0) return lines[titleIndex + 1] || "";
    const projectNameLine = lines.find(line => /^Project Name:/i.test(line));
    return projectNameLine ? projectNameLine.replace(/^Project Name:\s*/i, "").trim() : "";
}

function isPdfCoverLine(line) {
    return /^(SOFTWARE REQUIREMENTS SPECIFICATION|Software Requirements Specification \(SRS\)|for|Project Title:?|Project Members:?|Tested By Table:?)$/i.test(line)
        || /^Project Name:/i.test(line)
        || AIRA_PROJECT_MEMBERS.some(member => member.toLowerCase() === line.toLowerCase())
        || /^(Tester Name|_{3,})/.test(line)
        || /\|\s*(Role|Test Date|Signature|_{3,})/.test(line);
}

function isPdfMajorHeading(line) {
    return /^(?:[1-9]|1[0-4])\.\s+(Introduction|Overall Description|System Features|Functional Requirements|Non-Functional Requirements|External Interface Requirements|Data Requirements|Security Requirements|Performance Requirements|Reliability and Availability Requirements|Acceptance Criteria|Out of Scope|Conclusion|Appendix)$/i.test(line);
}

function stripRequirementCode(line) {
    return String(line || "").replace(/^(\d+\.\s+)(?:FR|NFR)[-_]?\d+:\s*/i, "$1");
}

function wrapPdfText(text, maxWidth, fontSize = 12) {
    const words = sanitizePDFText(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";

    words.forEach(word => {
        const testLine = line ? `${line} ${word}` : word;
        if (estimatePDFTextWidth(testLine, fontSize) > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = testLine;
        }
    });

    if (line) lines.push(line);
    return lines.length ? lines : [""];
}

function estimatePDFTextWidth(text, fontSize) {
    return Array.from(sanitizePDFText(text)).reduce((width, char) => {
        if (char === " ") return width + fontSize * 0.25;
        if ("il.,'|!;:".includes(char)) return width + fontSize * 0.22;
        if ("mwMW@#%".includes(char)) return width + fontSize * 0.72;
        if (/[A-Z0-9]/.test(char)) return width + fontSize * 0.56;
        return width + fontSize * 0.46;
    }, 0);
}

function sanitizePDFText(text) {
    return String(text || "").replace(/[^\x20-\x7E]/g, " ");
}

function getWordDocumentBlob(content, title) {
    const ribbon = getSrsRibbonSettings();
    let body = content.innerHTML
        .replaceAll("<article", "<div")
        .replaceAll("</article>", "</div>")
        .replace(/<div\s+class=["']page-break["']\s*><\/div>/gi, '<p class="word-page-break">&nbsp;</p>');
    body = normalizeWordSrsBody(body);
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${escapeHTML(title.replaceAll("-", " "))}</title>
        <style>
          @page { margin: 1in 1in 1in 1in; }
          body { font-family: "${escapeHTML(ribbon.font)}", "Times New Roman", Times, serif; font-size: ${ribbon.size}pt; color: #111827; line-height: ${Math.round(ribbon.size * 1.5)}pt; mso-line-height-rule: exactly; }
          h1 { text-align: right; font-size: 24pt; font-weight: 700; color: #111827; margin: 90pt 0 12pt; line-height: 30pt; }
          .cover-for, .cover-project-title, .cover-heading { text-align: right; }
          .cover-member { text-align: right; }
          .cover-project-title { font-size: 18pt; font-weight: 700; line-height: 27pt; }
          .cover-heading { font-size: 14pt; font-weight: 700; margin-top: 22pt; }
          h2 { text-align: center; font-size: 16pt; font-weight: 700; color: #0f4c81; page-break-after: avoid; margin: 0 0 18pt; }
          h3 { font-size: 13pt; font-weight: 700; color: #1f4f7a; page-break-after: avoid; margin: 16pt 0 8pt; }
          p { margin: 0 0 8pt; line-height: 18pt; mso-line-height-rule: exactly; page-break-inside: avoid; text-align: justify; }
          .cover-for, .cover-project-title, .cover-heading { text-align: right; }
          .cover-member { text-align: right; }
          .word-page-break { page-break-before: always; margin: 0; font-size: 1pt; line-height: 1pt; }
          .page-break { page-break-before: always; page-break-after: always; }
          .srs-toc { border: 1px solid #cbd5e1; padding: 12px; background: #f8fbff; page-break-before: always; page-break-after: always; page-break-inside: avoid; }
          .srs-toc ol, .srs-toc ul { list-style-type: none; margin-left: 0; padding-left: 0; }
          .srs-toc li, .toc-line { list-style-type: none; margin: 0 0 6pt; line-height: 18pt; text-align: left; }
          .toc-major { font-weight: 700; color: #111827; margin-top: 8pt; }
          .toc-subitem { margin-left: 24pt; color: #475569; font-size: 11pt; }
          .srs-system-diagrams { page-break-before: always; }
          .srs-diagram-card { border: 1px solid #cbd5e1; padding: 10pt; margin: 10pt 0; page-break-inside: avoid; background: #f8fbff; }
          .srs-diagram-card h3 { text-align: left; margin-top: 0; }
          .srs-model-table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
          .srs-model-table th, .srs-model-table td { border: 1px solid #cbd5e1; padding: 7pt; text-align: left; vertical-align: top; }
          .srs-model-table th { background: #e2f0fc; color: #0f4c81; font-weight: 700; }
          .srs-diagram-svg { width: 100%; max-width: 720pt; height: auto; background: #ffffff; border: 1px solid #cbd5e1; }
          .diagram-boundary, .diagram-box, .diagram-process, .diagram-entity, .diagram-note, .diagram-database, .diagram-usecase { fill: #f8fbff; stroke: #0f4c81; stroke-width: 2; }
          .diagram-usecase { fill: #ffffff; }
          .diagram-actor, .diagram-line, .diagram-arrow { fill: none; stroke: #12324d; stroke-width: 2.2; }
          .diagram-title, .diagram-label, .diagram-small { fill: #102033; font-family: Arial, sans-serif; }
          .major-heading { page-break-before: always; page-break-after: avoid; margin-bottom: 20pt; }
          .srs-toc + .tested-heading { page-break-before: always; }
          .tested-by-table { page-break-after: always; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; }
          th, td { border: 1px solid #1f2937; padding: 8px; text-align: left; }
          th { font-weight: 700; background: #f3f4f6; }
        </style>
      </head>
      <body>${body}</body>
      </html>`;

    return new Blob([html], { type: "application/msword" });
}

function normalizeWordSrsBody(html) {
    let body = String(html || "");
    body = body.replace(/<section class="srs-toc">([\s\S]*?)<\/section>/i, match =>
        match
            .replace(/<ol>/gi, '<div class="toc-list">')
            .replace(/<\/ol>/gi, "</div>")
            .replace(/<li([^>]*)>/gi, (_item, attrs) => {
                const classMatch = String(attrs || "").match(/\sclass=["']([^"']*)["']/i);
                const className = classMatch ? `${classMatch[1]} toc-line` : "toc-line";
                return `<p class="${className}">`;
            })
            .replace(/<\/li>/gi, "</p>")
    );
    body = body.replace(
        /(<p[^>]*>\s*)(Description|Priority|Inputs|Processing|Outputs|SRS|User|Admin|UI|Database):/gi,
        "$1<strong>$2:</strong>"
    );
    body = body.replace(
        /(<p[^>]*>\s*<strong>\d+\.<\/strong>\s*)(Description|Priority|Inputs|Processing|Outputs|SRS|User|Admin|UI|Database):/gi,
        "$1<strong>$2:</strong>"
    );
    return body;
}

function getTextPDFBlob(text, title) {
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 48;
    const lineHeight = 15;
    const linesPerPage = 46;
    const escapedTitle = escapePDFText(title.replaceAll("-", " ").toUpperCase());
    const lines = wrapPlainText(text, 88);
    const pages = [];

    for (let index = 0; index < lines.length; index += linesPerPage) {
        pages.push(lines.slice(index, index + linesPerPage));
    }

    if (!pages.length) pages.push([]);

    const pageObjects = [];
    const contentObjects = [];

    pages.forEach((pageLines, pageIndex) => {
        let y = pageHeight - margin;
        let stream = "";

        if (pageIndex === 0) {
            stream += `BT /F1 16 Tf ${margin} ${y} Td (${escapedTitle}) Tj ET\n`;
            y -= 28;
        } else {
            stream += `BT /F1 9 Tf ${margin} ${pageHeight - 28} Td (${escapedTitle}) Tj ET\n`;
        }

        pageLines.forEach(line => {
            const trimmed = line.trim();
            const isMainHeading = /^[0-9]{1,2}\.\s+[A-Z]/.test(trimmed) || trimmed === "SOFTWARE REQUIREMENTS SPECIFICATION";
            const isSubHeading = /^[0-9]{1,2}\.[0-9]+\s+/.test(trimmed) || trimmed.startsWith("Appendix ");
            const fontSize = isMainHeading ? 12 : isSubHeading ? 11 : 10;
            const left = isSubHeading ? margin + 10 : margin;
            stream += `BT /F1 ${fontSize} Tf ${left} ${y} Td (${escapePDFText(line)}) Tj ET\n`;
            y -= isMainHeading ? lineHeight + 4 : lineHeight;
        });

        stream += `BT /F1 8 Tf ${pageWidth - margin - 54} 28 Td (Page ${pageIndex + 1} of ${pages.length}) Tj ET\n`;
        contentObjects.push(asciiBytes(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`));
    });

    pages.forEach((_, pageIndex) => {
        const pageObjectNumber = 4 + pageIndex * 2;
        const contentObjectNumber = pageObjectNumber + 1;
        pageObjects.push(asciiBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`));
    });

    const pageKids = pages.map((_, pageIndex) => `${4 + pageIndex * 2} 0 R`).join(" ");
    const bodyObjects = [];
    pageObjects.forEach((pageObject, index) => {
        bodyObjects.push(pageObject, contentObjects[index]);
    });

    const objects = [
        asciiBytes("<< /Type /Catalog /Pages 2 0 R >>"),
        asciiBytes(`<< /Type /Pages /Kids [${pageKids}] /Count ${pages.length} >>`),
        asciiBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
        ...bodyObjects
    ];

    return new Blob([buildPDF(objects)], { type: "application/pdf" });
}

function wrapPlainText(text, maxChars) {
    const lines = [];

    text.split("\n").forEach(paragraph => {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        let line = "";

        words.forEach(word => {
            const testLine = line ? `${line} ${word}` : word;
            if (testLine.length > maxChars && line) {
                lines.push(line);
                line = word;
            } else {
                line = testLine;
            }
        });

        if (line) lines.push(line);
        else lines.push("");
    });

    return lines;
}

function escapePDFText(text) {
    return text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function getDiagramCanvas() {
    const editor = document.getElementById("diagramEditor");
    if (!editor) return null;

    const canvas = document.createElement("canvas");
    const width = editor.offsetWidth;
    const height = editor.offsetHeight;
    const hasProfessionalBackground = editor.dataset.professionalPlantUmlBackground === "true";
    canvas.width = width * 2;
    canvas.height = height * 2;

    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.fillStyle = hasProfessionalBackground ? "#ffffff" : "#f8fbff";
    ctx.fillRect(0, 0, width, height);

    if (!hasProfessionalBackground) {
        ctx.strokeStyle = "rgba(72,101,164,0.12)";
        ctx.lineWidth = 1;
        for (let x = 0; x <= width; x += 24) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y <= height; y += 24) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }

    drawAttachedDiagramBackground(ctx, width, height);
    drawDiagramConnectors(ctx);
    drawDiagramNodes(ctx);

    return canvas;
}

function drawAttachedDiagramBackground(ctx, width, height) {
    if (!diagramBackgroundImage || !diagramBackgroundImage.complete || !diagramBackgroundImage.naturalWidth) return;
    const maxWidth = width * 0.92;
    const maxHeight = height * 0.88;
    const scale = Math.min(maxWidth / diagramBackgroundImage.naturalWidth, maxHeight / diagramBackgroundImage.naturalHeight, 1.6);
    const imageWidth = diagramBackgroundImage.naturalWidth * scale;
    const imageHeight = diagramBackgroundImage.naturalHeight * scale;
    const x = (width - imageWidth) / 2;
    const y = (height - imageHeight) / 2;
    ctx.save();
    const editor = document.getElementById("diagramEditor");
    ctx.globalAlpha = editor?.dataset.professionalPlantUmlBackground === "true" ? 1 : 0.92;
    ctx.drawImage(diagramBackgroundImage, x, y, imageWidth, imageHeight);
    ctx.restore();
}

function drawDiagramConnectors(ctx) {
    document.querySelectorAll("#diagramConnectors .connector-line").forEach(line => {
        ctx.beginPath();
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 2;
        if (line.classList.contains("message-line")) ctx.setLineDash([8, 5]);
        else ctx.setLineDash([]);
        const route = parseConnectorRoute(line.dataset.routePoints);
        if (!route || route.length < 2) return;
        ctx.moveTo(route[0].x, route[0].y);
        route.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
        ctx.stroke();
    });
    ctx.setLineDash([]);
}

function drawDiagramNodes(ctx) {
    const editor = document.getElementById("diagramEditor");
    if (!editor) return;

    document.querySelectorAll("#diagramEditor .diagram-node").forEach(node => {
        const left = parseInt(node.style.left, 10) || 0;
        const top = parseInt(node.style.top, 10) || 0;
        const width = node.offsetWidth;
        const height = node.offsetHeight;
        const text = node.innerText.trim();

        ctx.fillStyle = getDiagramFill(node);
        ctx.strokeStyle = node.classList.contains("note-node") ? "#d6a84f" : "#4865a4";
        ctx.lineWidth = node.classList.contains("weak-entity-node") ? 4 : 2;

        drawNodeShape(ctx, node, left, top, width, height);
        if (node.classList.contains("actor-node")) {
            drawWrappedText(ctx, text, left + 4, top + height - 17, width - 8);
        } else {
            drawWrappedText(ctx, text, left + 12, top + 18, width - 24);
        }
    });
}

function getDiagramFill(node) {
    if (node.classList.contains("note-node")) return "#fff7d6";
    if (node.classList.contains("entity-node") || node.classList.contains("text-node")) return "#eef4ff";
    if (node.classList.contains("system-boundary-node") || node.classList.contains("lifeline-node")) return "rgba(255,255,255,0.55)";
    return "#ffffff";
}

function drawNodeShape(ctx, node, left, top, width, height) {
    ctx.beginPath();

    if (node.classList.contains("actor-node")) {
        const centerX = left + width / 2;
        const headY = top + 19;
        ctx.fillStyle = "#17698c";
        ctx.arc(centerX, headY, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineCap = "round";
        ctx.strokeStyle = "#17698c";
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(centerX, headY + 17);
        ctx.lineTo(centerX, top + 83);
        ctx.moveTo(centerX, top + 47);
        ctx.lineTo(centerX - 25, top + 59);
        ctx.moveTo(centerX, top + 47);
        ctx.lineTo(centerX + 25, top + 59);
        ctx.moveTo(centerX, top + 81);
        ctx.lineTo(centerX - 16, top + 116);
        ctx.moveTo(centerX, top + 81);
        ctx.lineTo(centerX + 16, top + 116);
        ctx.stroke();
        ctx.lineCap = "butt";
        return;
    } else if (node.classList.contains("usecase-node") || node.classList.contains("attribute-node")) {
        ctx.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    } else if (node.classList.contains("diamond-node") || node.classList.contains("relationship-node")) {
        ctx.moveTo(left + width / 2, top);
        ctx.lineTo(left + width, top + height / 2);
        ctx.lineTo(left + width / 2, top + height);
        ctx.lineTo(left, top + height / 2);
        ctx.closePath();
    } else {
        ctx.rect(left, top, width, height);
    }

    ctx.fill();
    ctx.stroke();

    if (node.classList.contains("lifeline-node")) {
        ctx.beginPath();
        ctx.setLineDash([6, 6]);
        ctx.moveTo(left + width / 2, top + 40);
        ctx.lineTo(left + width / 2, top + height);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function drawWrappedText(ctx, text, x, y, maxWidth) {
    ctx.fillStyle = "#1f2937";
    ctx.font = "13px Segoe UI, Arial, sans-serif";
    text.split("\n").forEach(line => {
        const words = line.split(" ");
        let currentLine = "";

        words.forEach(word => {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                ctx.fillText(currentLine, x, y);
                currentLine = word;
                y += 17;
            } else {
                currentLine = testLine;
            }
        });

        ctx.fillText(currentLine, x, y);
        y += 17;
    });
}

async function downloadDiagramPNG() {
    const blob = await getDiagramPNGBlob();
    if (!blob?.size) return;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "aira-generated-uml.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function downloadDiagramPDF() {
    const canvas = currentPlantUmlSvg && !hasEditableDiagramContent() ? await getPlantUmlCanvas() : getDiagramCanvas();
    if (!canvas) return;

    const image = canvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (!win) return;

    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>AIRA UML Diagram</title>
            <style>
                body { margin: 0; padding: 24px; font-family: Arial, sans-serif; }
                h1 { font-size: 20px; color: #334155; }
                img { width: 100%; max-width: 1000px; border: 1px solid #8aa4d8; }
                @media print { body { padding: 12px; } button { display: none; } }
            </style>
        </head>
        <body>
            <button onclick="window.print()">Save as PDF</button>
            <h1>AIRA Generated UML Diagram</h1>
            <img src="${image}" alt="Generated UML Diagram">
            <script>window.onload = () => window.print();<\/script>
        </body>
        </html>
    `);
    win.document.close();
}

async function downloadDiagramWithFilePicker() {
    if (!hasUnlimitedAccess()) {
        downloadDiagramPDF();
        return;
    }
    if (!window.showSaveFilePicker) {
        downloadDiagramPNG();
        return;
    }

    let fileHandle;

    try {
        fileHandle = await window.showSaveFilePicker({
            suggestedName: "aira-generated-uml.png",
            types: [
                {
                    description: "PNG Image",
                    accept: { "image/png": [".png"] }
                },
                {
                    description: "PDF Document",
                    accept: { "application/pdf": [".pdf"] }
                },
                {
                    description: "Editable AIRA UML Project",
                    accept: { "application/json": [".airauml", ".json"] }
                },
                {
                    description: "Editable SVG Vector",
                    accept: { "image/svg+xml": [".svg"] }
                },
                {
                    description: "Text Document",
                    accept: { "text/plain": [".txt"] }
                }
            ]
        });
    } catch (error) {
        return;
    }

    const fileName = fileHandle.name.toLowerCase();
    let blob;

    if (fileName.endsWith(".pdf")) {
        blob = await getDiagramPDFBlob();
    } else if (fileName.endsWith(".airauml") || fileName.endsWith(".json")) {
        blob = getDiagramProjectBlob();
    } else if (fileName.endsWith(".svg")) {
        blob = getDiagramSVGBlob();
    } else if (fileName.endsWith(".txt")) {
        blob = getDiagramTextBlob();
    } else {
        blob = await getDiagramPNGBlob();
    }

    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
}

function getDiagramProjectBlob() {
    return new Blob([JSON.stringify(serializeDiagramProject(), null, 2)], { type: "application/json" });
}

function getDiagramTextBlob() {
    if (currentPlantUmlSource && !hasEditableDiagramContent()) {
        return new Blob([currentPlantUmlSource], { type: "text/plain" });
    }
    return new Blob([serializeDiagramAsText()], { type: "text/plain" });
}

function serializeDiagramProject() {
    const editor = document.getElementById("diagramEditor");
    const nodes = Array.from(document.querySelectorAll("#diagramEditor .diagram-node")).map(node => ({
        nodeId: node.dataset.nodeId || "",
        className: node.className.replace(/\s?selected|\s?connector-start/g, "").trim(),
        html: node.innerHTML,
        text: node.innerText,
        left: parseInt(node.style.left, 10) || 0,
        top: parseInt(node.style.top, 10) || 0
    }));

    const connectors = Array.from(document.querySelectorAll("#diagramConnectors .connector-line")).map(line => ({
        connectorType: line.dataset.connectorType || "connector",
        from: line.dataset.from || "",
        to: line.dataset.to || "",
        routePoints: line.dataset.routePoints || "",
        customRoutePoints: line.dataset.customRoutePoints || "",
        fromSide: line.dataset.fromSide || "",
        toSide: line.dataset.toSide || ""
    }));

    return {
        format: "aira-uml-project",
        version: 2,
        diagramType: document.getElementById("umlType")?.value || "",
        exportedAt: new Date().toISOString(),
        backgroundImage: editor?.dataset.backgroundImage || "",
        plantUmlSource: hasEditableDiagramContent() ? "" : (currentPlantUmlSource || ""),
        plantUmlSvg: hasEditableDiagramContent() ? "" : (currentPlantUmlSvg || ""),
        nodes,
        connectors
    };
}

function serializeDiagramAsText() {
    const project = serializeDiagramProject();
    const lines = [
        "AIRA UML Diagram",
        `Exported: ${new Date(project.exportedAt).toLocaleString()}`,
        "",
        "Nodes:"
    ];

    if (!project.nodes.length) {
        lines.push("- No editable shapes on the canvas.");
    } else {
        project.nodes.forEach((node, index) => {
            const type = node.className.replace("diagram-node", "").trim() || "shape";
            lines.push(`${index + 1}. ${node.text.replace(/\s+/g, " ").trim() || "(blank)"} [${type}]`);
        });
    }

    lines.push("", "Connectors:");
    if (!project.connectors.length) {
        lines.push("- No connectors.");
    } else {
        project.connectors.forEach((connector, index) => {
            lines.push(`${index + 1}. ${connector.connectorType}: ${connector.from} -> ${connector.to}`);
        });
    }

    if (project.backgroundImage) {
        lines.push("", "Attached diagram reference: included in editable .airauml export and visual image exports.");
    }

    return lines.join("\n");
}

function getDiagramSVGBlob() {
    if (currentPlantUmlSvg && !hasEditableDiagramContent()) {
        return new Blob([currentPlantUmlSvg], { type: "image/svg+xml" });
    }
    const svgText = serializeDiagramAsSVG();
    return new Blob([svgText], { type: "image/svg+xml" });
}

function serializeDiagramAsSVG() {
    const editor = document.getElementById("diagramEditor");
    const width = editor?.offsetWidth || 1000;
    const height = editor?.offsetHeight || 640;
    const project = serializeDiagramProject();
    const parts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `<rect width="100%" height="100%" fill="#f8fbff"/>`
    ];

    if (project.backgroundImage) {
        parts.push(`<image href="${escapeHTML(project.backgroundImage)}" x="${width * 0.04}" y="${height * 0.06}" width="${width * 0.92}" height="${height * 0.88}" preserveAspectRatio="xMidYMid meet" opacity="0.92"/>`);
    }

    project.connectors.forEach(connector => {
        const route = parseConnectorRoute(connector.routePoints);
        if (!route || route.length < 2) return;
        const points = route.map(point => `${point.x},${point.y}`).join(" ");
        parts.push(`<polyline points="${points}" fill="none" stroke="#334155" stroke-width="2"/>`);
    });

    project.nodes.forEach(node => {
        const left = node.left || 0;
        const top = node.top || 0;
        const label = escapeHTML((node.text || "").replace(/\s+/g, " ").trim());
        const className = node.className || "";
        const isActor = className.includes("actor-node");
        const isUsecase = className.includes("usecase-node") || className.includes("attribute-node");
        const isDiamond = className.includes("decision-node") || className.includes("relationship-node");
        const shapeWidth = isActor ? 96 : isDiamond ? 104 : 150;
        const shapeHeight = isActor ? 150 : isDiamond ? 80 : 70;
        if (isActor) {
            const centerX = left + shapeWidth / 2;
            const headY = top + 19;
            parts.push(`<circle cx="${centerX}" cy="${headY}" r="12" fill="#17698c"/>`);
            parts.push(`<line x1="${centerX}" y1="${headY + 17}" x2="${centerX}" y2="${top + 83}" stroke="#17698c" stroke-width="10" stroke-linecap="round"/>`);
            parts.push(`<line x1="${centerX}" y1="${top + 47}" x2="${centerX - 25}" y2="${top + 59}" stroke="#17698c" stroke-width="10" stroke-linecap="round"/>`);
            parts.push(`<line x1="${centerX}" y1="${top + 47}" x2="${centerX + 25}" y2="${top + 59}" stroke="#17698c" stroke-width="10" stroke-linecap="round"/>`);
            parts.push(`<line x1="${centerX}" y1="${top + 81}" x2="${centerX - 16}" y2="${top + 116}" stroke="#17698c" stroke-width="10" stroke-linecap="round"/>`);
            parts.push(`<line x1="${centerX}" y1="${top + 81}" x2="${centerX + 16}" y2="${top + 116}" stroke="#17698c" stroke-width="10" stroke-linecap="round"/>`);
        } else if (isUsecase) {
            parts.push(`<ellipse cx="${left + shapeWidth / 2}" cy="${top + shapeHeight / 2}" rx="${shapeWidth / 2}" ry="${shapeHeight / 2}" fill="#ffffff" stroke="#2f608f" stroke-width="2"/>`);
        } else if (isDiamond) {
            parts.push(`<polygon points="${left + shapeWidth / 2},${top} ${left + shapeWidth},${top + shapeHeight / 2} ${left + shapeWidth / 2},${top + shapeHeight} ${left},${top + shapeHeight / 2}" fill="#ffffff" stroke="#2f608f" stroke-width="2"/>`);
        } else {
            parts.push(`<rect x="${left}" y="${top}" width="${shapeWidth}" height="${shapeHeight}" rx="8" fill="#ffffff" stroke="#2f608f" stroke-width="2"/>`);
        }
        parts.push(`<text x="${left + shapeWidth / 2}" y="${isActor ? top + 140 : top + shapeHeight / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Arial, sans-serif" font-size="13" fill="#102033">${label}</text>`);
    });

    parts.push("</svg>");
    return parts.join("\n");
}

async function getDiagramPNGBlob() {
    if (currentPlantUmlSvg && !hasEditableDiagramContent()) {
        const plantUmlCanvas = await getPlantUmlCanvas();
        if (!plantUmlCanvas) return new Blob();
        return new Promise(resolve => {
            plantUmlCanvas.toBlob(blob => resolve(blob), "image/png");
        });
    }

    const canvas = getDiagramCanvas();
    if (!canvas) return new Blob();

    return new Promise(resolve => {
        canvas.toBlob(blob => resolve(blob), "image/png");
    });
}

async function getDiagramPDFBlob() {
    const canvas = currentPlantUmlSvg && !hasEditableDiagramContent() ? await getPlantUmlCanvas() : getDiagramCanvas();
    if (!canvas) return new Blob();

    const imageData = canvas.toDataURL("image/jpeg", 0.92);
    const imageBytes = base64ToBytes(imageData.split(",")[1]);
    const pageWidth = 842;
    const pageHeight = 595;
    const margin = 36;
    const imageWidth = pageWidth - margin * 2;
    const imageHeight = Math.min(pageHeight - margin * 2, imageWidth * canvas.height / canvas.width);
    const imageX = margin;
    const imageY = pageHeight - margin - imageHeight;
    const contentStream = `q\n${imageWidth} 0 0 ${imageHeight} ${imageX} ${imageY} cm\n/Im1 Do\nQ`;

    const objects = [
        asciiBytes("<< /Type /Catalog /Pages 2 0 R >>"),
        asciiBytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
        asciiBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`),
        concatBytes(
            asciiBytes(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`),
            imageBytes,
            asciiBytes("\nendstream")
        ),
        asciiBytes(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`)
    ];

    return new Blob([buildPDF(objects)], { type: "application/pdf" });
}

async function getPlantUmlCanvas() {
    if (!currentPlantUmlSvg) return null;

    const svgBlob = new Blob([currentPlantUmlSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    try {
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error("Unable to prepare the PlantUML diagram for export."));
            image.src = url;
        });

        const width = Math.max(image.naturalWidth || image.width || 1200, 800);
        const height = Math.max(image.naturalHeight || image.height || 700, 500);
        const scale = Math.min(2, 2200 / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas;
    } finally {
        URL.revokeObjectURL(url);
    }
}

function base64ToBytes(base64) {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);

    for (let i = 0; i < raw.length; i += 1) {
        bytes[i] = raw.charCodeAt(i);
    }

    return bytes;
}

function asciiBytes(text) {
    const bytes = new Uint8Array(text.length);

    for (let i = 0; i < text.length; i += 1) {
        bytes[i] = text.charCodeAt(i);
    }

    return bytes;
}

function concatBytes(...chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(totalLength);
    let offset = 0;

    chunks.forEach(chunk => {
        output.set(chunk, offset);
        offset += chunk.length;
    });

    return output;
}

function buildPDF(objects) {
    let pdf = asciiBytes("%PDF-1.4\n");
    const offsets = [0];

    objects.forEach((object, index) => {
        offsets.push(pdf.length);
        pdf = concatBytes(
            pdf,
            asciiBytes(`${index + 1} 0 obj\n`),
            object,
            asciiBytes("\nendobj\n")
        );
    });

    const xrefOffset = pdf.length;
    let xref = `xref\n0 ${objects.length + 1}\n`;
    xref += "0000000000 65535 f \n";

    offsets.slice(1).forEach(offset => {
        xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });

    xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    xref += `startxref\n${xrefOffset}\n%%EOF`;

    return concatBytes(pdf, asciiBytes(xref));
}

function toggleDownloadMenu(event) {
    event.stopPropagation();

    const menu = document.getElementById("umlDownloadOptions");
    if (!menu) return;

    menu.classList.toggle("show");
}

document.addEventListener("click", () => {
    const menu = document.getElementById("umlDownloadOptions");
    if (menu) menu.classList.remove("show");
    document.querySelectorAll(".sidebar-user-account.open").forEach(item => item.classList.remove("open"));
    document.getElementById("srsStyleContextMenu")?.classList.remove("show");
    document.getElementById("srsFontColorPalette")?.classList.remove("show");
    hideDiagramContextMenu();
});

document.addEventListener("selectionchange", () => {
    window.requestAnimationFrame(updateSrsFloatingToolbar);
});

document.addEventListener("scroll", () => {
    if (document.getElementById("srsFloatingToolbar")?.classList.contains("show")) {
        updateSrsFloatingToolbar();
    }
}, true);

document.addEventListener("mousedown", event => {
    if (event.target.closest?.(".srs-floating-toolbar button")) {
        event.preventDefault();
    }
    if (!event.target.closest?.("#srsOutputContent, #srsFloatingToolbar")) {
        document.getElementById("srsFloatingToolbar")?.classList.remove("show");
    }
});

document.addEventListener("contextmenu", event => {
    const styleTile = event.target.closest?.(".style-tile");
    if (!styleTile) return;
    openSrsStyleModifyMenu(event, styleTile.dataset.styleName || "normal");
});
