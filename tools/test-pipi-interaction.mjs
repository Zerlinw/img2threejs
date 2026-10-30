import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:5176/";
const outJson = process.argv[3] ?? "pipi-garden/evidence/interaction-test.json";
const renderDir = "pipi-garden/renders";
const executablePath =
  process.env.CHROME_PATH ??
  "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1247\\chrome-win64\\chrome.exe";

fs.mkdirSync(renderDir, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--use-angle=default", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
const checks = {};
const notes = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

async function load(query = "") {
  await page.goto(`${base}?${query}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction("() => Boolean(window.__IMG2THREEJS_READY__)", null, {
    timeout: 120000,
  });
  await page.waitForTimeout(1100);
  return page.evaluate(() => window.__PIPI__?.getState());
}

async function state() {
  return page.evaluate(() => window.__PIPI__?.getState());
}

async function toastText() {
  return (await page.locator("#toast").textContent()) ?? "";
}

async function hideToast() {
  await page.evaluate(() => {
    document.querySelector("#toast")?.classList.remove("is-visible");
  });
  await page.waitForTimeout(250);
}

async function clear() {
  await page.evaluate(() => window.__PIPI__?.clearPandas());
  await page.waitForTimeout(250);
}

async function lasso(u, v, radius, steps = 64) {
  const points = await page.evaluate(
    ({ u, v, radius, steps }) => {
      const output = [];
      for (let i = 0; i <= steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        const point = window.__PIPI__?.screenOf(
          u + Math.cos(angle) * radius,
          v + Math.sin(angle) * radius,
        );
        if (point) output.push(point);
      }
      return output;
    },
    { u, v, radius, steps },
  );
  assert.ok(points.length > 12, "screen projection returned too few lasso points");
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (let i = 1; i < points.length; i += 1) {
    await page.mouse.move(points[i].x, points[i].y);
    await page.waitForTimeout(6);
  }
  await page.mouse.up();
  await page.waitForTimeout(450);
}

async function screenshot(name) {
  const file = path.join(renderDir, name);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

const screenshotPaths = [];
try {
  /* ------------------------------------------------------------------ */
  /* Overview with live residents                                       */
  /* ------------------------------------------------------------------ */
  await load("view=hero&pandas=3");
  await page.waitForTimeout(1400);
  screenshotPaths.push(await screenshot("stageb-overview.png"));
  const live = await state();
  checks.liveResidents = live.pandas === 3;
  checks.initialQuality = live.quality === "full";
  checks.expandedGround = Math.abs(live.platform.area / (12 * 12) - 3) < 0.01;
  checks.expandedDecorations = live.stats.meshes >= 175 && live.stats.obstacles >= 40;

  /* ------------------------------------------------------------------ */
  /* Lasso spawn and size scaling                                       */
  /* ------------------------------------------------------------------ */
  await load("view=hero&pandas=0");
  await lasso(0.48, 0.56, 0.062);
  const smallSpawn = await state();
  checks.lassoSmallSpawn = smallSpawn.pandas === 1;
  const smallScale = smallSpawn.agents[0]?.scale ?? 0;
  checks.smallSpawnToast = (await toastText()).includes("来啦");
  checks.smallSpawnScale = smallScale >= 0.78 && smallScale <= 1.72;

  await clear();
  await lasso(0.5, 0.42, 0.1);
  const largeSpawn = await state();
  const largeScale = largeSpawn.agents[0]?.scale ?? 0;
  checks.largeSpawn = largeSpawn.pandas === 1;
  checks.lassoScalesWithCircle = largeScale > smallScale * 1.08;
  notes.push(`lasso scales: small=${smallScale.toFixed(2)} large=${largeScale.toFixed(2)}`);
  screenshotPaths.push(await screenshot("stageb-spawn.png"));
  await page.waitForTimeout(750);
  screenshotPaths.push(await screenshot("stageb-spawned.png"));

  /* ------------------------------------------------------------------ */
  /* Invalid lasso over water                                           */
  /* ------------------------------------------------------------------ */
  await clear();
  const pond = (await state()).pond;
  await lasso(pond.u, pond.v, 0.045);
  const invalidSpawn = await state();
  checks.invalidLassoBlocked = invalidSpawn.pandas === 0;
  checks.invalidLassoToast = (await toastText()) === "换块空地画圈吧";
  await hideToast();

  /* ------------------------------------------------------------------ */
  /* Select, drag into pond, snap, delete                               */
  /* ------------------------------------------------------------------ */
  await clear();
  const spawnedId = await page.evaluate(() => window.__PIPI__?.spawnAt(0.5, 0.5, 1.25));
  await page.waitForTimeout(800);
  const beforeDrag = await page.evaluate((id) => window.__PIPI__?.getPanda(id), spawnedId);
  assert.ok(beforeDrag, "spawned panda missing");
  await page.mouse.click(beforeDrag.screen.x, beforeDrag.screen.y);
  await page.waitForTimeout(180);
  checks.clickSelects = (await state()).selected?.id === spawnedId;
  await hideToast();
  screenshotPaths.push(await screenshot("stageb-selected.png"));

  const pondScreen = await page.evaluate(
    (p) => window.__PIPI__?.screenOf(p.u, p.v),
    pond,
  );
  assert.ok(pondScreen, "could not project pond center");
  await page.mouse.move(beforeDrag.screen.x, beforeDrag.screen.y);
  await page.mouse.down();
  for (let i = 1; i <= 14; i += 1) {
    await page.mouse.move(
      beforeDrag.screen.x + (pondScreen.x - beforeDrag.screen.x) * (i / 14),
      beforeDrag.screen.y + (pondScreen.y - beforeDrag.screen.y) * (i / 14),
    );
    await page.waitForTimeout(14);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
  const afterDrag = await page.evaluate((id) => window.__PIPI__?.getPanda(id), spawnedId);
  checks.dropSnapsToWalkable = Boolean(
    afterDrag &&
      Math.hypot(afterDrag.x - beforeDrag.x, afterDrag.z - beforeDrag.z) > 0.2 &&
      (await page.evaluate(
        ({ u, v }) => window.__PIPI__?.isWalkable(u, v, 0.25),
        { u: afterDrag.u, v: afterDrag.v },
      )),
  );
  checks.dropSnapToast = (await toastText()).includes("挪到旁边");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(300);
  const afterDelete = await state();
  checks.deleteRemovesPanda = afterDelete.pandas === 0 && afterDelete.selected === null;

  /* ------------------------------------------------------------------ */
  /* Camera rotate, quality, reset, buttons, keyboard                   */
  /* ------------------------------------------------------------------ */
  await clear();
  await page.evaluate(() => {
    window.__PIPI__?.spawnAt(0.43, 0.66, 1.55);
    window.__PIPI__?.spawnAt(0.55, 0.52, 1.32);
    window.__PIPI__?.spawnAt(0.67, 0.6, 1.58);
  });
  await page.waitForTimeout(1200);
  await hideToast();
  const beforeCamera = await state();
  await page.mouse.move(1400, 380);
  await page.mouse.down({ button: "right" });
  for (let i = 1; i <= 10; i += 1) {
    await page.mouse.move(1400 - i * 18, 380 + i * 2);
    await page.waitForTimeout(12);
  }
  const duringCamera = await state();
  checks.cameraDraftDuringDrag = duringCamera.quality === "draft";
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(450);
  const afterCamera = await state();
  checks.cameraFullAfterDrag = afterCamera.quality === "full";
  checks.cameraYawChanged = Math.abs(afterCamera.camera.yaw - beforeCamera.camera.yaw) > 0.08;
  checks.cameraFitAfterDrag = afterCamera.cameraFit.x <= 0.94 && afterCamera.cameraFit.y <= 0.94;
  await hideToast();
  screenshotPaths.push(await screenshot("stageb-rotated.png"));

  const yawBeforeButtons = afterCamera.camera.yaw;
  await page.locator("[data-camera='right']").click();
  await page.waitForTimeout(650);
  const afterRight = await state();
  checks.cameraRightButton = afterRight.camera.yaw > yawBeforeButtons + 0.2;
  await page.locator("[data-camera='reset']").click();
  await page.waitForTimeout(650);
  const afterReset = await state();
  checks.cameraReset = Math.abs(afterReset.camera.yaw - 0.52) < 0.04;
  const yawBeforeKey = afterReset.camera.yaw;
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  const afterKey = await state();
  checks.cameraArrowKey = Math.abs(afterKey.camera.yaw - yawBeforeKey) > 0.03;

  const yawBeforeBlank = (await state()).camera.yaw;
  await page.mouse.move(120, 520);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(120 + i * 10, 520);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(420);
  const afterBlank = await state();
  checks.cameraBlankDrag = Math.abs(afterBlank.camera.yaw - yawBeforeBlank) > 0.04;
  await page.locator("[data-camera='reset']").click();
  await page.waitForTimeout(550);

  const fitChecks = [];
  for (const yaw of [0, 90, 180, 270]) {
    await page.evaluate((value) => window.__PIPI__?.setOrientation(value, 48), yaw);
    await page.waitForTimeout(80);
    const fit = (await state()).cameraFit;
    fitChecks.push({ yaw, fit });
  }
  checks.fitAtAllYaws = fitChecks.every((entry) => entry.fit.x <= 0.94 && entry.fit.y <= 0.94);

  /* ------------------------------------------------------------------ */
  /* Small follows large + no water                                     */
  /* ------------------------------------------------------------------ */
  await clear();
  const bigId = await page.evaluate(() => window.__PIPI__?.spawnAt(0.5, 0.5, 1.62));
  const smallIds = await page.evaluate(() => [
    window.__PIPI__?.spawnAt(0.61, 0.52, 0.86),
    window.__PIPI__?.spawnAt(0.56, 0.59, 0.82),
  ]);
  await page.waitForTimeout(3200);
  const followerState = await state();
  const pondState = followerState.pond;
  checks.smallFollowsBig = followerState.agents.some(
    (agent) => agent.leaderId === bigId && agent.scale < 1.1,
  );
  checks.noPandaInWater = followerState.agents.every((agent) =>
    agent.x !== undefined && agent.z !== undefined
      ? Math.hypot(agent.x - pondState.x, agent.z - pondState.z) > pondState.rx * 1.03
      : true,
  );
  notes.push(`followers: ${followerState.agents.map((a) => `${a.id}->${a.leaderId}`).join(", ")}`);

  /* ------------------------------------------------------------------ */
  /* Max 30 and max toast                                               */
  /* ------------------------------------------------------------------ */
  await clear();
  await page.evaluate(() => window.__PIPI__?.spawnRandom(30));
  await page.waitForTimeout(900);
  const atMax = await state();
  checks.spawnedThirty = atMax.pandas === 30;
  await lasso(0.5, 0.5, 0.07);
  const afterMaxLasso = await state();
  checks.maxThirtyGuard = afterMaxLasso.pandas === 30;
  await page.evaluate(() => window.__PIPI__?.spawnAt(0.5, 0.5, 1.2));
  await page.waitForTimeout(250);
  checks.maxToast = (await toastText()).includes("住不下");
  await clear();

  /* ------------------------------------------------------------------ */
  /* 10 panda performance                                               */
  /* ------------------------------------------------------------------ */
  await load("view=hero&pandas=0");
  await page.evaluate(() => window.__PIPI__?.spawnRandom(10));
  await page.waitForTimeout(1600);
  const perfState = await state();
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const start = performance.now();
        let frames = 0;
        function tick() {
          frames += 1;
          const now = performance.now();
          if (now - start >= 2600) resolve(frames / ((now - start) / 1000));
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
  );
  checks.tenPandasPresent = perfState.pandas === 10;
  checks.tenPandaFps = fps >= 55;
  notes.push(
    `10 pandas: ${fps.toFixed(1)} fps, ${perfState.stats.calls} calls, ${perfState.stats.triangles} tris`,
  );
  screenshotPaths.push(await screenshot("stageb-10pandas.png"));

  checks.noConsoleErrors = errors.length === 0;
} catch (error) {
  errors.push(`test exception: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
}

/* ------------------------------------------------------------------ */
/* Mobile                                                             */
/* ------------------------------------------------------------------ */
let mobileState = null;
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const mobilePage = await context.newPage();
  const mobileErrors = [];
  mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));
  mobilePage.on("console", (message) => {
    if (message.type() === "error") mobileErrors.push(message.text());
  });
  await mobilePage.goto(`${base}?view=hero&pandas=0`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await mobilePage.waitForFunction("() => Boolean(window.__IMG2THREEJS_READY__)", null, {
    timeout: 120000,
  });
  await mobilePage.waitForTimeout(1200);
  const points = await mobilePage.evaluate(() => {
    const output = [];
    for (let i = 0; i <= 56; i += 1) {
      const angle = (i / 56) * Math.PI * 2;
      const point = window.__PIPI__?.screenOf(0.5 + Math.cos(angle) * 0.1, 0.42 + Math.sin(angle) * 0.1);
      if (point) output.push(point);
    }
    return output;
  });
  await mobilePage.mouse.move(points[0].x, points[0].y);
  await mobilePage.mouse.down();
  for (let i = 1; i < points.length; i += 1) {
    await mobilePage.mouse.move(points[i].x, points[i].y);
    await mobilePage.waitForTimeout(7);
  }
  await mobilePage.mouse.up();
  await mobilePage.waitForTimeout(500);
  mobileState = await mobilePage.evaluate(() => window.__PIPI__?.getState());
  const cameraBox = await mobilePage.locator(".camera-tools").boundingBox();
  checks.mobileLasso = mobileState.pandas === 1;
  checks.mobileCameraToolsFit =
    Boolean(cameraBox) && cameraBox.x >= 0 && cameraBox.x + cameraBox.width <= 390;
  checks.mobileCameraFit =
    mobileState.cameraFit.x <= 0.96 && mobileState.cameraFit.y <= 0.96;
  checks.mobileNoConsoleErrors = mobileErrors.length === 0;

  // Exercise an actual touch gesture through CDP, not just mouse events.
  await mobilePage.evaluate(() => window.__PIPI__?.clearPandas());
  await mobilePage.waitForTimeout(250);
  const touchPoints = await mobilePage.evaluate(() => {
    const output = [];
    for (let i = 0; i <= 56; i += 1) {
      const angle = (i / 56) * Math.PI * 2;
      const point = window.__PIPI__?.screenOf(0.5 + Math.cos(angle) * 0.1, 0.42 + Math.sin(angle) * 0.1);
      if (point) output.push(point);
    }
    return output;
  });
  const cdp = await context.newCDPSession(mobilePage);
  const touch = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1, radiusX: 3, radiusY: 3, force: 1 }],
    });
  await touch("touchStart", touchPoints[0].x, touchPoints[0].y);
  for (let i = 1; i < touchPoints.length; i += 1) {
    await touch("touchMove", touchPoints[i].x, touchPoints[i].y);
    await mobilePage.waitForTimeout(8);
  }
  await touch("touchEnd", 0, 0);
  await mobilePage.waitForTimeout(600);
  const touchState = await mobilePage.evaluate(() => window.__PIPI__?.getState());
  checks.mobileTouchLasso = touchState.pandas === 1;
  await mobilePage.screenshot({ path: path.join(renderDir, "stageb-mobile.png"), fullPage: false });
  screenshotPaths.push(path.join(renderDir, "stageb-mobile.png"));
  await context.close();
} catch (error) {
  errors.push(`mobile exception: ${error instanceof Error ? error.message : String(error)}`);
  checks.mobileLasso = false;
}

const passed = errors.length === 0 && Object.values(checks).every(Boolean);
const result = {
  base,
  checkedAt: new Date().toISOString(),
  passed,
  checks,
  notes,
  errors,
  screenshots: screenshotPaths,
  performance: {
    tenPandasCalls: notes.find((note) => note.startsWith("10 pandas")) ?? null,
  },
  camera: await page.evaluate(() => window.__PIPI__?.getState().camera ?? null).catch(() => null),
  mobilePandas: mobileState?.pandas ?? null,
};
fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!passed) process.exitCode = 1;
