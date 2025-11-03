// server.js (ES module)
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ---------- CONFIG ---------- */
const ADMIN_WRITE_KEY = process.env.ADMIN_WRITE_KEY || ""; // optional
// If you want to restrict, replace origin: true with a whitelist check.
app.use(cors({
  origin: true,
  methods: ["GET", "PUT", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-ADMIN-KEY"],
}));
app.use(express.json({ limit: "2mb" }));

/* ---------- STATIC (optional) ---------- */
// If you deploy the admin/widget from this service too:
app.use(express.static(path.join(__dirname, "public")));

/* ---------- STORAGE (JSON files on disk) ---------- */
// IMPORTANT on Render: attach a *Persistent Disk* and mount it to this path.
const dataDir = path.join(__dirname, "data");
await fs.mkdir(dataDir, { recursive: true });

const files = {
  forms:  path.join(dataDir, "form.json"),
  widget: path.join(dataDir, "config.json"),
  images: path.join(dataDir, "image.json"),
};

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch { return fallback; }
}
async function writeJson(file, obj) {
  await fs.writeFile(file, JSON.stringify(obj ?? {}, null, 2), "utf8");
}

function requireAdmin(req, res, next) {
  if (!ADMIN_WRITE_KEY) return next(); // auth disabled if no key set
  const key = req.get("X-ADMIN-KEY") || "";
  if (key !== ADMIN_WRITE_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

/* ---------- GET (Widget & Admin read) ---------- */
app.get("/config/forms",  async (_req, res) => {
  res.json(await readJson(files.forms,  { headline: "Practice TOEFL Speaking Test", survey: [] }));
});
app.get("/config/widget", async (_req, res) => {
  res.json(await readJson(files.widget, {
    editable: {
      headline: true, recordButton: true, previousButton: true, nextButton: true,
      poweredByLabel: true, uploadButton: true, stopButton: true,
      NotRecordingLabel: true, SubmitForScoringButton: true
    },
    theme: "apple",
    api: { enabled: true, baseUrl: "", key: "", secret: "" },
    logger: { enabled: false, url: "" },
    audioMinSeconds: 30,
    audioMaxSeconds: 61
  }));
});
app.get("/config/images", async (_req, res) => {
  res.json(await readJson(files.images, { logoDataUrl: "" }));
});

/* ---------- PUT (Admin save) ---------- */
app.put("/config/forms",  requireAdmin, async (req, res) => {
  await writeJson(files.forms,  req.body);
  res.json({ ok: true });
});
app.put("/config/widget", requireAdmin, async (req, res) => {
  await writeJson(files.widget, req.body);
  res.json({ ok: true });
});
app.put("/config/images", requireAdmin, async (req, res) => {
  await writeJson(files.images, req.body);
  res.json({ ok: true });
});

/* ---------- Optional: submission logging used by the widget ---------- */
app.post("/log/submission", async (req, res) => {
  // Keep simple; feel free to append to a file instead.
  console.log("[log/submission]", req.body);
  res.json({ ok: true });
});

/* ---------- Health ---------- */
app.get("/health", (_req, res) => res.json({ ok: true }));

/* ---------- Start ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("MSS widget service listening on", PORT));
