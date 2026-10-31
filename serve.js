// Minimal no-cache static server for local development of revU (chooser, /staff, /students).
// Usage: node serve.js [port]
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
// Same rules as _redirects on Cloudflare Pages
const redirects = [[/^\/hpc(\/.*)?$/, (m) => "/students" + (m[1] || "/")]];

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    for (const [re, to] of redirects) {
        const m = urlPath.match(re);
        if (m) { res.writeHead(301, { Location: to(m) }); return res.end(); }
    }
    if (urlPath.split("/").some((seg) => seg.startsWith("."))) { res.writeHead(404); return res.end("Not found"); }
    let file = path.normalize(path.join(root, urlPath));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (statErr, st) => {
        if (!statErr && st.isDirectory()) {
            // Directory without a trailing slash: redirect so relative asset paths resolve
            if (!urlPath.endsWith("/")) { res.writeHead(301, { Location: urlPath + "/" }); return res.end(); }
            file = path.join(file, "index.html");
        }
        fs.readFile(file, (err, data) => {
            if (err) { res.writeHead(404); return res.end("Not found"); }
            res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
            res.end(data);
        });
    });
}).listen(port, () => console.log(`revU running at http://localhost:${port}`));
