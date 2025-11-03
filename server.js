// server.js
// MSS Widget – Render service
// - serves public/
// - serves GET/PUT for 3 config files
// - falls back to repo /src if /data is empty
// - simple CSV logger

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

// --------------------------------------------------
// basic env
// --------------------------------------------------
const PORT = process.env.PORT || 10000;

// absolute paths on Render
// (this is where the repo lives at runtime)
const ROOT_DIR = process.cwd(); // /opt/render/project/src
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const SRC_DIR = path.join(ROOT_DIR, "src");   // committed JSONs live here
const DATA_DIR = path.join(ROOT_DIR, "data"); // runtime-writable

// make sure /data exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --------------------------------------------------
// middleware
// --------------------------------------------------
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// static (for Widget.html, WidgetAdmin.html, WidgetSurvey.html, themes, etc.)
app.use(express.static(PUBLIC_DIR));

// --------------------------------------------------
// helpers
// --------------------------------------------------
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const txt = fs.readFileSync(filePath, "utf8");
    return JSON.parse(txt);
  } catch (err) {
    console.warn("JSON parse failed for:", filePath, err.message);
    return null;
  }
}

function writeJsonFile(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function getConfigObject(kind) {
  // kind: "widget" | "forms" | "images"
  const fileName =
    kind === "widget"
      ? "config.json"
      : kind === "forms"
      ? "form.json"
      : "image.json";

  const dataFile = path.join(DATA_DIR, fileName);
  const srcFile = path.join(SRC_DIR, fileName);

  // 1) try runtime data first
  let obj = readJsonFile(dataFile);
  if (obj) return obj;

  // 2) then repo src
  obj = readJsonFile(srcFile);
  if (obj) return obj;

  // 3) finally, baked-in defaults
  if (kind === "widget") {
    return {
      editable: {
        headline: true,
        recordButton: true,
        previousButton: true,
        nextButton: true,
        poweredByLabel: true,
        uploadButton: true,
        stopButton: true,
        NotRecordingLabel: true,
        SubmitForScoringButton: true
      },
      theme: "apple",
      api: {
        enabled: true,
        baseUrl: "https://app.myspeakingscore.com",
        // your current keys – you can remove them if you want to keep them only in /src
        key: "6830272b-7a34-4341-a367-8eb840664976",
        secret: "1e9f78e2-ec19-4727-8434-fd7df9a8bd5a"
      },
      logger: {
        enabled: true,
        url: "https://msswidget-dev.onrender.com/log/submission"
      },
      audioMinSeconds: 20,
      audioMaxSeconds: 90
    };
  }

  if (kind === "forms") {
    return {
      headline: "Practice TOEFL Speaking Test",
      poweredByLabel: "Powered by MSS Vox",
      recordButton: "Record your response",
      stopButton: "Stop",
      uploadButton: "Choose an audio file",
      SubmitForScoringButton: "Submit for scoring",
      previousButton: "Previous",
      nextButton: "Next",
      NotRecordingLabel: "Not recording",
      survey: ["Tell me about your hometown."]
    };
  }

  // images default
  return {
    logoDataUrl: ""
  };
}

function saveConfigObject(kind, obj) {
  const fileName =
    kind === "widget"
      ? "config.json"
      : kind === "forms"
      ? "form.json"
      : "image.json";
  const dataFile = path.join(DATA_DIR, fileName);
  writeJsonFile(dataFile, obj);
}

// --------------------------------------------------
// small admin guard (optional)
// --------------------------------------------------
function requireAdmin(req, res, next) {
  const configuredKey = process.env.ADMIN_WRITE_KEY || ""; // set in Render if you want
  if (!configuredKey) {
    // no key set -> allow everyone
    return next();
  }
  const incomingKey = req.header("X-ADMIN-KEY") || "";
  if (incomingKey && incomingKey === configuredKey) return next();
  return res.status(401).json({ ok: false, error: "unauthorized" });
}

// --------------------------------------------------
// routes: health
// --------------------------------------------------
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// --------------------------------------------------
// routes: GET configs
// --------------------------------------------------
app.get("/config/widget", (req, res) => {
  const cfg = getConfigObject("widget");
  res.json(cfg);
});

app.get("/config/forms", (req, res) => {
  const frm = getConfigObject("forms");
  res.json(frm);
});

app.get("/config/images", (req, res) => {
  const img = getConfigObject("images");
  res.json(img);
});

// --------------------------------------------------
// routes: PUT configs (WidgetAdmin will call these)
// --------------------------------------------------
app.put("/config/widget", requireAdmin, (req, res) => {
  saveConfigObject("widget", req.body || {});
  res.json({ ok: true });
});

app.put("/config/forms", requireAdmin, (req, res) => {
  saveConfigObject("forms", req.body || {});
  res.json({ ok: true });
});

app.put("/config/images", requireAdmin, (req, res) => {
  saveConfigObject("images", req.body || {});
  res.json({ ok: true });
});

// --------------------------------------------------
// logging
// --------------------------------------------------
app.post("/log/submission", express.json(), (req, res) => {
  try {
    const logFile = path.join(DATA_DIR, "log.csv");
    const {
      timestamp = new Date().toISOString(),
      ip = req.ip || "",
      userId = "",
      fileName = "",
      lengthSec = "",
      submitTime = "",
      toefl = "",
      ielts = "",
      pte = "",
      cefr = "",
      question = "",
      transcript = "",
      wpm = ""
    } = req.body || {};

    const line = [
      timestamp,
      ip,
      userId,
      fileName,
      lengthSec,
      submitTime,
      toefl,
      ielts,
      pte,
      cefr,
      JSON.stringify(question),
      JSON.stringify(transcript),
      wpm
    ].join(",");

    const exists = fs.existsSync(logFile);
    if (!exists) {
      fs.writeFileSync(
        logFile,
        "timestamp,ip,userId,fileName,lengthSec,submitTime,toefl,ielts,pte,cefr,question,transcript,wpm\n",
        "utf8"
      );
    }
    fs.appendFileSync(logFile, line + "\n", "utf8");

    res.json({ ok: true, file: "log.csv" });
  } catch (err) {
    console.error("log write failed:", err);
    res.status(500).json({ ok: false, error: "log failed" });
  }
});

// --------------------------------------------------
// start
// --------------------------------------------------
app.listen(PORT, () => {
  console.log("✅ MSS Widget service running on port", PORT);
});
