import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import "./style.css";
import { CameraRig } from "./scene/cameraRig";
import { PandaActor, type PandaAction } from "./scene/character";
import { PREVIEW_PANDAS, createPipiGarden } from "./scene/createPipiGarden";
import { StarBurstSystem } from "./scene/particles";
import { PandaSystem, type PandaAgent } from "./scene/pandaSystem";
import { createPostPipeline, type PostPipeline } from "./scene/postprocess";
import { makeBlobShadow, makeTextSprite } from "./scene/procedural";
import {
  PLATFORM_RADIUS,
  PLATFORM_SIZE,
  PLATFORM_TOP,
  POND,
  POND_WORLD,
  uvToWorld,
  worldToUv,
} from "./scene/terrain";

type ViewMode = "hero" | "poses" | "closeup";
type Quality = "full" | "draft";
type PointerMode = "none" | "camera" | "lasso" | "panda";

interface LassoPoint {
  x: number;
  y: number;
}

interface GroundPoint {
  x: number;
  z: number;
  u: number;
  v: number;
}

const params = new URLSearchParams(window.location.search);
const view = (params.get("view") ?? "hero") as ViewMode;
const hiddenUi = params.get("ui") === "0";
const frozen = params.get("freeze") === "1";
const frozenTime = Number(params.get("t") ?? 2.2);
const initialCountRaw = Number(params.get("pandas") ?? 3);
const initialCount = Number.isFinite(initialCountRaw)
  ? THREE.MathUtils.clamp(Math.floor(initialCountRaw), 0, 30)
  : 3;
const poseParam = (params.get("pose") ?? "eat") as PandaAction;

if (hiddenUi) document.body.classList.add("capture");

const app = document.getElementById("app");
if (!app) throw new Error("Missing #app");

const canvasQuery = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvasQuery) throw new Error("Missing #scene canvas");
const canvas: HTMLCanvasElement = canvasQuery;

function showFallback(message: string): void {
  const fallback = document.createElement("div");
  fallback.className = "fallback";
  fallback.innerHTML = `<strong>皮皮园暂时没有铺开</strong><span>${message}</span>`;
  app!.append(fallback);
}

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    stencil: false,
    powerPreference: "high-performance",
  });
} catch (error) {
  showFallback("这个浏览器没有可用的 WebGL2 / WebGL 支持。");
  throw error;
}

const mobile = window.matchMedia("(max-width: 720px)").matches;
const pixelRatio = Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;
renderer.info.autoReset = false;
renderer.setClearColor(0xf6ecd9, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf6ecd9);

const garden = createPipiGarden();

/* -------------------------------------------------------------------------- */
/* DOM                                                                        */
/* -------------------------------------------------------------------------- */

const loading = document.getElementById("loading");
const hud = document.getElementById("hud");
const residentCount = document.getElementById("resident-count");
const selectionCard = document.getElementById("selection-card");
const selectionName = document.getElementById("selection-name");
const selectionSize = document.getElementById("selection-size");
const deleteButton = document.getElementById("btn-delete") as HTMLButtonElement | null;
const toast = document.getElementById("toast");
const lassoSvg = document.getElementById("lasso-layer") as SVGSVGElement | null;
const lassoPath = document.getElementById("lasso-path") as SVGPathElement | null;

if (hiddenUi && hud) hud.style.display = "none";

let toastTimer = 0;
function showToast(message: string, kind: "info" | "error" = "info"): void {
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("is-error", kind === "error");
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2400);
}

/* -------------------------------------------------------------------------- */
/* Camera and stage                                                           */
/* -------------------------------------------------------------------------- */

const yawRaw = params.get("yaw");
const pitchRaw = params.get("pitch");
const yaw = yawRaw !== null && Number.isFinite(Number(yawRaw))
  ? THREE.MathUtils.degToRad(Number(yawRaw))
  : undefined;
const pitch = pitchRaw !== null && Number.isFinite(Number(pitchRaw))
  ? THREE.MathUtils.degToRad(Number(pitchRaw))
  : undefined;

