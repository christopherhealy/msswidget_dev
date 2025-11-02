// server.js — ESM, with aliases for config
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 10000;

const SRC_DIR = path.join(__dirname, "src");
const LOG_DIR = path.join(__dirname, "logger");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function readJson(basename, fallback) {
  const file = path.join(SRC_DIR, basename);
  if (!fs.existsSync(file)) return fallback;
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[msswidget] JSON parse failed for", basename, e);
    return fallback;
  }
}

function writeCsvRow(obj) {
  const file = path.join(LOG_DIR, "submissions.csv");
  const header = [
    "timestamp",
    "ip",
    "fileName",
    "lengthSec",
    "submitTime",
    "toefl",
    "ielts",
    "pte",
    "cefr",
    "question",
    "transcript",
    "wpm"
  ];
  const exists = fs.existsSync(file);
  const line = header.map((k) =>
    (obj[k] ?? "").toString().replace(/"/g, '""')
  );
  const row = `"${line.join('","')}"\n`;
  if (!exists) {
    fs.writeFileSync(`"${header.join('","')}"\n`.replace(/""/g,'"') + row, "utf8");
  } else {
    fs.appendFileSync(file, row, "utf8");
  }
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // --- CONFIG (multiple aliases) ---
  if (
    req.method === "GET" &&
    (
      pathname === "/config/widget" ||
      pathname === "/config" ||
      pathname === "/config.json"
    )
  ) {
    const data = readJson("config.json", {
      editable: {},
      theme: "apple",
      api: {
        enabled: true,
        baseUrl: "https://app.myspeakingscore.com",
        key: "",
        secret: ""
      },
      audioMinSeconds: 30,
      audioMaxSeconds: 61,
      logger: {
        enabled: false,
        url: "https://msswidget-dev.onrender.com/log/submission"
      }
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  // --- FORMS ---
  if (req.method === "GET" && pathname === "/config/forms") {
    const data = readJson("form.json", {
      headline: "Practice TOEFL Speaking Test",
      survey: ["Tell me about your hometown."]
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  // --- IMAGES ---
  if (req.method === "GET" && pathname === "/config/images") {
    const data = readJson("image.json", {});
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  // --- LOGGING ---
  if (req.method === "POST" && pathname === "/log/submission") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        parsed.timestamp = parsed.timestamp || new Date().toISOString();
        parsed.ip =
          req.headers["x-forwarded-for"] ||
          req.socket.remoteAddress ||
          "";
        writeCsvRow(parsed);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({ ok: true, file: "logger/submissions.csv" })
        );
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: "bad json" }));
      }
    });
    return;
  }

  // fallback
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found", path: pathname }));
});

server.listen(PORT, () => {
  console.log(`✅ MSS Widget service running on port ${PORT}`);
});
