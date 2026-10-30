import * as THREE from "three";

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rand: Rng, min: number, max: number): number {
  return min + (max - min) * rand();
}

export function pick<T>(rand: Rng, values: readonly T[]): T {
  return values[Math.floor(rand() * values.length)]!;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/* -------------------------------------------------------------------------- */
/* Palette                                                                    */
/* -------------------------------------------------------------------------- */

export const PALETTE = {
  paper: "#f6ecd9",
  paperDeep: "#efe1ca",
  ink: "#4a3125",
  inkSoft: "#7d5b45",
  grass: ["#8fa866", "#7e9957", "#a4b875", "#6f8a50", "#b6c58a", "#91a365"],
  grassDeep: "#5f7847",
  dirt: ["#b28a63", "#9a724f", "#c19b73", "#8a6649"],
  soil: "#6c4b35",
  clay: "#9a6c49",
  sand: "#c1a078",
  stone: "#76695c",
  bamboo: ["#8aa34e", "#9db75e", "#789144", "#b1c56f"],
  leaf: ["#7d9c4d", "#8eae58", "#698743", "#a4bb69"],
  sakura: ["#f4b7c5", "#f7c9d4", "#ec9fb4", "#f9dce2"],
  trunk: "#77503d",
  rock: ["#8e8375", "#777266", "#a39682", "#6e6c61"],
  cream: "#f8ebd5",
  rust: "#c96338",
  rustDeep: "#a84828",
  chocolate: "#4a2b20",
  blush: "#ed8b78",
  water: "#7fc4bc",
  waterDeep: "#3f8f8e",
  wood: "#a6784c",
  woodDeep: "#7a522f",
} as const;

/* -------------------------------------------------------------------------- */
/* Canvas helpers                                                             */
/* -------------------------------------------------------------------------- */

export interface Canvas2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export function canvas2d(width: number, height = width): Canvas2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to create 2D canvas context");
  return { canvas, ctx };
}

export function makeTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function rgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((ch) => ch + ch).join("")
    : clean;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* -------------------------------------------------------------------------- */
/* Ground texture: moss, path, pebbles, tens of thousands of brush strokes     */
/* -------------------------------------------------------------------------- */

export interface GroundTextures {
  color: HTMLCanvasElement;
  height: HTMLCanvasElement;
}