let activeCamera: THREE.PerspectiveCamera;
let rig: CameraRig | null = null;
let stageCamera: THREE.PerspectiveCamera | null = null;
let stageRoot: THREE.Group | null = null;
let pandaSystem: PandaSystem | null = null;
let starBurst: StarBurstSystem | null = null;
let pandaRoot: THREE.Group | null = null;

if (view === "hero") {
  scene.add(garden.root);

  pandaRoot = new THREE.Group();
  pandaRoot.name = "InteractivePandaRoot";
  garden.root.add(pandaRoot);

  starBurst = new StarBurstSystem(garden.root);
  pandaSystem = new PandaSystem(garden.obstacles, {
    onChange: () => updateHud(),
    onBurst: (x, y, z) => starBurst?.spawn(x, y, z),
  });
  pandaRoot.add(pandaSystem.root);

  const initialSpecs = PREVIEW_PANDAS.slice(0, Math.min(initialCount, PREVIEW_PANDAS.length));
  for (const spec of initialSpecs) {
    pandaSystem.spawn(spec.u, spec.v, spec.scale, {
      action: spec.action,
      yaw: spec.yaw,
      homeRadius: 1.4,
      silent: true,
    });
  }
  for (let i = PREVIEW_PANDAS.length; i < initialCount; i += 1) {
    pandaSystem.spawn(
      THREE.MathUtils.lerp(0.2, 0.8, Math.random()),
      THREE.MathUtils.lerp(0.2, 0.82, Math.random()),
      THREE.MathUtils.lerp(1.05, 1.45, Math.random()),
      { action: "idle", homeRadius: 1.3, silent: true },
    );
  }

  if (frozen) {
    pandaSystem.setFrozen(true);
    for (const agent of pandaSystem.agents) {
      agent.actor.forcePose(agent.action, frozenTime);
    }
  }

  rig = new CameraRig(garden.framePoints, window.innerWidth / window.innerHeight, {
    yaw,
    pitch,
  });
  activeCamera = rig.camera;
} else {
  scene.add(garden.root);
  garden.setEnvironmentVisible(false);
  stageRoot = buildCharacterStage(view, poseParam);
  scene.add(stageRoot);
  stageCamera = new THREE.PerspectiveCamera(
    view === "poses" ? 30 : 31,
    window.innerWidth / window.innerHeight,
    0.1,
    60,
  );
  if (view === "poses") {
    stageCamera.position.set(0, 1.8, 9.0);
    stageCamera.lookAt(0, 0.62, 0);
  } else {
    stageCamera.position.set(0.95, 1.55, 6.2);
    stageCamera.lookAt(0, 0.68, 0);
  }
  activeCamera = stageCamera;
}

const post: PostPipeline = createPostPipeline(renderer, scene, activeCamera);
post.setSize(window.innerWidth, window.innerHeight, pixelRatio);

const state = {
  ready: false,
};

/* -------------------------------------------------------------------------- */
/* HUD                                                                        */
/* -------------------------------------------------------------------------- */

function updateHud(): void {
  const count = pandaSystem?.agents.length ?? 0;
  if (residentCount) {
    residentCount.textContent = String(
      view === "hero" ? count : view === "poses" ? 5 : 1,
    );
  }
  garden.stats.pandas = view === "hero" ? count : 1;

  if (!selectionCard || !selectionName || !selectionSize) return;
  const selected = pandaSystem?.selected ?? null;
  if (!selected) {
    selectionCard.hidden = true;
    return;
  }
  selectionCard.hidden = false;
  selectionName.textContent = selected.name;
  selectionSize.textContent = `${selected.scale.toFixed(2)}× · ${selected.action}`;
}

function removeSelected(): void {
  if (!pandaSystem) return;
  const selected = pandaSystem.selected;
  if (!selected) return;
  pandaSystem.remove(selected);
  showToast(`${selected.name} 回去休息啦`);
  updateHud();
}

deleteButton?.addEventListener("click", removeSelected);

/* -------------------------------------------------------------------------- */
/* Quality: draft while the camera moves, full after it settles               */
/* -------------------------------------------------------------------------- */

let quality: Quality = "full";
let fullQualityTimer = 0;
let cameraDragging = false;
let cameraTargetYaw: number | null = null;
let cameraTargetPitch: number | null = null;
let cameraDragMoved = false;

