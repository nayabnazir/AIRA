const express = require("express");
const cors = require("cors");
const path = require("path");
const billing = require("./routes/billing");

const app = express();
app.use(cors());
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), billing.webhook);
app.use(express.json({ limit: "50mb" }));

app.use("/api", require("./routes/auth"));
app.use("/api", require("./routes/history"));
app.use("/api", require("./routes/umlTitle"));
app.use("/api", require("./routes/srsGeneration"));
app.use("/api", require("./routes/fileExtraction"));
app.use("/api", require("./routes/aiModels"));
app.use("/api", require("./routes/plantUmlRenderer"));
app.use("/api", billing.router);
app.use("/frontend", express.static(path.join(__dirname, "..", "frontend")));
app.get("/", (_req, res) => res.redirect("/frontend/Pages/index.html"));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
