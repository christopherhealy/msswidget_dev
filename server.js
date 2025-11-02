// server.js  (for msswidget_dev)
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// adjust this if your JSONs are named differently:
const SRC_DIR = path.join(__dirname, "src");

const PORT = process.env.PORT || 3000;

// helper to read a JSON file from /src
function readJsonFile(name) {
  const filePath = path.join(SRC_DIR, name);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// helper to write CSV logs (for qa, reports, admin tickets, etc.)
function appendCsv(name, line) {
  const loggerDir = path.join(__dirname, "logger");
  if (!fs.existsSync(loggerDir)) {
    fs.mkdirSync(loggerDir);
  }
  const filePath = path.join(loggerDir, `${name}.csv`);
  const addHeader = !fs.existsSync(filePath);
  const out = fs.createWriteStream(filePath, { flags: "a" });
  if (addHeader) {
    out.write("timestamp,type,payload\n");
  }
  out.write(`${new Date().toISOString()},${name},${JSON.stringify(line)}\n`);
  out.end();
}

const server = http.createServer((req, res) => {
  // CORS for Vercel
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  //
  // 1) CONFIG ENDPOINTS
  //
  // GET /config/widget   -> src/widget.json
  // GET /config/forms    -> src/forms.json
  // GET /config/images   -> src/images.json
  //
  if (req.method === "GET" && req.url.startsWith("/config/")) {
    const name = req.url.replace("/config/", "").trim(); // e.g. "widget"
    // map logical names to actual files
    const fileMap = {
      widget: "widget.json",
      form: "form.json",
      forms: "forms.json",
      image: "image.json",
      images: "images.json",
      config: "config.json",
    };
    const fileName = fileMap[name] || `${name}.json`;
    const data = readJsonFile(fileName);
    if (!data) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "config not found" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  //
  // 2) LOGGING ENDPOINT
  //
  // POST /log/qa
  // POST /log/report
  // POST /log/submission
  //
  if (req.method === "POST" && req.url.startsWith("/log/")) {
    const logName = req.url.replace("/log/", "").trim(); // e.g. "qa"
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let payload = {};
      try {
        payload = JSON.parse(body || "{}");
      } catch (e) {}
      appendCsv(logName, payload);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // fallback
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`✅ MSS Widget service running on port ${PORT}`);
});server.js
