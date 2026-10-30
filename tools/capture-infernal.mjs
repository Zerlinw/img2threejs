import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:5173/";
const outDir = process.argv[3] ?? "renders";
const views = (process.argv[4] ?? "hero").split(",");
const width = Number(process.argv[5] ?? 1600);
const height = Number(process.argv[6] ?? 900);
const ui = process.argv[7] ?? "0";
const outputName = process.argv[8] ?? null;
const extraQuery = process.env.EXTRA_QUERY ?? "";
const executablePath = process.env.CHROME_PATH ??
  "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1247\\chrome-win64\\chrome.exe";

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

for (const view of views) {
  const url = `${base}?ui=${ui}&view=${view}${extraQuery ? `&${extraQuery}` : ""}`;
  console.log(`capture ${view} -> ${url}`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction("() => Boolean(window.__IMG2THREEJS_READY__)", null, {
    timeout: 120000,
  });
  await page.waitForTimeout(4500);
  const stats = await page.evaluate(() => ({
    camera: window.__CAMERA__
      ? {
          position: window.__CAMERA__.position.toArray(),
          target: window.__CAMERA__.target
            ? window.__CAMERA__.target.toArray()
            : null,
          fov: window.__CAMERA__.fov,
        }
      : null,
    stats: window.__MODEL__?.stats ?? null,
  }));
  console.log(JSON.stringify({ view, stats }, null, 2));
  const file = path.join(outDir, `${outputName ?? view}.png`);
  await page.screenshot({
    path: file,
    fullPage: false,
    omitBackground: process.env.OMIT_BACKGROUND === "1",
  });
  console.log(`saved ${file}`);
}

if (errors.length) {
  console.log("CONSOLE ERRORS:");
  console.log(errors.join("\n"));
}
await browser.close();
if (errors.length) process.exitCode = 1;
