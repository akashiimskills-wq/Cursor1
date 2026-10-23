import { fileURLToPath } from "node:url";
import { handle } from "./app.mjs";
import { openDatabase } from "./db.mjs";

let opened = false;

export function ensureDatabase() {
  if (opened) return;
  const path =
    process.env.HRMS_DB ?? fileURLToPath(new URL("../data/marigold.sqlite", import.meta.url));
  openDatabase(path);
  opened = true;
}

export async function handleNodeRequest(req, res) {
  ensureDatabase();
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `http://${host}`);
  let body = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { __invalidJson: true };
      }
    }
  }
  const result = handle({
    method: req.method || "GET",
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body,
    cookie: req.headers.cookie ?? "",
  });
  res.statusCode = result.status;
  if (result.setCookie) res.setHeader("set-cookie", result.setCookie);
  if (result.clearCookie) {
    res.setHeader("set-cookie", "marigold=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
  }
  if (result.csv != null) {
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="${result.filename || "payroll.csv"}"`);
    res.end(result.csv);
    return;
  }
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(result.json ?? null));
}
