// server.js (ESM)

import express from "express";
import cors from "cors";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

const app = express();

// ---------- Paths ----------
const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const SRC_DIR = path.join(ROOT, "src");

// config files
const FORM_FILE   = path.join(SRC_DIR, "form.json");
const WIDGET_FILE = path.join(SRC_DIR, "config.json");
const IMAGE_FILE  = path.join(SRC_DIR, "image.json");

// logging files (ephemeral, fine for dev)
const CSV_PATH   = "/tmp/logger.csv";
const NOTES_PATH = "/tmp/notes.json";

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());

// serve your HTML/JS/CSS from public/
app.use(express.static(PUBLIC_DIR));

/* ------------------------------------------------------------------
   Helpers for JSON config files
------------------------------------------------------------------ */
async function readJsonSafe(filePath, fallback) {
  try {
    const txt = await fsp.readFile(filePath, "utf8");
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

async function writeJsonSafe(filePath, obj) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(obj ?? {}, null, 2), "utf8");
}

/* ------------------------------------------------------------------
   CONFIG ENDPOINTS  (used by Widget, WidgetAdmin, WidgetSurvey)
------------------------------------------------------------------ */

// ----- FORMS -----
app.get("/config/forms", async (req, res) => {
  const fallback = {
    headline: "Practice TOEFL Speaking Test",
    recordButton: "Record your response",
    previousButton: "Previous",
    nextButton: "Next",
    uploadButton: "Choose an audio file",
    stopButton: "Stop",
    poweredByLabel: "Powered by MSS Vox",
    NotRecordingLabel: "Not recording",
    SubmitForScoringButton: "Submit for scoring",
    survey: [],
  };
  const data = await readJsonSafe(FORM_FILE, fallback);
  res.json(data);
});

app.put("/config/forms", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  await writeJsonSafe(FORM_FILE, body);
  res.json({ ok: true });
});

// ----- WIDGET CONFIG -----
app.get("/config/widget", async (req, res) => {
  const fallback = {
    editable: {
      headline: true,
      recordButton: true,
      previousButton: true,
      nextButton: true,
      poweredByLabel: true,
      uploadButton: true,
      stopButton: true,
      NotRecordingLabel: true,
      SubmitForScoringButton: true,
    },
    theme: "apple",
    api: {
      enabled: true,
      baseUrl: "https://app.myspeakingscore.com",
      key: "",
      secret: "",
    },
    logger: {
      enabled: false,
      url: "",
    },
    audioMinSeconds: 30,
    audioMaxSeconds: 61,
  };
  const data = await readJsonSafe(WIDGET_FILE, fallback);
  res.json(data);
});

app.put("/config/widget", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  await writeJsonSafe(WIDGET_FILE, body);
  res.json({ ok: true });
});

// ----- IMAGES -----
app.get("/config/images", async (req, res) => {
  const fallback = { logoDataUrl: "" };
  const data = await readJsonSafe(IMAGE_FILE, fallback);
  res.json(data);
});

app.put("/config/images", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  await writeJsonSafe(IMAGE_FILE, body);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------
   LOGGING + REPORTING (for Widget + Report.html)
------------------------------------------------------------------ */

async function ensureCsvHeader() {
  try {
    await fsp.access(CSV_PATH, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(
      CSV_PATH,
      "timestamp,toefl,ielts,cefr,fileName,lengthSec,question,extra\n",
      "utf8"
    );
  }
}

async function readNotes() {
  try {
    const txt = await fsp.readFile(NOTES_PATH, "utf8");
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

async function writeNotes(obj) {
  await fsp.writeFile(NOTES_PATH, JSON.stringify(obj, null, 2), "utf8");
}

function parseCsvToObjects(csv) {
  const lines = csv.trim().split("\n");
  if (lines.length <= 1) return [];
  const header = lines[0].split(",").map((s) => s.trim());

  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const obj = {};
    header.forEach((h, i) => (obj[h] = (cells[i] ?? "").trim()));
    obj.id = `${obj.timestamp}|${obj.fileName}`;
    return obj;
  });
}

// POST /log/submission  (called by Widget after MSS returns JSON)
app.post("/log/submission", async (req, res) => {
  try {
    await ensureCsvHeader();

    const {
      timestamp = new Date().toISOString(),
      toefl = "",
      ielts = "",
      cefr = "",
      fileName = "",
      lengthSec = "",
      question = "",
      extra = "",
    } = req.body || {};

    const safeQuestion = String(question).replace(/"/g, "'");
    const safeExtra = String(extra).replace(/"/g, "'");

    const line =
      `${timestamp},${toefl},${ielts},` +
      `${cefr},"${fileName}",${lengthSec},"${safeQuestion}","${safeExtra}"\n`;

    await fsp.appendFile(CSV_PATH, line, "utf8");
    res.json({ ok: true, file: CSV_PATH });
  } catch (e) {
    console.error("❌ Logger error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// GET /log/download → raw CSV
app.get("/log/download", async (req, res) => {
  try {
    await ensureCsvHeader();
    res.download(CSV_PATH, "logger.csv");
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// GET /log/list?limit=200 → parsed rows + attached notes
app.get("/log/list", async (req, res) => {
  const limit = Math.max(1, Math.min(2000, Number(req.query.limit || 200)));
  try {
    await ensureCsvHeader();
    const csv = await fsp.readFile(CSV_PATH, "utf8");
    const lines = csv.trimEnd().split("\n");
    const head = lines[0];
    const body = lines.slice(1);
    const tail = body.slice(Math.max(0, body.length - limit));
    const parsed = parseCsvToObjects([head, ...tail].join("\n"));

    const notes = await readNotes();
    const merged = parsed.map((r) => ({
      ...r,
      note: notes[r.id]?.note || "",
      teacher: notes[r.id]?.teacher || "",
    }));

    res.json({ ok: true, rows: merged });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// POST /log/note { id, note, teacher }
app.post("/log/note", async (req, res) => {
  try {
    const { id, note = "", teacher = "" } = req.body || {};
    if (!id) {
      return res.status(400).json({ ok: false, error: "id required" });
    }
    const notes = await readNotes();
    notes[id] = { note, teacher, updatedAt: new Date().toISOString() };
    await writeNotes(notes);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ------------------------------------------------------------------
   Health check
------------------------------------------------------------------ */
app.get("/healthz", (req, res) => res.send("ok"));

/* ------------------------------------------------------------------
   Start server
------------------------------------------------------------------ */
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(
    `✅ MSS Widget service running on port ${port} at ${new Date().toISOString()}`
  );
});
