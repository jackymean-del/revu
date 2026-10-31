// Minimal no-cache static server for local development of revU HPC.
// Usage: node hpc/serve.js [port]
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.argv[2] || process.env.PORT || 8090);
const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon"
};

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let file = path.normalize(path.join(root, urlPath === "/" ? "index.html" : urlPath));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end("Not found"); }
        res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(data);
    });
}).listen(port, () => console.log(`revU HPC running at http://localhost:${port}`));
