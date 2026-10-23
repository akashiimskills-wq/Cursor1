import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleNodeRequest } from "./http.mjs";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

const port = Number(process.env.PORT || 5173);
const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname.startsWith("/api")) {
    handleNodeRequest(req, res).catch((error) => {
      console.error(error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Internal error." }));
      }
    });
    return;
  }
  if (url.pathname.includes("..")) {
    res.statusCode = 400;
    res.end("Bad path");
    return;
  }
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "");
  let file = join(dist, relative);
  if (!file.startsWith(dist)) {
    res.statusCode = 400;
    res.end("Bad path");
    return;
  }
  const isFile = existsSync(file) && statSync(file).isFile();
  if (!isFile) file = join(dist, "index.html");
  if (!existsSync(file)) {
    res.statusCode = 503;
    res.end("Build the client with npm run build, or use npm run dev.");
    return;
  }
  res.setHeader("content-type", types[extname(file)] || "application/octet-stream");
  createReadStream(file).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Marigold listening on http://0.0.0.0:${port}`);
});
