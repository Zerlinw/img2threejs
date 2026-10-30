import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:5176/";
const outFile = process.argv[3] ?? "pipi-garden/evidence/static-check.json";
const executablePath =
  process.env.CHROME_PATH ??
  "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1247\\chrome-win64\\chrome.exe";

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--use-angle=default", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

const result = {
  base,
  checkedAt: new Date().toISOString(),
  captures: {},
  checks: {},
  errors,
};

async function load(view, extra = {}) {
  const query = new URLSearchParams({
    view,
    ui: "0",
    freeze: "1",
    t: "2.2",
    pandas: "3",
    ...extra,
  });
  await page.goto(`${base}?${query.toString()}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction("() => Boolean(window.__IMG2THREEJS_READY__)", null, {
    timeout: 120000,
  });
  await page.waitForTimeout(900);
  return page.evaluate(() => window.__PIPI__?.getState() ?? null);
}

const hero = await load("hero");
result.captures.hero = hero;
result.checks.ready = hero?.ready === true;
result.checks.previewPandas = hero?.pandas === 3;

const orbits = [];
for (const yaw of [0, 90, 180, 270]) {
  const state = await load("hero", { yaw: String(yaw) });
  const fit = state?.cameraFit ?? { x: 1, y: 1 };
  orbits.push({ yaw, fit });
  result.checks[`fitAt${yaw}`] = fit.x <= 0.93 && fit.y <= 0.93;
}
result.captures.orbits = orbits;

const poses = await load("poses");
result.captures.poses = poses;
result.checks.posesReady = poses?.ready === true;

const closeup = await load("closeup", { pose: "eat" });
result.captures.closeup = closeup;
result.checks.closeupReady = closeup?.ready === true;

const empty = await load("hero", { pandas: "0" });
result.captures.empty = empty;
result.checks.emptyVariantLoads = empty?.ready === true && empty?.pandas === 0;

result.checks.noConsoleErrors = errors.length === 0;
result.checks.meshes = hero?.stats?.meshes ?? 0;
result.checks.triangles = hero?.stats?.triangles ?? 0;
result.checks.heroCalls = hero?.stats?.calls ?? 0;
result.checks.heroFit = hero?.cameraFit ?? null;

result.passed = Object.entries(result.checks).every(([, value]) =>
  typeof value === "boolean" ? value : true,
);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.passed) process.exitCode = 1;
