// server.js  (ESM)
// package.json has "type": "module"

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Folders
const ROOT = process.cwd();                          // /opt/render/project/src
const DATA_DIR = path.join(ROOT, "data");            // writable at runtime (attach a disk to persist)
const SRC_DIR  = path.join(ROOT, "src");             // your repo defaults
const PUB_DIR  = path.join(ROOT, "public");          // static files

// Optional admin write key for PUT/updates (configure in Render → Environment)
const ADMIN_WRITE_KEY = process.env.ADMIN_WRITE_KEY || "";

// Ensure /data exists
if (!existsSync(DATA_DIR)) {
  await fs.mkdir(DATA_DIR, { recursive: true }).catch(() => {});
}

// ---------- helpers ----------
async function readJsonWithFallback(name, fallbackObj = {}) {
  const dataPath = path.join(DATA_DIR, name);
  const srcPath  = path.join(SRC_DIR, name);
  try {
    if (existsSync(dataPath)) {
      const t = await fs.readFile(dataPath, "utf8");
      return JSON.parse(t);
    }
  } catch {}
  try {
    if (existsSync(srcPath)) {
      const t = await fs.readFile(srcPath, "utf8");
      return JSON.parse(t);
    }
  } catch {}
  return fallbackObj;
}

async function writeJsonToData(name, obj) {
  const p = path.join(DATA_DIR, name);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj ?? {}, null, 2), "utf8");
  return { ok: true, path: p };
}

function checkAdmin(req, res) {
  if (!ADMIN_WRITE_KEY) return true; // open if no key set
  const h = req.get("X-ADMIN-KEY") || "";
  if (h && h === ADMIN_WRITE_KEY) return true;
  res.status(403).json({ ok: false, error: "Forbidden (bad admin key)" });
  return false;
}

// ---------- GET (Render-first, Git fallback) ----------
app.get("/config/widget", async (_req, res) => {
  const cfg = await readJsonWithFallback("config.json", {
    editable: {},
    theme: "apple",
    api: { enabled: true, baseUrl: "", key: "", secret: "" },
    logger: { enabled: false, url: "" },
    audioMinSeconds: 30,
    audioMaxSeconds: 61
  });
  res.json(cfg);
});

app.get("/config/forms", async (_req, res) => {
  const form = await readJsonWithFallback("form.json", {
    headline: "Practice TOEFL Speaking Test",
    poweredByLabel: "Powered by MSS Vox",
    recordButton: "Record your response",
    stopButton: "Stop",
    uploadButton: "Choose an audio file",
    SubmitForScoringButton: "Submit for scoring",
    previousButton: "Previous",
    nextButton: "Next",
    NotRecordingLabel: "Not recording",
    survey: []
  });
  res.json(form);
});

app.get("/config/images", async (_req, res) => {
  const img = await readJsonWithFallback("image.json", { logoDataUrl: "" });
  res.json(img);
});

// ---------- PUT (write to /data) ----------
app.put("/config/widget", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const result = await writeJsonToData("config.json", req.body);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.put("/config/forms", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const result = await writeJsonToData("form.json", req.body);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.put("/config/images", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const result = await writeJsonToData("image.json", req.body);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// optional: simple POST log sink
app.post("/log/submission", async (req, res) => {
  // you can write to /data/log.jsonl if desired
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...req.body }) + "\n";
    await fs.appendFile(path.join(DATA_DIR, "log.jsonl"), line, "utf8");
  } catch {}
  res.json({ ok: true });
});

// ---------- static ----------
app.use(express.static(PUB_DIR, { extensions: ["html"] }));

// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---------- start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MSS widget service listening on :${PORT}`);
});