function requestDraft(): void {
  if (quality === "draft") return;
  quality = "draft";
  post.setQuality(false);
  canvas.classList.add("is-refining");
}

function scheduleFull(delay = 220): void {
  window.clearTimeout(fullQualityTimer);
  fullQualityTimer = window.setTimeout(() => {
    if (cameraDragging || cameraTargetYaw !== null) return;
    quality = "full";
    post.setQuality(true);
    canvas.classList.remove("is-refining");
  }, delay);
}

function rotateCamera(deltaYaw: number, deltaPitch = 0): void {
  if (!rig) return;
  const baseYaw = cameraTargetYaw ?? rig.yaw;
  const basePitch = cameraTargetPitch ?? rig.pitch;
  cameraTargetYaw = baseYaw + deltaYaw;
  cameraTargetPitch = THREE.MathUtils.clamp(
    basePitch + deltaPitch,
    THREE.MathUtils.degToRad(20),
    THREE.MathUtils.degToRad(65),
  );
  requestDraft();
}

function resetCameraView(immediate = false): void {
  if (!rig) return;
  cameraTargetYaw = null;
  cameraTargetPitch = null;
  if (immediate) {
    rig.reset();
    quality = "full";
    post.setQuality(true);
    canvas.classList.remove("is-refining");
  } else {
    cameraTargetYaw = rig.defaultYaw;
    cameraTargetPitch = rig.defaultPitch;
    requestDraft();
  }
}

function updateCamera(delta: number): void {
  if (!rig || cameraDragging) return;
  if (cameraTargetYaw === null || cameraTargetPitch === null) return;
  const k = 1 - Math.exp(-delta * 13);
  const nextYaw = THREE.MathUtils.lerp(rig.yaw, cameraTargetYaw, k);
  const nextPitch = THREE.MathUtils.lerp(rig.pitch, cameraTargetPitch, k);
  if (
    Math.abs(nextYaw - cameraTargetYaw) < 0.002 &&
    Math.abs(nextPitch - cameraTargetPitch) < 0.002
  ) {
    rig.setOrientation(cameraTargetYaw, cameraTargetPitch);
    cameraTargetYaw = null;
    cameraTargetPitch = null;
    scheduleFull(90);
  } else {
    rig.setOrientation(nextYaw, nextPitch);
  }
}

/* -------------------------------------------------------------------------- */
/* Pointer interaction: lasso, selection, drag, camera                        */
/* -------------------------------------------------------------------------- */

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PLATFORM_TOP);
const groundHit = new THREE.Vector3();

let pointerMode: PointerMode = "none";
let activePointerId: number | null = null;
let lastPointerX = 0;
let lastPointerY = 0;
let pointerDownX = 0;
let pointerDownY = 0;
let lassoPoints: LassoPoint[] = [];
let dragAgent: PandaAgent | null = null;
let dragMoved = false;

function setRay(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, activeCamera);
}

function screenToGround(clientX: number, clientY: number): GroundPoint | null {
  setRay(clientX, clientY);
  const hit = raycaster.ray.intersectPlane(groundPlane, groundHit);
  if (!hit) return null;
  const uv = worldToUv(hit.x, hit.z);
  return { x: hit.x, z: hit.z, u: uv.u, v: uv.v };
}

function pointInsidePlatform(x: number, z: number, margin = 0.01): boolean {
  return roundedRectSdf(x, z, PLATFORM_SIZE * 0.5, PLATFORM_RADIUS) <= -margin;
}

function updateHover(clientX: number, clientY: number): void {
  if (view !== "hero" || !pandaSystem) return;
  setRay(clientX, clientY);
  const hit = pandaSystem.hitTest(raycaster);
  if (hit) {
    canvas.style.cursor = "pointer";
    return;
  }
  const ground = screenToGround(clientX, clientY);
  canvas.style.cursor = ground && pointInsidePlatform(ground.x, ground.z) ? "crosshair" : "grab";
}

