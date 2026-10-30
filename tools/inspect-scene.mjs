import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1247\\chrome-win64\\chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.goto("http://127.0.0.1:5173/?ui=0&hide=InfernalCitadel,PropsAndVotives,Lighting,HazeVapour,SkyDome&fog=0&bloom=0", { waitUntil: "networkidle" });
await page.waitForFunction("() => Boolean(window.__IMG2THREEJS_READY__)");
const out = await page.evaluate(() => {
  const rows = [];
  window.__SCENE__.traverse((o) => {
    if (!o.isMesh && !o.isSprite && !o.isPoints) return;
    if (!o.visible) return;
    const m = o.material;
    rows.push({
      type: o.type,
      name: o.name,
      parent: o.parent?.name,
      materialType: m?.type,
      color: m?.color?.getHexString?.(),
      uniforms: m?.uniforms ? Object.keys(m.uniforms) : null,
      frag: m?.fragmentShader ? m.fragmentShader.slice(0, 120) : null,
      geometry: o.geometry?.type,
    });
  });
  return rows;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
