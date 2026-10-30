import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                               */
/* ------------------------------------------------------------------ */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------ */
/* Canvas texture factory                                              */
/* ------------------------------------------------------------------ */

const TEXTURE_SIZE = 512;

function canvas2d(size = TEXTURE_SIZE): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to create 2D canvas context");
  return { canvas, ctx };
}

function heightToNormal(
  height: HTMLCanvasElement,
  strength = 2.4,
): HTMLCanvasElement {
  const size = height.width;
  const src = height.getContext("2d")!.getImageData(0, 0, size, size).data;
  const { canvas, ctx } = canvas2d(size);
  const out = ctx.createImageData(size, size);
  const at = (x: number, y: number): number => {
    const xx = (x + size) % size;
    const yy = (y + size) % size;
    return src[(yy * size + xx) * 4] / 255;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      out.data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      out.data[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      out.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

function speckle(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  count: number,
  maxAlpha = 0.2,
): void {
  for (let i = 0; i < count; i += 1) {
    const x = rand() * TEXTURE_SIZE;
    const y = rand() * TEXTURE_SIZE;
    const r = rand() * 1.9 + 0.25;
    const light = rand() > 0.67;
    ctx.fillStyle = light
      ? `rgba(196, 170, 148, ${rand() * maxAlpha})`
      : `rgba(0, 0, 0, ${rand() * maxAlpha * 1.7})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCrack(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  x: number,
  y: number,
  length: number,
  width: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  let cx = x;
  let cy = y;
  const segments = 3 + Math.floor(rand() * 5);
  for (let i = 0; i < segments; i += 1) {
    cx += (rand() - 0.5) * length * 0.36;
    cy += (length / segments) * (0.55 + rand() * 0.6);
    ctx.lineTo(cx, cy);
  }
  ctx.stroke();
  ctx.restore();
}

function makeStoneCanvases(seed: number): {
  color: HTMLCanvasElement;
  height: HTMLCanvasElement;
  rough: HTMLCanvasElement;
} {
  const rand = mulberry32(seed);
  const { canvas: color, ctx } = canvas2d();
  const { canvas: height, ctx: hctx } = canvas2d();
  const { canvas: rough, ctx: rctx } = canvas2d();

  ctx.fillStyle = "#070607";
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  hctx.fillStyle = "#050505";
  hctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  rctx.fillStyle = "#f2f2f2";
  rctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const courses: number[] = [];
  let cursor = -10;
  while (cursor < TEXTURE_SIZE + 10) {
    const h = 44 + rand() * 26;
    courses.push(h);
    cursor += h;
  }

  let row = 0;
  cursor = -10;
  for (const courseH of courses) {
    const offset = row % 2 === 0 ? -rand() * 80 : -80 - rand() * 120;
    let x = offset;
    while (x < TEXTURE_SIZE + 20) {
      const w = 62 + rand() * 78;
      const y = cursor;
      const inset = 2.4;
      const base = Math.floor(43 + rand() * 35);
      const warm = rand() * 6;
      const r = base - 2 + warm;
      const g = base + 1;
      const b = base + 3;

      const grad = ctx.createLinearGradient(x, y, x + w, y + courseH);
      grad.addColorStop(0, `rgb(${r + 7}, ${g + 5}, ${b + 4})`);
      grad.addColorStop(0.55, `rgb(${r}, ${g}, ${b})`);
      grad.addColorStop(1, `rgb(${Math.max(0, r - 12)}, ${Math.max(0, g - 11)}, ${Math.max(0, b - 10)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(x + inset, y + inset, w - inset * 2, courseH - inset * 2);

      // Chipped and beveled top edge.
      ctx.strokeStyle = `rgba(176, 154, 140, ${0.08 + rand() * 0.1})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + inset + 2, y + inset + 1.5);
      ctx.lineTo(x + w - inset - 2, y + inset + 1.5);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.moveTo(x + inset + 2, y + courseH - inset - 2);
      ctx.lineTo(x + w - inset - 2, y + courseH - inset - 2);
      ctx.stroke();

      const hv = 110 + Math.floor(rand() * 50);
      hctx.fillStyle = `rgb(${hv},${hv},${hv})`;
      hctx.fillRect(x + 3, y + 3, w - 6, courseH - 6);
      hctx.fillStyle = "rgba(0,0,0,0.45)";
      hctx.fillRect(x + 3, y + 3, w - 6, 3);
      hctx.fillRect(x + 3, y + courseH - 6, w - 6, 3);

      const rv = 166 + Math.floor(rand() * 44);
      rctx.fillStyle = `rgb(${rv},${rv},${rv})`;
      rctx.fillRect(x + 4, y + 4, w - 8, courseH - 8);

      // Hairline fractures and soot.
      if (rand() > 0.53) {
        drawCrack(
          ctx,
          rand,
          x + 8 + rand() * (w - 16),
          y + 7,
          courseH * (0.4 + rand() * 1.1),
          0.7 + rand() * 0.7,
          `rgba(2, 2, 3, ${0.3 + rand() * 0.35})`,
        );
      }
      if (rand() > 0.7) {
        const sx = x + 6 + rand() * (w - 20);
        const sy = y + 4;
        const sg = ctx.createRadialGradient(sx, sy, 1, sx, sy, courseH * 0.8);
        sg.addColorStop(0, "rgba(0,0,0,0.34)");
        sg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(x, y, w, courseH);
      }
      x += w;
    }
    cursor += courseH;
    row += 1;
  }

  // Soot wash, brick scars and mineral staining.
  const wash = ctx.createLinearGradient(0, 0, 0, TEXTURE_SIZE);
  wash.addColorStop(0, "rgba(0,0,0,0.24)");
  wash.addColorStop(0.45, "rgba(0,0,0,0.04)");
  wash.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  for (let i = 0; i < 35; i += 1) {
    const x = rand() * TEXTURE_SIZE;
    const y = rand() * TEXTURE_SIZE;
    const radius = 10 + rand() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const red = rand() > 0.8 ? 70 : 13;
    g.addColorStop(0, `rgba(${red}, 8, 6, ${0.02 + rand() * 0.05})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  speckle(ctx, rand, 3400, 0.18);
  speckle(hctx, rand, 1600, 0.25);

  return { color, height, rough };
}

function makeFlagstoneCanvases(seed: number): {
  color: HTMLCanvasElement;
  height: HTMLCanvasElement;
  rough: HTMLCanvasElement;
} {
  const rand = mulberry32(seed);
  const { canvas: color, ctx } = canvas2d();
  const { canvas: height, ctx: hctx } = canvas2d();
  const { canvas: rough, ctx: rctx } = canvas2d();

  ctx.fillStyle = "#080707";
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  hctx.fillStyle = "#090909";
  hctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  rctx.fillStyle = "#f4f4f4";
  rctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const cell = 96;
  const points: THREE.Vector2[][] = [];
  for (let gy = -1; gy < 7; gy += 1) {
    for (let gx = -1; gx < 7; gx += 1) {
      const jx = (rand() - 0.5) * 24;
      const jy = (rand() - 0.5) * 24;
      points.push([
        new THREE.Vector2(gx * cell + jx, gy * cell + jy),
        new THREE.Vector2((gx + 1) * cell + jx, gy * cell + jy + (rand() - 0.5) * 12),
        new THREE.Vector2((gx + 1) * cell + jx + (rand() - 0.5) * 12, (gy + 1) * cell + jy),
        new THREE.Vector2(gx * cell + jx + (rand() - 0.5) * 12, (gy + 1) * cell + jy),
      ]);
    }
  }

  points.forEach((poly) => {
    const cx = poly.reduce((sum, p) => sum + p.x, 0) / 4;
    const cy = poly.reduce((sum, p) => sum + p.y, 0) / 4;
    const base = 40 + rand() * 32;
    const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 82);
    grad.addColorStop(0, `rgb(${base + 18}, ${base + 14}, ${base + 12})`);
    grad.addColorStop(0.6, `rgb(${base}, ${base - 2}, ${base - 1})`);
    grad.addColorStop(1, `rgb(${Math.max(5, base - 16)}, ${Math.max(5, base - 17)}, ${Math.max(5, base - 16)})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(poly[0].x + 3, poly[0].y + 3);
    for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i].x - 3, poly[i].y - 3);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(184, 159, 143, 0.11)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const hv = 105 + rand() * 54;
    hctx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hctx.beginPath();
    hctx.moveTo(poly[0].x + 4, poly[0].y + 4);
    for (let i = 1; i < poly.length; i += 1) hctx.lineTo(poly[i].x - 4, poly[i].y - 4);
    hctx.closePath();
    hctx.fill();

    const rv = 154 + rand() * 56;
    rctx.fillStyle = `rgb(${rv},${rv},${rv})`;
    rctx.beginPath();
    rctx.moveTo(poly[0].x + 5, poly[0].y + 5);
    for (let i = 1; i < poly.length; i += 1) rctx.lineTo(poly[i].x - 5, poly[i].y - 5);
    rctx.closePath();
    rctx.fill();

    if (rand() > 0.48) {
      drawCrack(ctx, rand, cx, cy - 18, 42, 0.8, "rgba(0,0,0,0.55)");
    }
  });

  speckle(ctx, rand, 4500, 0.2);
  speckle(hctx, rand, 2200, 0.3);

  // Damp patches and dried blood.
  for (let i = 0; i < 22; i += 1) {
    const x = rand() * TEXTURE_SIZE;
    const y = rand() * TEXTURE_SIZE;
    const rad = 16 + rand() * 74;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${rand() > 0.78 ? 74 : 2}, 3, 3, ${0.03 + rand() * 0.1})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  return { color, height, rough };
}

function textureFromCanvas(
  canvas: HTMLCanvasElement,
  repeat: number,
  renderer: THREE.WebGLRenderer,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

function colorTexture(
  canvas: HTMLCanvasElement,
  repeat: number,
  renderer: THREE.WebGLRenderer,
): THREE.CanvasTexture {
  const texture = textureFromCanvas(canvas, repeat, renderer);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ------------------------------------------------------------------ */
/* Decorative textures                                                */
/* ------------------------------------------------------------------ */

export function makeGlowTexture(color = "255, 78, 24"): THREE.CanvasTexture {
  const { canvas, ctx } = canvas2d(256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, `rgba(${color}, 1)`);
  g.addColorStop(0.12, `rgba(${color}, 0.72)`);
  g.addColorStop(0.35, `rgba(${color}, 0.2)`);
  g.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function makeSmokeTexture(color = "54, 9, 12"): THREE.CanvasTexture {
  const { canvas, ctx } = canvas2d(256);
  const rand = mulberry32(9231);
  for (let i = 0; i < 26; i += 1) {
    const x = 40 + rand() * 176;
    const y = 45 + rand() * 166;
    const r = 25 + rand() * 72;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color}, ${0.04 + rand() * 0.08})`);
    g.addColorStop(1, `rgba(${color}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function makeRuneTexture(kind: "pentagram" | "circle" | "cross" | "sigil"): THREE.CanvasTexture {
  const size = 1024;
  const { canvas, ctx } = canvas2d(size);
  ctx.clearRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = "#ff2d12";
  ctx.fillStyle = "#ff2d12";
  ctx.shadowColor = "#ff1c08";
  ctx.shadowBlur = 22;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (kind === "pentagram") {
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 376, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 332, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 412, 0, Math.PI * 2);
    ctx.stroke();

    // Inverted seven-point crown + five-point star cut from the reference.
    ctx.lineWidth = 6;
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + i * (Math.PI * 4 / 5);
      const x = Math.cos(a) * 330;
      const y = Math.sin(a) * 330;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.lineWidth = 2;
    for (let i = 0; i < 36; i += 1) {
      const a = (i / 36) * Math.PI * 2;
      const inner = 354;
      const outer = i % 3 === 0 ? 384 : 368;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
    for (let i = 0; i < 7; i += 1) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 7);
      ctx.save();
      ctx.rotate(a + Math.PI / 2);
      ctx.translate(0, -430);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(8, 4);
      ctx.lineTo(0, 22);
      ctx.lineTo(-8, 4);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  } else if (kind === "circle") {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 288, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 248, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 9; i += 1) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 9);
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 250, Math.sin(a) * 250);
    }
    ctx.stroke();
    ctx.lineWidth = 3;
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.translate(0, -266);
      ctx.beginPath();
      ctx.moveTo(-10, -18);
      ctx.lineTo(0, 18);
      ctx.lineTo(10, -18);
      ctx.stroke();
      ctx.restore();
    }
  } else if (kind === "cross") {
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(0, -300);
    ctx.lineTo(0, 300);
    ctx.moveTo(-124, -218);
    ctx.lineTo(124, -218);
    ctx.moveTo(-74, -90);
    ctx.lineTo(74, -90);
    ctx.stroke();
    ctx.lineWidth = 8;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sign * 20, -154);
      ctx.quadraticCurveTo(sign * 162, -164, sign * 170, -84);
      ctx.quadraticCurveTo(sign * 108, -120, sign * 72, -110);
      ctx.stroke();
    }
  } else {
    ctx.lineWidth = 7;
    const r = 294;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI * 4) / 5;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(0, -215);
    ctx.lineTo(0, 252);
    ctx.moveTo(-94, -148);
    ctx.lineTo(94, -148);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function makeBannerTexture(
  variant: "cross" | "sigil" | "plain" = "cross",
): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const w = 256;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(variant.length * 9427 + 15);

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#4c1111");
  grad.addColorStop(0.32, "#8a1c1a");
  grad.addColorStop(0.75, "#3b0b0c");
  grad.addColorStop(1, "#170405");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(w - 2, 0);
  ctx.lineTo(w - 8, h - 60);
  ctx.lineTo(w - 30, h - 42);
  ctx.lineTo(w - 52, h - 72);
  ctx.lineTo(w - 82, h - 46);
  ctx.lineTo(w - 106, h - 82);
  ctx.lineTo(w - 132, h - 58);
  ctx.lineTo(w - 158, h - 96);
  ctx.lineTo(w - 186, h - 54);
  ctx.lineTo(w - 214, h - 78);
  ctx.lineTo(w - 234, h - 44);
  ctx.lineTo(8, h - 70);
  ctx.closePath();
  ctx.fill();

  // Folds.
  for (let i = 0; i < 18; i += 1) {
    const x = rand() * w;
    ctx.strokeStyle = `rgba(${rand() > 0.5 ? 111 : 0}, 0, 0, ${0.05 + rand() * 0.12})`;
    ctx.lineWidth = 1 + rand() * 8;
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.bezierCurveTo(x + (rand() - 0.5) * 28, h * 0.35, x + (rand() - 0.5) * 40, h * 0.7, x + (rand() - 0.5) * 20, h - 70);
    ctx.stroke();
  }

  // Frayed hem.
  ctx.fillStyle = "#0b0203";
  for (let i = 0; i < 40; i += 1) {
    const x = rand() * w;
    const y = h - 80 + rand() * 24;
    ctx.fillRect(x, y, 1 + rand() * 2, 4 + rand() * 26);
  }

  // Gold-blood border.
  ctx.strokeStyle = "rgba(150, 48, 34, 0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 18, w - 32, h - 116);

  ctx.save();
  ctx.translate(w / 2, 210);
  ctx.strokeStyle = "#df2b15";
  ctx.fillStyle = "#d82211";
  ctx.shadowColor = "#ff260e";
  ctx.shadowBlur = 20;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  if (variant === "cross" || variant === "plain") {
    ctx.beginPath();
    ctx.moveTo(0, -122);
    ctx.lineTo(0, 124);
    ctx.moveTo(-54, -78);
    ctx.lineTo(54, -78);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-13, -12);
    ctx.quadraticCurveTo(38, -54, 92, -26);
    ctx.quadraticCurveTo(38, -18, 18, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(13, -12);
    ctx.quadraticCurveTo(-38, -54, -92, -26);
    ctx.quadraticCurveTo(-38, -18, -18, 6);
    ctx.stroke();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + i * (Math.PI * 4 / 5);
      if (i === 0) ctx.moveTo(Math.cos(a) * 92, Math.sin(a) * 92);
      else ctx.lineTo(Math.cos(a) * 92, Math.sin(a) * 92);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 112, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  // Emissive version: only the sigil survives.
  const emissiveCanvas = document.createElement("canvas");
  emissiveCanvas.width = w;
  emissiveCanvas.height = h;
  const ec = emissiveCanvas.getContext("2d")!;
  ec.fillStyle = "#000000";
  ec.fillRect(0, 0, w, h);
  ec.save();
  ec.translate(w / 2, 210);
  ec.strokeStyle = "#ff2a12";
  ec.fillStyle = "#ff2a12";
  ec.shadowColor = "#ff2a12";
  ec.shadowBlur = 12;
  ec.lineWidth = 8;
  ec.lineCap = "round";
  if (variant === "cross" || variant === "plain") {
    ec.beginPath();
    ec.moveTo(0, -122);
    ec.lineTo(0, 124);
    ec.moveTo(-54, -78);
    ec.lineTo(54, -78);
    ec.stroke();
    ec.lineWidth = 5;
    ec.beginPath();
    ec.moveTo(-13, -12);
    ec.quadraticCurveTo(38, -54, 92, -26);
    ec.quadraticCurveTo(38, -18, 18, 6);
    ec.stroke();
    ec.beginPath();
    ec.moveTo(13, -12);
    ec.quadraticCurveTo(-38, -54, -92, -26);
    ec.quadraticCurveTo(-38, -18, -18, 6);
    ec.stroke();
  } else {
    ec.beginPath();
    ec.arc(0, 0, 112, 0, Math.PI * 2);
    ec.stroke();
  }
  ec.restore();
  const emissive = new THREE.CanvasTexture(emissiveCanvas);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

export function makeFlameTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = canvas2d(128);
  const g = ctx.createRadialGradient(64, 84, 4, 64, 66, 62);
  g.addColorStop(0, "rgba(255,252,221,1)");
  g.addColorStop(0.22, "rgba(255,211,110,0.95)");
  g.addColorStop(0.48, "rgba(255,92,24,0.72)");
  g.addColorStop(1, "rgba(126,10,2,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(64, 64, 34, 58, 0, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ------------------------------------------------------------------ */
/* Materials                                                          */
/* ------------------------------------------------------------------ */

export interface MaterialLibrary {
  stone: THREE.MeshStandardMaterial;
  stoneAlt: THREE.MeshStandardMaterial;
  stoneDark: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  chain: THREE.MeshStandardMaterial;
  bronze: THREE.MeshStandardMaterial;
  wax: THREE.MeshStandardMaterial;
  bone: THREE.MeshStandardMaterial;
  banner: Record<"cross" | "sigil" | "plain", THREE.MeshStandardMaterial>;
  rune: THREE.MeshBasicMaterial;
  runeDaisy: THREE.MeshBasicMaterial;
  ember: THREE.MeshBasicMaterial;
  glow: THREE.SpriteMaterial;
  smoke: THREE.SpriteMaterial;
  black: THREE.MeshStandardMaterial;
  crimsonGlow: THREE.MeshStandardMaterial;
}

export function createMaterialLibrary(renderer: THREE.WebGLRenderer): MaterialLibrary {
  const stone = makeStoneCanvases(1147);
  const stoneAlt = makeStoneCanvases(7711);
  const floor = makeFlagstoneCanvases(2903);

  const stoneNormal = textureFromCanvas(
    heightToNormal(stone.height, 2.8),
    2,
    renderer,
  );
  stoneNormal.colorSpace = THREE.NoColorSpace;
  const stoneAltNormal = textureFromCanvas(
    heightToNormal(stoneAlt.height, 2.6),
    2,
    renderer,
  );
  stoneAltNormal.colorSpace = THREE.NoColorSpace;
  const floorNormal = textureFromCanvas(
    heightToNormal(floor.height, 2.2),
    3,
    renderer,
  );
  floorNormal.colorSpace = THREE.NoColorSpace;

  const stoneMat = new THREE.MeshStandardMaterial({
    map: colorTexture(stone.color, 2, renderer),
    normalMap: stoneNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: textureFromCanvas(stone.rough, 2, renderer),
    color: 0xd2cbc7,
    roughness: 0.92,
    metalness: 0.03,
  });
  stoneMat.map!.colorSpace = THREE.SRGBColorSpace;

  const stoneAltMat = new THREE.MeshStandardMaterial({
    map: colorTexture(stoneAlt.color, 2.4, renderer),
    normalMap: stoneAltNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: textureFromCanvas(stoneAlt.rough, 2.4, renderer),
    color: 0xc9c1bf,
    roughness: 0.94,
    metalness: 0.025,
  });

  const stoneDarkMat = new THREE.MeshStandardMaterial({
    map: colorTexture(stone.color, 1.3, renderer),
    normalMap: stoneNormal,
    normalScale: new THREE.Vector2(1.05, 1.05),
    color: 0x9f989a,
    roughness: 0.97,
    metalness: 0.02,
  });

  const floorMat = new THREE.MeshStandardMaterial({
    map: colorTexture(floor.color, 4, renderer),
    normalMap: floorNormal,
    normalScale: new THREE.Vector2(0.62, 0.62),
    roughnessMap: textureFromCanvas(floor.rough, 4, renderer),
    color: 0xd0c8c4,
    roughness: 0.9,
    metalness: 0.035,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    map: colorTexture(stoneAlt.color, 1.1, renderer),
    normalMap: stoneAltNormal,
    normalScale: new THREE.Vector2(0.7, 0.7),
    color: 0x8f888a,
    roughness: 0.86,
    metalness: 0.06,
  });

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x2b2427,
    roughness: 0.48,
    metalness: 0.78,
  });

  const chainMat = new THREE.MeshStandardMaterial({
    color: 0x4b3431,
    roughness: 0.34,
    metalness: 0.9,
    emissive: 0x160402,
    emissiveIntensity: 0.35,
  });

  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0x4a2c1b,
    roughness: 0.46,
    metalness: 0.68,
    emissive: 0x1a0701,
    emissiveIntensity: 0.4,
  });

  const waxMat = new THREE.MeshStandardMaterial({
    color: 0x8f7b63,
    roughness: 0.72,
    metalness: 0.0,
    emissive: 0x1a0c04,
    emissiveIntensity: 0.24,
  });

  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xa08c74,
    roughness: 0.82,
    metalness: 0.0,
  });

  const makeBannerMat = (variant: "cross" | "sigil" | "plain"): THREE.MeshStandardMaterial => {
    const { map } = makeBannerTexture(variant);
    return new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: 0x6a0c08,
      emissiveIntensity: 0.65,
      color: 0xf0ddd6,
      roughness: 0.86,
      metalness: 0.02,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.42,
    });
  };

  const runeMat = new THREE.MeshBasicMaterial({
    map: makeRuneTexture("pentagram"),
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  const runeDaisyMat = new THREE.MeshBasicMaterial({
    map: makeRuneTexture("circle"),
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  const emberMat = new THREE.MeshBasicMaterial({
    color: 0xff6a2a,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  return {
    stone: stoneMat,
    stoneAlt: stoneAltMat,
    stoneDark: stoneDarkMat,
    floor: floorMat,
    trim: trimMat,
    iron: ironMat,
    chain: chainMat,
    bronze: bronzeMat,
    wax: waxMat,
    bone: boneMat,
    banner: {
      cross: makeBannerMat("cross"),
      sigil: makeBannerMat("sigil"),
      plain: makeBannerMat("plain"),
    },
    rune: runeMat,
    runeDaisy: runeDaisyMat,
    ember: emberMat,
    glow: new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0xff5b24,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
    smoke: new THREE.SpriteMaterial({
      map: makeSmokeTexture(),
      color: 0x9b3a30,
      transparent: true,
      opacity: 0.2,
      blending: THREE.NormalBlending,
      depthWrite: false,
      toneMapped: false,
    }),
    black: new THREE.MeshStandardMaterial({
      color: 0x050405,
      roughness: 0.65,
      metalness: 0.5,
    }),
    crimsonGlow: new THREE.MeshStandardMaterial({
      color: 0x330303,
      emissive: 0xff1d0a,
      emissiveIntensity: 3.2,
      roughness: 0.3,
      metalness: 0.1,
      toneMapped: false,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Shaders                                                            */
/* ------------------------------------------------------------------ */

const lavaVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const lavaFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vWorld;
  uniform float uTime;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    mat2 rot = mat2(0.82, -0.57, 0.57, 0.82);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot * p * 2.03 + 13.7;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vWorld.xz * 0.055;
    float t = uTime * 0.032;
    vec2 flow = vec2(fbm(p + vec2(t, t * 0.4)), fbm(p * 1.15 - vec2(t * 0.7, -t)));
    float n = fbm(p * 1.05 + flow * 0.9);
    float detail = fbm(p * 2.6 - flow * 0.55 + 5.1);
    float churn = n * 0.7 + detail * 0.3;
    float fissure = pow(1.0 - abs(detail - 0.47) * 2.0, 10.0);
    float pools = smoothstep(0.48, 0.82, churn);

    vec3 crust = vec3(0.005, 0.0005, 0.0002);
    vec3 deep = vec3(0.032, 0.001, 0.0002);
    vec3 hot = vec3(0.26, 0.0035, 0.00025);
    vec3 core = vec3(0.9, 0.035, 0.0007);
    vec3 col = mix(crust, deep, pools * 0.82);
    col = mix(col, hot, smoothstep(0.6, 0.94, churn) * 0.9);
    col = mix(col, core, fissure * 0.95);

    // The lava sea dissolves into the red murk at the edges of the diorama.
    float d = length(vWorld.xz - vec2(0.0, -10.0));
    float horizon = 1.0 - smoothstep(38.0, 88.0, d);
    col *= (0.18 + 0.82 * horizon) * 1.25;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createLavaMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: lavaVertex,
    fragmentShader: lavaFragment,
    toneMapped: false,
  });
}

const beamFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uOpacity;

  void main() {
    float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
    float core = pow(smoothstep(0.0, 0.5, 1.0 - abs(vUv.x - 0.5) * 2.0), 3.2);
    float pulse = 0.84 + 0.16 * sin(uTime * 1.7 + vUv.y * 4.0);
    float fade = smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    vec3 col = mix(vec3(0.28, 0.002, 0.0005), vec3(1.0, 0.08, 0.006), core);
    float alpha = (edge * 0.08 + core * 0.38) * fade * pulse * uOpacity;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createBeamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: lavaVertex,
    fragmentShader: beamFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/* ------------------------------------------------------------------ */
/* Small shared geometry helpers                                      */
/* ------------------------------------------------------------------ */

export function randomPointInBox(
  rand: () => number,
  width: number,
  depth: number,
  height: number,
): THREE.Vector3 {
  return new THREE.Vector3(
    (rand() - 0.5) * width,
    rand() * height,
    (rand() - 0.5) * depth,
  );
}

export function setShadow(
  object: THREE.Object3D,
  cast = true,
  receive = true,
): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

export function roughRockGeometry(seed: number): THREE.BufferGeometry {
  const geometry = new THREE.DodecahedronGeometry(1, 1);
  const pos = geometry.attributes.position;
  const rand = mulberry32(seed);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const n = 0.74 + rand() * 0.48;
    v.multiplyScalar(n);
    v.y *= 0.72;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export { lerp, smoothstep };
