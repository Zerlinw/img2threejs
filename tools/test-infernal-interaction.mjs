import { chromium } from "playwright";

const executablePath =
  "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1247\\chrome-win64\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto("http://127.0.0.1:5173/?view=hero", { waitUntil: "networkidle" });
await page.waitForFunction("() => Boolean(window.__IMG2THREEJS_READY__)");
await page.waitForTimeout(2500);

const before = await page.locator("#inspect-title").textContent();
await page.mouse.click(800, 520);
await page.waitForTimeout(700);
const after = await page.locator("#inspect-title").textContent();
const kind = await page.locator("#inspect-kind").textContent();
console.log(JSON.stringify({ before, after, kind }, null, 2));

await page.locator("#btn-explode").click();
await page.waitForTimeout(1800);
await page.screenshot({ path: "renders/explode-ui.png" });

await page.locator("[data-view='nave']").click();
await page.waitForTimeout(2200);
await page.screenshot({ path: "renders/nave-ui.png" });

const stats = await page.evaluate(() => window.__MODEL__?.stats);
console.log(JSON.stringify({ stats, errors }, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
