// server.js — MSS Widget Dev Server
// Compatible with Render free tier (no persistent disk required)

import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

/* ---------- PATH SETUP ---------- */
const __dirname = path.resolve();
const CONFIG_DIR = path.join(__dirname, "src");
const LOG_PATH =
  process.env.NODE_ENV === "production"
    ? "/tmp/logger.csv" // ephemeral on free tier
    : "./logger.csv";   // local dev

/* ---------- HELPER FUNCTIONS ---------- */
function jsonFile(file) {
  return path.join(CONFIG_DIR, file);
}
function safeReadJSON(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(jsonFile(file), "utf8"));
  } catch {
    return fallback;
  }
}
function safeWriteJSON(file, obj) {
  fs.writeFileSync(jsonFile(file), JSON.stringify(obj, null, 2));
}

/* ---------- CONFIG ROUTES ---------- */
app.get("/config/forms", (req, res) =>
  res.json(safeReadJSON("form.json", { headline: "Practice Test", survey: [] }))
);
app.put("/config/forms", (req, res) => {
  safeWriteJSON("form.json", req.body || {});
  res.json({ status: "ok", file: "form.json" });
});

app.get("/config/widget", (req, res) =>
  res.json(
    safeReadJSON("config.json", {
      theme: "apple",
      api: { baseUrl: "", key: "", secret: "" },
      logger: { enabled: true, url: "" },
      audioMinSeconds: 30,
      audioMaxSeconds: 60,
    })
  )
);
app.put("/config/widget", (req, res) => {
  safeWriteJSON("config.json", req.body || {});
  res.json({ status: "ok", file: "config.json" });
});

app.get("/config/images", (req, res) =>
  res.json(safeReadJSON("image.json", { logoDataUrl: "" }))
);
app.put("/config/images", (req, res) => {
  safeWriteJSON("image.json", req.body || {});
  res.json({ status: "ok", file: "image.json" });
});

/* ---------- LOGGING ROUTE ---------- */
app.post("/log/submission", (req, res) => {
  const logLine = `${new Date().toISOString()},${JSON.stringify(req.body)}\n`;
  try {
    fs.appendFileSync(LOG_PATH, logLine);
    console.log("Logged submission:", req.body);
    res.json({ status: "logged", file: LOG_PATH });
  } catch (err) {
    console.error("Log write error:", err);
    res.status(500).json({ status: "error", message: "Failed to log" });
  }
});

/* ---------- HEALTH CHECK ---------- */
app.get("/health", (req, res) => res.json({ status: "ok" }));

/* ---------- START SERVER ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ MSS Widget Dev Server running on port ${PORT}`)
);
