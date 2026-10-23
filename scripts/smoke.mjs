import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export async function smoke(targetPort, expected) {
  const health = await fetch(`http://127.0.0.1:${targetPort}/api/health`);
  const healthBody = await health.json();
  if (!health.ok || healthBody.env !== expected) {
    throw new Error(`expected ${expected} health, received ${JSON.stringify(healthBody)}`);
  }
  const login = await fetch(`http://127.0.0.1:${targetPort}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "priya.shah@meridian.example", password: "marigold-demo" }),
  });
  if (!login.ok) throw new Error(`login on ${expected} returned ${login.status}`);
  const setCookie = login.headers.getSetCookie?.()[0] ?? login.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  const dashboard = await fetch(`http://127.0.0.1:${targetPort}/api/dashboard`, { headers: { cookie } });
  const desk = await dashboard.json();
  if (!dashboard.ok || desk.week?.length !== 7 || desk.pipeline?.status !== "paid" || desk.headcount !== 10) {
    throw new Error(
      `${expected} dashboard smoke failed: ${JSON.stringify({ status: dashboard.status, week: desk.week?.length, pipeline: desk.pipeline, headcount: desk.headcount })}`,
    );
  }
  const page = await fetch(`http://127.0.0.1:${targetPort}/`);
  const html = await page.text();
  if (!page.ok || !html.includes("Marigold")) throw new Error(`${expected} did not serve the app shell`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const port = Number(process.env.PORT || 4181);
  const envName = process.env.HRMS_ENV || "staging";
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server/index.mjs"], {
    env: process.env,
    stdio: "inherit",
  });
  let settled = false;
  function finish(code) {
    if (settled) return;
    settled = true;
    child.kill("SIGTERM");
    setTimeout(() => process.exit(code), 150);
  }
  child.on("exit", (code) => {
    if (!settled) {
      console.error(`server exited early (${code})`);
      process.exit(code || 1);
    }
  });
  try {
    await waitHealth(port, envName);
    await smoke(port, envName);
    console.log(JSON.stringify({ ok: true, env: envName, port }));
    finish(0);
  } catch (error) {
    console.error(error);
    finish(1);
  }
}

async function waitHealth(targetPort, expected) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${targetPort}/api/health`);
      const body = await response.json();
      if (body.ok && body.env === expected && body.product === "Marigold") return body;
    } catch {
      // Server is still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${expected} health check on port ${targetPort} did not succeed.`);
}