function startCameraDrag(event: PointerEvent): void {
  pointerMode = "camera";
  activePointerId = event.pointerId;
  cameraDragging = true;
  cameraDragMoved = false;
  cameraTargetYaw = null;
  cameraTargetPitch = null;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  pointerDownX = event.clientX;
  pointerDownY = event.clientY;
  canvas.style.cursor = "grabbing";
  requestDraft();
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    /* pointer capture is best-effort */
  }
  event.preventDefault();
}

function startLasso(event: PointerEvent): void {
  pointerMode = "lasso";
  activePointerId = event.pointerId;
  dragAgent = null;
  lassoPoints = [{ x: event.clientX, y: event.clientY }];
  pointerDownX = event.clientX;
  pointerDownY = event.clientY;
  lassoSvg?.classList.add("is-active");
  lassoSvg?.classList.remove("is-invalid");
  drawLasso();
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    /* pointer capture is best-effort */
  }
  event.preventDefault();
}

function onPointerDown(event: PointerEvent): void {
  if (view !== "hero" || !pandaSystem) return;
  if (event.button === 2) {
    startCameraDrag(event);
    return;
  }
  if (event.button !== 0) return;

  setRay(event.clientX, event.clientY);
  const hit = pandaSystem.hitTest(raycaster);
  if (hit) {
    pandaSystem.select(hit);
    pointerMode = "panda";
    activePointerId = event.pointerId;
    dragAgent = hit;
    dragMoved = false;
    pointerDownX = event.clientX;
    pointerDownY = event.clientY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    canvas.style.cursor = "grab";
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
    event.preventDefault();
    return;
  }

  const ground = screenToGround(event.clientX, event.clientY);
  if (ground && pointInsidePlatform(ground.x, ground.z)) {
    startLasso(event);
    return;
  }

  startCameraDrag(event);
}

function onPointerMove(event: PointerEvent): void {
  if (view !== "hero" || !pandaSystem) return;
  if (activePointerId !== null && event.pointerId !== activePointerId) return;

  if (pointerMode === "none") {
    updateHover(event.clientX, event.clientY);
    return;
  }

  if (pointerMode === "camera") {
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    if (Math.abs(event.clientX - pointerDownX) + Math.abs(event.clientY - pointerDownY) > 4) {
      cameraDragMoved = true;
    }
    if (!rig) return;
    rig.setOrientation(rig.yaw - dx * 0.006, rig.pitch + dy * 0.004);
    return;
  }

  if (pointerMode === "panda" && dragAgent) {
    if (!dragMoved) {
      const distance = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
      if (distance < 5) return;
      dragMoved = true;
      pandaSystem.beginDrag(dragAgent);
      canvas.style.cursor = "grabbing";
    }
    const ground = screenToGround(event.clientX, event.clientY);
    if (ground) {
      pandaSystem.dragToWorld(ground.x, ground.z);
    }
    return;
  }

  if (pointerMode === "lasso") {
    const last = lassoPoints[lassoPoints.length - 1];
    if (!last || Math.hypot(event.clientX - last.x, event.clientY - last.y) >= 3) {
      lassoPoints.push({ x: event.clientX, y: event.clientY });
      if (lassoPoints.length > 260) lassoPoints.shift();
      drawLasso();
    }
  }
}

function onPointerUp(event: PointerEvent): void {
  if (activePointerId !== null && event.pointerId !== activePointerId) return;

  if (pointerMode === "camera") {
    cameraDragging = false;
    canvas.style.cursor = "grab";
    scheduleFull(200);
    if (!cameraDragMoved && pandaSystem) {
      // A click outside the diorama just dismisses the selection.
      pandaSystem.select(null);
    }
  } else if (pointerMode === "panda") {
    if (dragMoved && pandaSystem) {
      const result = pandaSystem.endDrag();
      if (result?.snapped) showToast("这边站不下，挪到旁边啦");
    }
    canvas.style.cursor = "grab";
  } else if (pointerMode === "lasso") {
    finalizeLasso();
  }

  if (activePointerId !== null) {
    try {
      canvas.releasePointerCapture(activePointerId);
    } catch {
      /* already released */
    }
  }
  pointerMode = "none";
  activePointerId = null;
  dragAgent = null;
  dragMoved = false;
  cameraDragMoved = false;
}

