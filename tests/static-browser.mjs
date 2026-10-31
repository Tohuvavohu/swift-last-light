import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.PAGES_BASE_PATH || "/";
const port = process.env.TEST_PORT || "4173";
const appURL = new URL(base, `http://127.0.0.1:${port}`).href;
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    port,
    "--strictPort",
  ],
  { stdio: "pipe" },
);
let output = "";
server.stdout.on("data", (data) => {
  output += data;
});
server.stderr.on("data", (data) => {
  output += data;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(appURL)).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) throw Error(output);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, `Static server did not start: ${output}`);
  const html = await (await fetch(appURL)).text();
  assert(
    html.includes(`${base}assets/`),
    "JavaScript and CSS must use the Pages repository prefix",
  );
  assert(
    (await fetch(new URL("swift-logo.gif", appURL))).headers
      .get("content-type")
      .includes("image/gif"),
  );
  const data = await (await fetch(new URL("data/latest.json", appURL))).json();
  assert.equal(data.schemaVersion, 1);
  const status = await (
    await fetch(new URL("data/status.json", appURL))
  ).json();
  assert.equal(status.checkedAt, data.checkedAt);
  await mkdir("outputs", { recursive: true });
  const test = spawn(
    process.execPath,
    ["--import", "tsx", "tests/readiness.mjs"],
    { stdio: "inherit", env: { ...process.env, APP_URL: appURL } },
  );
  const exit = await new Promise((resolve, reject) => {
    test.on("exit", resolve);
    test.on("error", reject);
  });
  assert.equal(exit, 0, "Static browser checks failed");
  console.log(`Static build verified at ${appURL}`);
} finally {
  server.kill();
}
