import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { log } from "node:console";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve, delimiter } from "node:path";
import process from "node:process";
import * as Schema from "effect/Schema";

const root = resolve(import.meta.dirname, "../..");
const work = await mkdtemp(join(tmpdir(), "almanac-browser-stranger-"));
let browser;
let server;
try {
  const packed = JSON.parse(
    execFileSync("pnpm", ["pack", "--json", "--pack-destination", work], {
      cwd: root,
      encoding: "utf8",
    }),
  );
  const home = join(work, "home");
  await mkdir(home);
  await writeFile(
    join(home, "npmrc"),
    "registry=https://registry.npmjs.org/\n",
  );
  await writeFile(
    join(work, "package.json"),
    JSON.stringify({
      name: "almanac-browser-stranger",
      private: true,
      type: "module",
    }),
  );
  const manifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  const env = {
    PATH: dirname(process.execPath) + delimiter + process.env.PATH,
    HOME: home,
    CI: "true",
    npm_config_userconfig: join(home, "npmrc"),
    npm_config_registry: "https://registry.npmjs.org/",
  };
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      packed.filename,
      `esbuild@${manifest.devDependencies.esbuild}`,
      `playwright@${manifest.devDependencies.playwright}`,
    ],
    { cwd: work, env, stdio: "pipe" },
  );
  const consumerRequire = createRequire(join(work, "package.json"));
  const { build } = consumerRequire("esbuild");
  await build({
    entryPoints: [
      join(
        work,
        "node_modules/@fungi.computer/almanac/examples/next-occurrence.mjs",
      ),
    ],
    outfile: join(work, "bundle.js"),
    bundle: true,
    platform: "browser",
    format: "esm",
  });
  const bundle = await readFile(join(work, "bundle.js"));
  server = createServer((request, response) => {
    if (request.url === "/bundle.js") {
      response
        .writeHead(200, { "content-type": "text/javascript" })
        .end(bundle);
    } else {
      response
        .writeHead(200, { "content-type": "text/html" })
        .end(
          '<output></output><script type="module">import { occurrence } from "/bundle.js"; document.querySelector("output").textContent = occurrence;</script>',
        );
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = Schema.decodeUnknownSync(
    Schema.Struct({ port: Schema.Number }),
  )(server.address());
  const { chromium } = consumerRequire("playwright");
  browser = await chromium.launch({ headless: true, env });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page
    .locator("output")
    .filter({ hasText: "2026-10-11T09:00:00.000Z" })
    .waitFor();
  assert.equal(
    await page.locator("output").textContent(),
    "2026-10-11T09:00:00.000Z",
  );
  assert.deepEqual(errors, []);
  log(
    "PASS packed Almanac example in Chromium; browser bundle has no Node polyfills",
  );
} finally {
  await browser?.close();
  if (server !== undefined) {
    await new Promise((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
  }
  await rm(work, { recursive: true, force: true });
}
log("cleanupComplete: true");