function onPointerCancel(): void {
  if (pointerMode === "panda" && pandaSystem) pandaSystem.cancelDrag();
  if (pointerMode === "lasso") clearLasso();
  cameraDragging = false;
  pointerMode = "none";
  activePointerId = null;
  dragAgent = null;
  dragMoved = false;
  canvas.style.cursor = "grab";
  scheduleFull(80);
}

canvas.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerCancel);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

canvas.addEventListener("pointerleave", () => {
  if (pointerMode === "none") canvas.style.cursor = "grab";
});

/* -------------------------------------------------------------------------- */
/* Lasso drawing and spawning                                                 */
/* -------------------------------------------------------------------------- */

function drawLasso(): void {
  if (!lassoPath || lassoPoints.length === 0) return;
  const d = lassoPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  lassoPath.setAttribute("d", d);
}

function clearLasso(delay = 0): void {
  const reset = (): void => {
    lassoPoints = [];
    lassoSvg?.classList.remove("is-active", "is-invalid");
    lassoPath?.setAttribute("d", "");
  };
  if (delay > 0) window.setTimeout(reset, delay);
  else reset();
}

function finalizeLasso(): void {
  if (!pandaSystem) {
    clearLasso();
    return;
  }
  const points = lassoPoints;
  if (points.length < 6) {
    pandaSystem.select(null);
    clearLasso();
    return;
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const screenRadius = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  ) * 0.5;
  if (screenRadius < 18) {
    pandaSystem.select(null);
    clearLasso();
    showToast("圈大一点，小熊猫才住得下", "error");
    return;
  }

  const groundPoints: GroundPoint[] = [];
  let outside = false;
  for (const point of points) {
    const ground = screenToGround(point.x, point.y);
    if (!ground || !pointInsidePlatform(ground.x, ground.z, 0)) {
      outside = true;
      break;
    }
    groundPoints.push(ground);
  }
  if (outside || groundPoints.length < 6) {
    invalidLasso("换块空地画圈吧");
    return;
  }

  let cx = 0;
  let cz = 0;
  for (const point of groundPoints) {
    cx += point.x;
    cz += point.z;
  }
  cx /= groundPoints.length;
  cz /= groundPoints.length;
  const uv = worldToUv(cx, cz);
  let radiusWorld = 0;
  for (const point of groundPoints) {
    radiusWorld += Math.hypot(point.x - cx, point.z - cz);
  }
  radiusWorld /= groundPoints.length;

  if (radiusWorld < 0.38) {
    invalidLasso("圈大一点，小熊猫才住得下");
    return;
  }

  const walkable = groundPoints.filter((point) =>
    pandaSystem!.isWalkableUv(point.u, point.v, 0.18),
  ).length;
  if (walkable / groundPoints.length < 0.72 || !pandaSystem.isWalkableUv(uv.u, uv.v, 0.24)) {
    invalidLasso("换块空地画圈吧");
    return;
  }

  if (pandaSystem.agents.length >= pandaSystem.maxPandas) {
    invalidLasso("皮皮园住不下更多啦（30/30）");
    return;
  }

  const layoutScale = PLATFORM_SIZE / 12;
  const scale = THREE.MathUtils.clamp(
    (radiusWorld / (0.72 * layoutScale)) * 1.22,
    0.9,
    2.05,
  );
  const homeRadius = THREE.MathUtils.clamp(radiusWorld * 0.8, 0.65, 2.2);
  const agent = pandaSystem.spawn(uv.u, uv.v, scale, {
    action: "idle",
    homeRadius,
    yaw: Math.random() * Math.PI * 2,
  });
  if (!agent) {
    invalidLasso("皮皮园住不下更多啦（30/30）");
    return;
  }

  clearLasso(160);
  showToast(`${agent.name} 来啦`);
  updateHud();
}

function invalidLasso(message: string): void {
  lassoSvg?.classList.add("is-invalid");
  showToast(message, "error");
  window.setTimeout(() => {
    lassoSvg?.classList.remove("is-invalid");
  }, 260);
  clearLasso(240);
}

