import express from "express";
import cors from "cors";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(".")); // serve public folder if present

// ---------- BASIC TESTFORM ROUTES ----------
const filePath = path.join(process.cwd(), "testform.json");

app.get("/testform.json", (req, res) => {
  try {
    const data = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, "utf8"))
      : { message: "hello vercel" };
    res.json(data);
  } catch {
    res.status(500).json({ message: "error reading file" });
  }
});

app.post("/testform.json", (req, res) => {
  const msg = req.body.message || "no message";
  fs.writeFileSync(filePath, JSON.stringify({ message: msg }, null, 2));
  res.json({ message: msg });
});

// ---------- LOGGER + REPORT FEATURE ----------
const CSV_PATH = "/tmp/logger.csv";
const NOTES_PATH = "/tmp/notes.json";

// Ensure CSV header
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

// POST /log/submission → write CSV row
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

    const line = `${timestamp},${toefl},${ielts},${cefr},"${fileName}",${lengthSec},"${question.replace(/"/g, "'")}","${extra.replace(/"/g, "'")}"\n`;
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

// GET /log/list?limit=200 → parsed rows + notes
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
    if (!id) return res.status(400).json({ ok: false, error: "id required" });
    const notes = await readNotes();
    notes[id] = { note, teacher, updatedAt: new Date().toISOString() };
    await writeNotes(notes);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Health check (for Render)
app.get("/healthz", (req, res) => res.send("ok"));

// ---------- START SERVER ----------
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`✅ Service running on port ${port} (${new Date().toLocaleTimeString()})`)
);
