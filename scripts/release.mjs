import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { smoke } from "./smoke.mjs";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

await run("npm", ["test"]);
await run("npm", ["run", "typecheck"]);
await run("npm", ["run", "build"]);
mkdirSync("data", { recursive: true });

const stagingPid = boot(4181, "staging", "data/staging.sqlite");
await waitHealth(4181, "staging");
await smoke(4181, "staging");

const productionPid = boot(4182, "production", "data/production.sqlite");
await waitHealth(4182, "production");
await smoke(4182, "production");

console.log(JSON.stringify({
  staging: { port: 4181, pid: stagingPid, env: "staging" },
  production: { port: 4182, pid: productionPid, env: "production" },
}));

function boot(port, envName, database) {
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server/index.mjs"], {
    env: { ...process.env, PORT: String(port), HRMS_ENV: envName, HRMS_DB: database },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return child.pid;
}

async function waitHealth(port, expected) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      const body = await response.json();
      if (body.ok && body.env === expected) return;
    } catch {
      // Server is still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${expected} did not become healthy on port ${port}.`);
}