/* -------------------------------------------------------------------------- */
/* Camera buttons and keyboard                                                */
/* -------------------------------------------------------------------------- */

document.querySelectorAll<HTMLButtonElement>("[data-camera]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.camera;
    if (action === "left") rotateCamera(THREE.MathUtils.degToRad(-45));
    else if (action === "right") rotateCamera(THREE.MathUtils.degToRad(45));
    else if (action === "reset") resetCameraView();
  });
});

window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

  if (event.key === "Delete" || event.key === "Backspace") {
    if (pandaSystem?.selected) {
      event.preventDefault();
      removeSelected();
    }
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    rotateCamera(THREE.MathUtils.degToRad(-5));
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    rotateCamera(THREE.MathUtils.degToRad(5));
  } else if (event.key === "Escape") {
    clearLasso();
    pandaSystem?.select(null);
  }
});

/* -------------------------------------------------------------------------- */
/* Resize                                                                     */
/* -------------------------------------------------------------------------- */

function applySize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isMobile = width < 720;
  const dpr = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  post.setSize(width, height, dpr);
  activeCamera.aspect = width / height;
  activeCamera.updateProjectionMatrix();
  if (rig) rig.setAspect(width / height);
  if (stageCamera) {
    stageCamera.aspect = width / height;
    stageCamera.position.z = view === "poses" ? 9.0 : 6.35;
    if (view === "closeup") {
      stageCamera.position.set(0.95, 1.55, 6.2);
      stageCamera.lookAt(0, 0.68, 0);
    }
    stageCamera.updateProjectionMatrix();
  }
}

window.addEventListener("resize", applySize);
window.visualViewport?.addEventListener("resize", applySize);

/* -------------------------------------------------------------------------- */
/* Character stage                                                            */
/* -------------------------------------------------------------------------- */

function buildCharacterStage(mode: ViewMode, pose: PandaAction): THREE.Group {
  const root = new THREE.Group();
  root.name = "PandaCharacterStage";

  const paperShadow = makeBlobShadow(
    mode === "poses" ? 8.4 : 4.6,
    mode === "poses" ? 2.8 : 3.6,
    0.2,
    0x3c2b20,
  );
  paperShadow.position.y = -0.3;
  root.add(paperShadow);

  if (mode === "poses") {
    const board = new THREE.Mesh(
      new RoundedBoxGeometry(7.4, 0.16, 2.25, 5, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xe6d3b2, roughness: 0.96 }),
    );
    board.position.y = -0.09;
    board.receiveShadow = true;
    root.add(board);

    const moss = new THREE.Mesh(
      new RoundedBoxGeometry(7.15, 0.055, 2.02, 5, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x8fa363, roughness: 0.96 }),
    );
    moss.position.y = -0.004;
    moss.receiveShadow = true;
    root.add(moss);

    const actions: PandaAction[] = ["walk", "sit", "eat", "wag", "idle"];
    const labels = ["走路", "坐下", "啃竹笋", "摇尾巴", "发呆"];
    const yaws = [1.08, 0.3, 0.36, -0.55, 0.16];
    const title = makeTextSprite("小熊猫姿态");
    title.position.set(0, 2.55, 0.4);
    title.scale.set(2.2, 0.68, 1);
    root.add(title);
    actions.forEach((action, index) => {
      const actor = new PandaActor(`pose-${action}`);
      actor.forcePose(action, 1.4 + index * 0.17);
      actor.setScale(1.38);
      actor.setPosition(-3.0 + index * 1.5, 0.015);
      actor.group.position.y = 0.02;
      actor.shadow.position.y = 0.03;
      actor.setYaw(yaws[index]!);
      actor.group.userData.panda = actor;
      actor.shadow.userData.isShadow = true;
      root.add(actor.group);
      root.add(actor.shadow);

      const label = makeTextSprite(labels[index]!);
      label.position.set(-3.0 + index * 1.5, 0.02, 0.92);
      label.scale.set(0.9, 0.28, 1);
      root.add(label);
    });
  } else {
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.65, 1.8, 0.16, 56),
      new THREE.MeshStandardMaterial({ color: 0x8ea262, roughness: 0.96 }),
    );
    pedestal.position.y = -0.08;
    pedestal.receiveShadow = true;
    root.add(pedestal);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.64, 0.035, 8, 56),
      new THREE.MeshStandardMaterial({ color: 0x71884e, roughness: 0.95 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.0;
    root.add(rim);

    const actor = new PandaActor("closeup");
    actor.forcePose(pose, 1.5);
    actor.setScale(2.15);
    actor.setPosition(0, 0.03);
    actor.group.position.y = 0.035;
    actor.shadow.position.y = 0.04;
    actor.setYaw(0.34);
    actor.group.userData.panda = actor;
    root.add(actor.group);
    root.add(actor.shadow);
  }

  return root;
}

