// server.js (smarter lookup)
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// where your jsons live in the repo
const SRC_DIR = path.join(__dirname, "src");

const PORT = process.env.PORT || 3000;

// try several possible filenames for the same logical config
const CANDIDATES = {
  widget: ["widget.json", "config.json", "widget-config.json"],
  forms: ["forms.json", "form.json", "forms-config.json"],
  images: ["images.json", "image.json", "images-config.json"],
  config: ["config.json"]
};

function readFirstExisting(nameList) {
  for (const name of nameList) {
    const p = path.join(SRC_DIR, name);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  }
  return null;
}

function readGeneric(name) {
  const p = path.join(SRC_DIR, `${name}.json`);
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  }
  return null;
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

  // GET /config/xxx
  if (req.method === "GET" && req.url.startsWith("/config/")) {
    const key = req.url.replace("/config/", "").trim(); // e.g. "widget"
    let data = null;

    if (CANDIDATES[key]) {
      data = readFirstExisting(CANDIDATES[key]);
    } else {
      data = readGeneric(key);
    }

    if (!data) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "config not found", key }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  // fallback
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`✅ MSS Widget service running on port ${PORT}`);
});