export function makeGroundTextures(size = 2048): GroundTextures {
  const rand = mulberry32(0xa71e9);
  const { canvas, ctx } = canvas2d(size, size);
  const { canvas: heightCanvas, ctx: hctx } = canvas2d(1024, 1024);

  ctx.fillStyle = "#7f9857";
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = "#777777";
  hctx.fillRect(0, 0, 1024, 1024);

  // Large, soft patches establish a mottled base before the fine strokes.
  for (let i = 0; i < 46; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const radius = range(rand, size * 0.08, size * 0.28);
    const color = pick(rand, [...PALETTE.grass, ...PALETTE.dirt]);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, rgba(color, range(rand, 0.16, 0.34)));
    grad.addColorStop(0.65, rgba(color, range(rand, 0.06, 0.16)));
    grad.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

    const hg = hctx.createRadialGradient(
      x / 2,
      y / 2,
      0,
      x / 2,
      y / 2,
      radius / 2,
    );
    hg.addColorStop(0, "rgba(255,255,255,0.14)");
    hg.addColorStop(1, "rgba(255,255,255,0)");
    hctx.fillStyle = hg;
    hctx.fillRect((x - radius) / 2, (y - radius) / 2, radius, radius);
  }

  // Broad painted color fields that survive the downscale to the diorama.
  for (let i = 0; i < 90; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const radius = range(rand, 45, 230);
    const color = pick(rand, [...PALETTE.grass, ...PALETTE.dirt, "#c2b276", "#5d783f"]);
    const grad = ctx.createRadialGradient(x, y, radius * 0.15, x, y, radius);
    grad.addColorStop(0, rgba(color, range(rand, 0.18, 0.34)));
    grad.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Stronger, larger clumps read as painted moss and dry grass at diorama scale.
  for (let i = 0; i < 140; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const rx = range(rand, 14, 70);
    const ry = rx * range(rand, 0.35, 0.9);
    const color = pick(rand, [...PALETTE.grass, ...PALETTE.dirt, "#c8b979"]);
    ctx.fillStyle = rgba(color, range(rand, 0.07, 0.2));
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Large, low-frequency fields keep the expanded meadow from reading as a
  // single flat green sheet.
  for (let i = 0; i < 90; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const radius = range(rand, 70, 300);
    const color = pick(rand, ["#5d783f", "#809b54", "#c0b878", "#a9865c", "#6d8a4b"]);
    const grad = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
    grad.addColorStop(0, rgba(color, range(rand, 0.12, 0.28)));
    grad.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Winding pale path from the sign toward the pond.
  const path = new Path2D();
  path.moveTo(size * 0.16, size * 0.7);
  path.bezierCurveTo(
    size * 0.3,
    size * 0.62,
    size * 0.42,
    size * 0.8,
    size * 0.62,
    size * 0.79,
  );
  path.bezierCurveTo(
    size * 0.72,
    size * 0.785,
    size * 0.76,
    size * 0.84,
    size * 0.8,
    size * 0.88,
  );
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [width, alpha] of [
    [240, 0.13],
    [170, 0.17],
    [108, 0.2],
  ] as const) {
    ctx.strokeStyle = rgba("#c3a176", alpha);
    ctx.lineWidth = width;
    ctx.stroke(path);
  }
  ctx.restore();

  // Fine path grit.
  for (let i = 0; i < 900; i += 1) {
    const x = size * (0.18 + rand() * 0.62);
    const y = size * (0.68 + rand() * 0.18);
    ctx.fillStyle = rgba(pick(rand, PALETTE.dirt), range(rand, 0.05, 0.2));
    ctx.beginPath();
    ctx.ellipse(x, y, range(rand, 1, 4), range(rand, 0.6, 2.4), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // The main illustrative texture: 24k short strokes.
  const strokeColors = [...PALETTE.grass, ...PALETTE.grass, ...PALETTE.dirt];
  for (let i = 0; i < 24000; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const angle = range(rand, -1.2, 1.2) + (rand() > 0.75 ? Math.PI / 2 : 0);
    const length = range(rand, 2.5, 10);
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    ctx.strokeStyle = rgba(pick(rand, strokeColors), range(rand, 0.06, 0.26));
    ctx.lineWidth = range(rand, 0.8, 2.1);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();

    if (i % 3 === 0) {
      const hx = x / 2;
      const hy = y / 2;
      hctx.strokeStyle = rand() > 0.45 ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.15)";
      hctx.lineWidth = range(rand, 1, 3);
      hctx.beginPath();
      hctx.moveTo(hx, hy);
      hctx.lineTo(hx + dx / 2, hy + dy / 2);
      hctx.stroke();
    }
  }

  // Broader brush marks read as painted grass once the texture is minified.
  for (let i = 0; i < 6200; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const angle = range(rand, -1.2, 1.2);
    const length = range(rand, 9, 32);
    ctx.strokeStyle = rgba(
      pick(rand, [...PALETTE.grass, ...PALETTE.dirt]),
      range(rand, 0.07, 0.2),
    );
    ctx.lineWidth = range(rand, 1.6, 4.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }

  // Even longer dry-brush strokes for visible painterly grain.
  for (let i = 0; i < 6600; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const angle = range(rand, -1.1, 1.1);
    const length = range(rand, 24, 92);
    ctx.strokeStyle = rgba(
      pick(rand, ["#5f7a42", "#b4bd78", "#8da45c", "#a9865c", "#c9b477"]),
      range(rand, 0.06, 0.18),
    );
    ctx.lineWidth = range(rand, 2, 6.5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }

  // Tiny flowers, clover and pebbles scattered over the moss.
  const flowerColors = ["#fff3cf", "#f7d9e2", "#f2c9a0", "#fff7e6"];
  for (let i = 0; i < 460; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    if (i < 180) {
      const color = pick(rand, flowerColors);
      ctx.fillStyle = rgba(color, range(rand, 0.45, 0.9));
      const r = range(rand, 1.5, 4.2);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (r > 3) {
        ctx.fillStyle = "rgba(245, 207, 104, 0.9)";
        ctx.beginPath();
        ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = rgba(pick(rand, PALETTE.dirt), range(rand, 0.12, 0.4));
      ctx.beginPath();
      ctx.ellipse(x, y, range(rand, 1, 5), range(rand, 0.8, 3), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 247, 226, 0.35)";
      ctx.beginPath();
      ctx.ellipse(x - 0.8, y - 0.8, 0.8, 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Edge darkening, masked to the rounded platform silhouette.
  const edge = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.28,
    size / 2,
    size / 2,
    size * 0.72,
  );
  edge.addColorStop(0, "rgba(61, 47, 30, 0)");
  edge.addColorStop(0.82, "rgba(61, 47, 30, 0.035)");
  edge.addColorStop(1, "rgba(61, 47, 30, 0.12)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);

  return { color: canvas, height: heightCanvas };
}

/* -------------------------------------------------------------------------- */
/* Soil strata for the cut face                                               */
/* -------------------------------------------------------------------------- */

export function makeSoilTexture(width = 1024, height = 512): HTMLCanvasElement {
  const rand = mulberry32(0x5011);
  const { canvas, ctx } = canvas2d(width, height);

  const layers = [
    { top: 0, bottom: 82, color: "#463122", detail: "#5c412b" },
    { top: 82, bottom: 195, color: "#62422b", detail: "#7b5437" },
    { top: 195, bottom: 326, color: "#865535", detail: "#9c6841" },
    { top: 326, bottom: 432, color: "#b38659", detail: "#cda274" },
    { top: 432, bottom: height, color: "#554b3f", detail: "#6b5e4d" },
  ];

  for (const layer of layers) {
    const grad = ctx.createLinearGradient(0, layer.top, 0, layer.bottom);
    grad.addColorStop(0, layer.detail);
    grad.addColorStop(0.42, layer.color);
    grad.addColorStop(1, layer.color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    let y = layer.top;
    ctx.lineTo(0, y);
    for (let x = 0; x <= width; x += 16) {
      y = layer.top + Math.sin(x * 0.026 + layer.top) * 4 + Math.sin(x * 0.071) * 2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, layer.bottom);
    for (let x = width; x >= 0; x -= 16) {
      y = layer.bottom + Math.sin(x * 0.022 + layer.bottom * 1.7) * 7;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(0, layer.bottom + 7);
    ctx.closePath();
    ctx.fill();
  }

  // Dark seams between strata.
  for (const layer of layers.slice(1)) {
    ctx.strokeStyle = "rgba(35, 24, 16, 0.5)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 12) {
      const y = layer.top + Math.sin(x * 0.026 + layer.top) * 4 + Math.sin(x * 0.071) * 2;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Pebbles and little stones embedded in the cut.
  for (let i = 0; i < 220; i += 1) {
    const x = rand() * width;
    const y = range(rand, height * 0.18, height * 0.98);
    const rw = range(rand, 2, 15);
    const rh = rw * range(rand, 0.45, 0.9);
    ctx.fillStyle = rgba(pick(rand, ["#d8c7a8", "#a5977e", "#6f6556", "#cbb58d"]), range(rand, 0.24, 0.72));
    ctx.beginPath();
    ctx.ellipse(x, y, rw, rh, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 246, 220, 0.18)";
    ctx.beginPath();
    ctx.ellipse(x - rw * 0.3, y - rh * 0.3, rw * 0.3, rh * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Roots reaching down from the grass cap.
  for (let i = 0; i < 52; i += 1) {
    const x = rand() * width;
    const startY = range(rand, 8, 40);
    let cx = x;
    let cy = startY;
    ctx.strokeStyle = rgba("#392719", range(rand, 0.32, 0.66));
    ctx.lineWidth = range(rand, 0.8, 2.1);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const segments = 3 + Math.floor(rand() * 4);
    for (let s = 0; s < segments; s += 1) {
      cx += range(rand, -12, 12);
      cy += range(rand, 12, 34);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    if (rand() > 0.55) {
      ctx.strokeStyle = "rgba(66, 48, 31, 0.22)";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + range(rand, -26, 26), cy + range(rand, 8, 24));
      ctx.stroke();
    }
  }

  // A quiet moss fringe along the top rim.
  const moss = ctx.createLinearGradient(0, 0, 0, 46);
  moss.addColorStop(0, "rgba(91, 113, 59, 0.62)");
  moss.addColorStop(1, "rgba(91, 113, 59, 0)");
  ctx.fillStyle = moss;
  ctx.fillRect(0, 0, width, 46);
  for (let i = 0; i < 140; i += 1) {
    ctx.fillStyle = rgba(pick(rand, PALETTE.grass), range(rand, 0.08, 0.28));
    ctx.beginPath();
    ctx.ellipse(rand() * width, range(rand, 0, 38), range(rand, 2, 7), range(rand, 1, 3), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

/* -------------------------------------------------------------------------- */
/* Wood, sign text, sprite labels, star, shadow                                */
/* -------------------------------------------------------------------------- */

export function makeWoodTexture(size = 512): HTMLCanvasElement {
  const rand = mulberry32(0x77aa21);
  const { canvas, ctx } = canvas2d(size, size);
  ctx.fillStyle = "#a77a4f";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 42; i += 1) {
    const y = rand() * size;
    ctx.strokeStyle = rgba(i % 3 === 0 ? "#684626" : "#c79768", range(rand, 0.08, 0.32));
    ctx.lineWidth = range(rand, 1, 5);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 20) {
      ctx.lineTo(x, y + Math.sin(x * 0.035 + y) * 5 + Math.sin(x * 0.012) * 9);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 8; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.strokeStyle = "rgba(87, 56, 31, 0.3)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y, range(rand, 10, 36), range(rand, 4, 14), rand() * Math.PI, 0, Math.PI * 2);
    ctx.stroke();
  }
  return canvas;
}

export function makeSignTexture(): HTMLCanvasElement {
  const { canvas, ctx } = canvas2d(1024, 512);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 156px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(255, 246, 225, 0.45)";
  ctx.strokeText("皮皮园", 512, 208);
  ctx.fillStyle = "#573622";
  ctx.fillText("皮皮园", 512, 208);

  ctx.font = '500 54px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255, 246, 225, 0.4)";
  ctx.strokeText("小熊猫的家", 512, 324);
  ctx.fillStyle = "rgba(87, 54, 34, 0.9)";
  ctx.fillText("小熊猫的家", 512, 324);

  // Paw print at the bottom right of the board.
  ctx.save();
  ctx.translate(788, 404);
  ctx.fillStyle = "rgba(87, 54, 34, 0.62)";
  ctx.beginPath();
  ctx.ellipse(0, 10, 23, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [x, y] of [
    [-28, -12],
    [-10, -23],
    [10, -23],
    [28, -12],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Soft decorative border.
  ctx.strokeStyle = "rgba(87, 54, 34, 0.16)";
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, 956, 444);
  return canvas;
}

export function makeTextTexture(text: string, accent = "#4a3125"): HTMLCanvasElement {
  const { canvas, ctx } = canvas2d(512, 160);
  ctx.clearRect(0, 0, 512, 160);
  ctx.fillStyle = "rgba(255, 249, 236, 0.92)";
  const r = 44;
  ctx.beginPath();
  ctx.roundRect(8, 18, 496, 124, r);
  ctx.fill();
  ctx.strokeStyle = "rgba(122, 88, 58, 0.16)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 58px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(text, 256, 82);
  return canvas;
}

export function makeTextSprite(text: string): THREE.Sprite {
  const texture = makeTexture(makeTextTexture(text));
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.28, 0.4, 1);
  sprite.renderOrder = 20;
  return sprite;
}

export function makeRadialShadowTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = canvas2d(256, 256);
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 124);
  g.addColorStop(0, "rgba(255,255,255,0.72)");
  g.addColorStop(0.42, "rgba(255,255,255,0.34)");
  g.addColorStop(0.78, "rgba(255,255,255,0.08)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function makeStarTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = canvas2d(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, "rgba(255,255,255,0.92)");
  g.addColorStop(0.18, "rgba(255,236,170,0.68)");
  g.addColorStop(0.55, "rgba(255,202,103,0.12)");
  g.addColorStop(1, "rgba(255,202,103,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.beginPath();
  ctx.translate(64, 64);
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? 47 : 18;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#fff8d6";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 204, 95, 0.85)";
  ctx.lineWidth = 2.4;
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function makeSoftCircleTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = canvas2d(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,244,220,0.9)");
  g.addColorStop(0.35, "rgba(255,235,190,0.4)");
  g.addColorStop(1, "rgba(255,235,190,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* -------------------------------------------------------------------------- */
/* Shapes and geometry helpers                                                */
/* -------------------------------------------------------------------------- */

export function roundedRectShape(width: number, depth: number, radius: number): THREE.Shape {
  const x = -width / 2;
  const y = -depth / 2;
  const r = Math.min(radius, width / 2, depth / 2);
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + depth - r);
  shape.quadraticCurveTo(x + width, y + depth, x + width - r, y + depth);
  shape.lineTo(x + r, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

export function remapTopUv(geometry: THREE.BufferGeometry, width: number, depth: number): void {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    uv.setXY(i, pos.getX(i) / width + 0.5, pos.getZ(i) / depth + 0.5);
  }
  uv.needsUpdate = true;
}

export function remapSideUv(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return;
  const minY = box.min.y;
  const maxY = box.max.y;
  const span = Math.max(0.0001, maxY - minY);
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const u = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
    const v = (maxY - pos.getY(i)) / span;
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

export function setVertexColor(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function stripGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const attribute of ["uv", "uv1", "uv2", "tangent"]) {
    geometry.deleteAttribute(attribute);
  }
  return geometry;
}

let cachedShadowTexture: THREE.CanvasTexture | null = null;

export function makeBlobShadow(
  width: number,
  depth: number,
  opacity = 0.3,
  color = 0x3e2b20,
): THREE.Mesh {
  if (!cachedShadowTexture) cachedShadowTexture = makeRadialShadowTexture();
  const material = new THREE.MeshBasicMaterial({
    map: cachedShadowTexture,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}

export function makeLeafGeometry(length = 0.28, width = 0.11): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -length / 2);
  shape.quadraticCurveTo(width * 0.55, -length * 0.16, 0, length / 2);
  shape.quadraticCurveTo(-width * 0.55, -length * 0.16, 0, -length / 2);
  const geometry = new THREE.ShapeGeometry(shape, 8);
  return geometry;
}

export function makePetalGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.08);
  shape.bezierCurveTo(0.075, -0.04, 0.065, 0.06, 0, 0.09);
  shape.bezierCurveTo(-0.065, 0.06, -0.075, -0.04, 0, -0.08);
  return new THREE.ShapeGeometry(shape, 8);
}