/* -------------------------------------------------------------------------- */
/* Test / capture API                                                         */
/* -------------------------------------------------------------------------- */

function maxNdc(): { x: number; y: number } {
  if (!rig) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const point of garden.framePoints) {
    const p = rig.project(point);
    x = Math.max(x, Math.abs(p.x));
    y = Math.max(y, Math.abs(p.y));
  }
  return { x, y };
}

function projectUv(u: number, v: number): { x: number; y: number } | null {
  if (!rig) return null;
  const world = uvToWorld(u, v);
  const p = new THREE.Vector3(world.x, PLATFORM_TOP, world.z).project(activeCamera);
  return {
    x: ((p.x + 1) / 2) * window.innerWidth,
    y: ((1 - p.y) / 2) * window.innerHeight,
  };
}

function projectAgent(agent: PandaAgent): { x: number; y: number } | null {
  if (!rig) return null;
  const center = new THREE.Vector3(
    agent.x,
    PLATFORM_TOP + 0.46 * agent.scale,
    agent.z,
  ).project(activeCamera);
  return {
    x: ((center.x + 1) / 2) * window.innerWidth,
    y: ((1 - center.y) / 2) * window.innerHeight,
  };
}

function getAgentState(agent: PandaAgent): Record<string, unknown> {
  return {
    id: agent.id,
    name: agent.name,
    u: agent.u,
    v: agent.v,
    x: agent.x,
    z: agent.z,
    scale: agent.scale,
    action: agent.action,
    dragging: agent.dragging,
    home: { u: agent.homeU, v: agent.homeV, radius: agent.homeRadius },
    leaderId: agent.leaderId,
    screen: projectAgent(agent),
  };
}

