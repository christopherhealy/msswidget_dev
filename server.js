// server.js — Render service for MSS Widget
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// location of your JSON files
const SRC_DIR = path.join(__dirname, "src");

// ensure logger directory exists (for CSV logs)
const LOG_DIR = path.join(__dirname, "logger");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// port Render assigns automatically
const PORT = process.env.PORT || 3000;

/* ------------------------- Utility Functions ------------------------- */
function readJson(fileName) {
  const filePath = path.join(SRC_DIR, fileName);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeCsv(logName, payload) {
  const filePath = path.join(LOG_DIR, `${logName}.csv`);
  const addHeader = !fs.existsSync(filePath);
  const stream = fs.createWriteStream(filePath, { flags: "a" });
  if (addHeader) stream.write("timestamp,logType,payload\n");
  stream.write(`${new Date().toISOString()},${logName},${JSON.stringify(payload)}\n`);
  stream.end();
}

/* ----------------------------- HTTP Server ---------------------------- */
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // 1) CONFIG endpoints
  // /config/widget  -> src/config.json
  // /config/forms   -> src/form.json
  // /config/images  -> src/image.json
  if (req.method === "GET" && req.url.startsWith("/config/")) {
    const key = req.url.replace("/config/", "").trim();

    const map = {
      widget: "config.json",
      forms: "form.json",
      images: "image.json",
    };

    const fileName = map[key];
    const data = fileName ? readJson(fileName) : null;

    if (!data) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "config not found", key }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  // 2) LOG endpoints
  // POST /log/qa, /log/report, /log/submission
  if (req.method === "POST" && req.url.startsWith("/log/")) {
    const logName = req.url.replace("/log/", "").trim();
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        writeCsv(logName, payload);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid JSON" }));
      }
    });
    return;
  }

  // 3) Default 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

/* ----------------------------- Start Server --------------------------- */
server.listen(PORT, () => {
  console.log(`✅ MSS Widget service running on port ${PORT}`);
});
