// server.js (ESM, works with "type": "module")
// server.js (ESM, works with "type": "module")
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;
const SRC_DIR = path.join(ROOT, "src");
const PUBLIC_DIR = path.join(ROOT, "public");
const THEMES_DIR = path.join(ROOT, "themes");        // <— NEW

// CSV log in /tmp (ephemeral on free Render)
const LOG_CSV = "/tmp/msswidget-log.csv";

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------- middleware ---------- */
app.use(
  cors({
    origin: "*", // fine for dev / admin tools
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-ADMIN-KEY", "API-KEY", "X-API-SECRET"],
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(PUBLIC_DIR));

// Explicit /themes mount, tries public/themes first, then root/themes
app.use(
  "/themes",
  express.static(path.join(PUBLIC_DIR, "themes"))
);
app.use(
  "/themes",
  express.static(THEMES_DIR)
);
/* ---------- helpers ---------- */

async function ensureSrcDir() {
  try {
    await fs.mkdir(SRC_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

async function readJson(rel, fallback = {}) {
  await ensureSrcDir();
  const full = path.join(SRC_DIR, rel);
  try {
    const txt = await fs.readFile(full, "utf8");
    return JSON.parse(txt);
  } catch {
    // create default if missing
    await fs.writeFile(full, JSON.stringify(fallback, null, 2), "utf8");
    return fallback;
  }
}

async function writeJson(rel, obj) {
  await ensureSrcDir();
  const full = path.join(SRC_DIR, rel);
  await fs.writeFile(full, JSON.stringify(obj ?? {}, null, 2), "utf8");
}

/* ---------- default shapes ---------- */

const defaultForm = {
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

const defaultConfig = {
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
    baseUrl: "",
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

const defaultImages = {
  logoDataUrl: "",
};

/* ---------- ADMIN KEY (optional) ---------- */
// You can add this to Render env later, e.g. ADMIN_WRITE_KEY=mysecret
const ADMIN_WRITE_KEY = process.env.ADMIN_WRITE_KEY || "";

// simple guard
function checkAdminKey(req, res) {
  if (!ADMIN_WRITE_KEY) return true; // no key set → allow all (dev mode)
  const header = req.header("X-ADMIN-KEY");
  if (header && header === ADMIN_WRITE_KEY) return true;
  res.status(401).json({ ok: false, error: "admin unauthorized" });
  return false;
}

/* ---------- CONFIG ROUTES ---------- */

// FORMS (form.json)
app.get("/config/forms", async (req, res) => {
  try {
    const data = await readJson("form.json", defaultForm);
    res.json(data);
  } catch (e) {
    console.error("GET /config/forms error:", e);
    res.status(500).json({ error: "failed to read forms" });
  }
});

app.put("/config/forms", async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    await writeJson("form.json", body);
    res.json({ ok: true });
  } catch (e) {
    console.error("PUT /config/forms error:", e);
    res.status(500).json({ ok: false, error: "failed to write forms" });
  }
});

// WIDGET CONFIG (config.json)
app.get("/config/widget", async (req, res) => {
  try {
    const data = await readJson("config.json", defaultConfig);
    res.json(data);
  } catch (e) {
    console.error("GET /config/widget error:", e);
    res.status(500).json({ error: "failed to read widget config" });
  }
});

app.put("/config/widget", async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    await writeJson("config.json", body);
    res.json({ ok: true });
  } catch (e) {
    console.error("PUT /config/widget error:", e);
    res.status(500).json({ ok: false, error: "failed to write widget config" });
  }
});

// IMAGES (image.json)
app.get("/config/images", async (req, res) => {
  try {
    const data = await readJson("image.json", defaultImages);
    res.json(data);
  } catch (e) {
    console.error("GET /config/images error:", e);
    res.status(500).json({ error: "failed to read images" });
  }
});

app.put("/config/images", async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    await writeJson("image.json", body);
    res.json({ ok: true });
  } catch (e) {
    console.error("PUT /config/images error:", e);
    res.status(500).json({ ok: false, error: "failed to write images" });
  }
});

/* ---------- LOGGING ENDPOINT ---------- */

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// simple CSV parser that understands quotes, commas, and escaped quotes
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          // escaped quote
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }

  out.push(cur);
  return out;
}

app.post("/log/submission", async (req, res) => {
  try {
    const body = req.body || {};
    const headers = [
      "timestamp",
      "ip",
      "userId",
      "fileName",
      "lengthSec",
      "submitTime",
      "toefl",
      "ielts",
      "pte",
      "cefr",
      "question",
      "transcript",
      "wpm",
    ];

    const rowValues = headers.map((h) => body[h] ?? "");
    const line = rowValues.map(csvEscape).join(",") + "\n";

    let prefix = "";
    try {
      await fs.access(LOG_CSV);
    } catch {
      // file doesn’t exist → write header first
      prefix = headers.join(",") + "\n";
    }

    await fs.appendFile(LOG_CSV, prefix + line, "utf8");

    res.json({ ok: true, file: LOG_CSV });
  } catch (e) {
    console.error("POST /log/submission error:", e);
    res.status(500).json({ ok: false, error: "log failed" });
  }
});

// READ log as JSON for admin report UI
app.get("/log/submissions", async (req, res) => {
  try {
    let csv;
    try {
      csv = await fs.readFile(LOG_CSV, "utf8");
    } catch {
      // no log file yet
      return res.json({ headers: [], rows: [] });
    }

    const trimmed = csv.trim();
    if (!trimmed) {
      return res.json({ headers: [], rows: [] });
    }

    const lines = trimmed.split(/\r?\n/);
    if (!lines.length) {
      return res.json({ headers: [], rows: [] });
    }

    const headers = parseCsvLine(lines[0]);

    const rows = lines
      .slice(1)
      .filter((l) => l.trim() !== "")
      .map((line, idx) => {
        const cols = parseCsvLine(line);
        const row = { id: idx }; // row index in the CSV
        headers.forEach((h, i) => {
          row[h] = cols[i] ?? "";
        });
        return row;
      });

    res.json({ headers, rows });
  } catch (e) {
    console.error("GET /log/submissions error:", e);
    res.status(500).json({ ok: false, error: "failed to read log" });
  }
});

/* ---------- simple root ---------- */

app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

/* ---------- start server ---------- */

app.listen(PORT, () => {
  console.log(`✅ MSS Widget service listening on port ${PORT}`);
});
