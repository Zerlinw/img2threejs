import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:5176/";
const outDir = process.argv[3] ?? "pipi-garden/renders";
const views = (process.argv[4] ?? "hero").split(",");
const width = Number(process.argv[5] ?? 1600);
const height = Number(process.argv[6] ?? 1000);
const ui = process.argv[7] ?? "0";
const outputPrefix = process.argv[8] ?? "";
const executablePath =
  process.env.CHROME_PATH ??
  "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1247\\chrome-win64\\chrome.exe";

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--use-angle=default", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

for (const view of views) {
  const query = new URLSearchParams({
    view,
    ui,
    freeze: "1",
    t: "2.2",
    pandas: "3",
  });
  if (view === "closeup") {
    query.set("pose", process.env.POSE ?? "eat");
  }
  if (process.env.EXTRA_QUERY) {
    for (const [key, value] of new URLSearchParams(process.env.EXTRA_QUERY)) {
      query.set(key, value);
    }
  }
  const url = `${base}?${query.toString()}`;
  console.log(`capture ${view} -> ${url}`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction("() => Boolean(window.__IMG2THREEJS_READY__)", null, {
    timeout: 120000,
  });
  await page.waitForTimeout(3200);
  const state = await page.evaluate(() => window.__PIPI__?.getState() ?? null);
  console.log(JSON.stringify({ view, state }, null, 2));
  const name = process.env.OUTPUT_NAME ?? `${outputPrefix}${view}.png`;
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`saved ${file}`);
}

if (errors.length) {
  console.log("CONSOLE ERRORS:");
  console.log(errors.join("\n"));
}
await browser.close();
if (errors.length) process.exitCode = 1;