const api = {
  getState: () => ({
    view,
    ready: state.ready,
    frozen,
    quality,
    camera: {
      position: activeCamera.position.toArray(),
      target: rig ? rig.target.toArray() : [0, 0.6, 0],
      fov: activeCamera.fov,
      aspect: activeCamera.aspect,
      yaw: rig?.yaw ?? 0,
      pitch: rig?.pitch ?? 0,
      distance: rig?.distance ?? 0,
    },
    cameraFit: maxNdc(),
    platform: {
      size: PLATFORM_SIZE,
      area: PLATFORM_SIZE * PLATFORM_SIZE,
      radius: PLATFORM_RADIUS,
    },
    pond: {
      u: POND.u,
      v: POND.v,
      x: POND_WORLD.x,
      z: POND_WORLD.z,
      rx: POND_WORLD.rx,
      rz: POND_WORLD.rz,
    },
    pandas: view === "hero" ? pandaSystem?.agents.length ?? 0 : 1,
    selected: pandaSystem?.selected
      ? { id: pandaSystem.selected.id, name: pandaSystem.selected.name }
      : null,
    agents: pandaSystem?.agents.map(getAgentState) ?? [],
    stats: {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      points: renderer.info.render.points,
      meshes: garden.stats.meshes,
      lights: garden.stats.lights,
      obstacles: garden.stats.obstacles,
    },
    elapsed,
  }),
  spawnAt: (u: number, v: number, scale = 1.1) => {
    if (!pandaSystem) return null;
    const agent = pandaSystem.spawn(u, v, scale, { action: "idle", homeRadius: 1.2 });
    if (!agent) {
      showToast("皮皮园住不下更多啦（30/30）", "error");
      return null;
    }
    updateHud();
    return agent.id;
  },
  spawnRandom: (count = 1) => {
    if (!pandaSystem) return [];
    const ids: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const agent = pandaSystem.spawn(
        THREE.MathUtils.lerp(0.18, 0.82, Math.random()),
        THREE.MathUtils.lerp(0.18, 0.82, Math.random()),
        THREE.MathUtils.lerp(0.85, 1.5, Math.random()),
        { action: "idle", homeRadius: 1.3 },
      );
      if (agent) ids.push(agent.id);
    }
    updateHud();
    return ids;
  },
  clearPandas: () => {
    pandaSystem?.clear();
    updateHud();
  },
  removePanda: (id: number) => {
    const removed = pandaSystem?.removeById(id) ?? false;
    updateHud();
    return removed;
  },
  selectPanda: (id: number | null) => {
    if (!pandaSystem) return;
    if (id === null) {
      pandaSystem.select(null);
    } else {
      const agent = pandaSystem.get(id);
      if (agent) pandaSystem.select(agent);
    }
    updateHud();
  },
  getPanda: (id: number) => {
    const agent = pandaSystem?.get(id);
    return agent ? getAgentState(agent) : null;
  },
  getRoster: () => pandaSystem?.agents.map(getAgentState) ?? [],
  isWalkable: (u: number, v: number, radius = 0.25) =>
    pandaSystem?.isWalkableUv(u, v, radius) ?? false,
  screenOf: (u: number, v: number) => projectUv(u, v),
  setOrientation: (yawDeg: number, pitchDeg: number) => {
    if (!rig) return;
    cameraTargetYaw = null;
    cameraTargetPitch = null;
    rig.setOrientation(THREE.MathUtils.degToRad(yawDeg), THREE.MathUtils.degToRad(pitchDeg));
    quality = "full";
    post.setQuality(true);
    canvas.classList.remove("is-refining");
  },
  resetCamera: () => resetCameraView(true),
  maxNdc,
  showToast,
};

declare global {
  interface Window {
    __IMG2THREEJS_READY__?: boolean;
    __PIPI__?: typeof api;
    __CAMERA__?: THREE.PerspectiveCamera;
    __CAMERA_TARGET__?: THREE.Vector3;
    __MODEL__?: { stats: typeof garden.stats };
  }
}

window.__PIPI__ = api;
window.__CAMERA__ = activeCamera;
window.__CAMERA_TARGET__ = rig?.target ?? new THREE.Vector3(0, 0.6, 0);
window.__MODEL__ = { stats: garden.stats };

/* -------------------------------------------------------------------------- */
/* Start                                                                      */
/* -------------------------------------------------------------------------- */

updateHud();
applySize();

const clock = new THREE.Clock();
let elapsed = frozen ? frozenTime : 0;
let frames = 0;
let firstFrame = true;

function renderFrame(): void {
  requestAnimationFrame(renderFrame);
  const delta = frozen ? 0 : Math.min(clock.getDelta(), 1 / 24);
  if (!frozen) elapsed += delta;

  updateCamera(delta);

  if (view === "hero") {
    garden.update(elapsed, delta || 0.0001);
    pandaSystem?.update(elapsed, delta || 0);
    starBurst?.update(delta || 0);
  } else if (stageRoot) {
    for (const child of stageRoot.children) {
      if (child.userData.panda instanceof PandaActor) {
        (child.userData.panda as PandaActor).update(frozen ? 0 : delta);
      }
    }
  }

  renderer.info.reset();
  post.render(quality === "full");
  frames += 1;

  if (firstFrame) {
    firstFrame = false;
    renderer.shadowMap.autoUpdate = false;
    state.ready = true;
    window.__IMG2THREEJS_READY__ = true;
    if (loading) loading.classList.add("loading-done");
    setTimeout(() => loading?.remove(), 900);
  }
}

renderFrame();

function roundedRectSdf(x: number, z: number, half: number, radius: number): number {
  const qx = Math.abs(x) - half + radius;
  const qz = Math.abs(z) - half + radius;
  return (
    Math.min(Math.max(qx, qz), 0) +
    Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) -
    radius
  );
}
