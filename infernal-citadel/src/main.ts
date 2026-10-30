import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import "./style.css";
import {
  CAMERAS,
  createInfernalCitadel,
  type CameraSpec,
  type InfernalCitadel,
} from "./scene/createInfernalCitadel";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) throw new Error("Missing #scene canvas");

const params = new URLSearchParams(window.location.search);
const alphaMode = params.get("alpha") === "1";
if (params.get("ui") === "0" || alphaMode) document.body.classList.add("capture");
if (alphaMode) document.body.classList.add("alpha-mode");
if (alphaMode) {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
  alpha: alphaMode,
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const baseExposure = Number(params.get("exposure") ?? 0.68);
renderer.toneMappingExposure = baseExposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x060304, alphaMode ? 0 : 1);

const scene = new THREE.Scene();
scene.background = alphaMode ? null : new THREE.Color(0x08070a);
if (params.get("fog") !== "0" && !alphaMode) {
  scene.fog = new THREE.FogExp2(0x180f16, Number(params.get("fog") ?? 0.0072));
}

const camera = new THREE.PerspectiveCamera(
  CAMERAS.hero.fov,
  window.innerWidth / window.innerHeight,
  0.1,
  260,
);
camera.position.set(...CAMERAS.hero.position);
camera.lookAt(new THREE.Vector3(...CAMERAS.hero.target));

const controls = new OrbitControls(camera, canvas);
controls.target.set(...CAMERAS.hero.target);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.75;
controls.panSpeed = 0.55;
controls.minDistance = 16;
controls.maxDistance = 160;
controls.minPolarAngle = 0.18;
controls.maxPolarAngle = Math.PI * 0.485;
controls.update();

const model: InfernalCitadel = createInfernalCitadel(renderer);
scene.add(model.root);

const hideList = (params.get("hide") ?? "").split(",").filter(Boolean);
for (const name of hideList) {
  const target = scene.getObjectByName(name);
  if (target) target.visible = false;
}
if (alphaMode) {
  const atmosphere = scene.getObjectByName("Atmosphere");
  if (atmosphere) atmosphere.visible = false;
}

// A cool, almost invisible counter-light keeps the black masonry from
// collapsing into a single silhouette.
const moon = new THREE.DirectionalLight(0xcbd6e8, 1.8);
moon.position.set(32, 54, 36);
scene.add(moon);

/* -------------------------------------------------------------------------- */
/* Post processing                                                           */
/* -------------------------------------------------------------------------- */

const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
  }),
);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.72,
  0.62,
  0.62,
);
bloom.threshold = Number(params.get("bloomThreshold") ?? 0.82);
bloom.strength = Number(params.get("bloom") ?? 0.55);
bloom.radius = 0.6;
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* -------------------------------------------------------------------------- */
/* HUD                                                                       */
/* -------------------------------------------------------------------------- */

const statMeshes = document.getElementById("stat-meshes");
const statTris = document.getElementById("stat-tris");
const inspectTitle = document.getElementById("inspect-title");
const inspectCopy = document.getElementById("inspect-copy");
const inspectPos = document.getElementById("inspect-pos");
const inspectKind = document.getElementById("inspect-kind");
const inspectHeight = document.getElementById("inspect-height");

if (statMeshes) statMeshes.textContent = model.stats.meshes.toLocaleString("en-US");
if (statTris) statTris.textContent = `${(model.stats.triangles / 1000).toFixed(0)}k`;

const boxHelperMaterial = new THREE.LineBasicMaterial({
  color: 0xff3a1d,
  transparent: true,
  opacity: 0.72,
  toneMapped: false,
});
let selectionBox: THREE.BoxHelper | null = null;

function selectPart(part: import("./scene/architecture").Part): void {
  if (selectionBox) {
    scene.remove(selectionBox);
    selectionBox.geometry.dispose();
    selectionBox = null;
  }
  selectionBox = new THREE.BoxHelper(part.group, 0xff3a1d);
  selectionBox.material = boxHelperMaterial;
  selectionBox.renderOrder = 20;
  scene.add(selectionBox);

  const box = new THREE.Box3().setFromObject(part.group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  if (inspectTitle) inspectTitle.textContent = part.name;
  if (inspectCopy) inspectCopy.textContent = part.description;
  if (inspectPos) inspectPos.textContent = `${center.x.toFixed(1)}, ${center.z.toFixed(1)}`;
  if (inspectKind) inspectKind.textContent = part.kind;
  if (inspectHeight) inspectHeight.textContent = `${size.y.toFixed(1)} m`;
  const inspector = document.getElementById("inspector");
  inspector?.animate(
    [
      { borderColor: "rgba(219,74,43,0.75)" },
      { borderColor: "rgba(166,96,77,0.18)" },
    ],
    { duration: 900, easing: "ease-out" },
  );
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = { x: 0, y: 0 };

canvas.addEventListener("pointerdown", (event) => {
  pointerDown = { x: event.clientX, y: event.clientY };
  if (selectionBox) selectionBox.visible = true;
});

canvas.addEventListener("pointerup", (event) => {
  if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(
    model.parts.map((part) => part.group),
    true,
  );
  if (!hits.length) return;
  let object: THREE.Object3D | null = hits[0].object;
  while (object && !object.userData.partName) object = object.parent;
  if (!object) return;
  const part = model.parts.find((candidate) => candidate.group === object);
  if (part) selectPart(part);
});

/* -------------------------------------------------------------------------- */
/* Camera transitions                                                        */
/* -------------------------------------------------------------------------- */

let cameraTween:
  | {
      start: number;
      duration: number;
      fromPos: THREE.Vector3;
      toPos: THREE.Vector3;
      fromTarget: THREE.Vector3;
      toTarget: THREE.Vector3;
      fromFov: number;
      toFov: number;
    }
  | null = null;

function applyCamera(spec: CameraSpec, immediate = false): void {
  if (immediate) {
    camera.position.set(...spec.position);
    controls.target.set(...spec.target);
    camera.fov = spec.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
    controls.update();
    cameraTween = null;
    return;
  }
  cameraTween = {
    start: performance.now() / 1000,
    duration: 1.45,
    fromPos: camera.position.clone(),
    toPos: new THREE.Vector3(...spec.position),
    fromTarget: controls.target.clone(),
    toTarget: new THREE.Vector3(...spec.target),
    fromFov: camera.fov,
    toFov: spec.fov,
  };
}

const requestedView = params.get("view");
const cameraOverride = params.get("cam")?.split(",").map(Number);
const targetOverride = params.get("look")?.split(",").map(Number);
if (
  cameraOverride?.length === 3 &&
  targetOverride?.length === 3 &&
  [...cameraOverride, ...targetOverride].every(Number.isFinite)
) {
  applyCamera(
    {
      position: cameraOverride as [number, number, number],
      target: targetOverride as [number, number, number],
      fov: Number(params.get("fov") ?? 38),
    },
    true,
  );
} else if (requestedView && CAMERAS[requestedView]) {
  applyCamera(CAMERAS[requestedView], true);
} else if (requestedView === "front" || requestedView === "right" || requestedView === "rear" || requestedView === "left") {
  const angles: Record<string, number> = {
    front: 90,
    right: 0,
    rear: 270,
    left: 180,
  };
  const angle = (angles[requestedView] * Math.PI) / 180;
  applyCamera(
    {
      position: [Math.cos(angle) * 85, 42, Math.sin(angle) * 85 - 6],
      target: [0, 4, -7],
      fov: 40,
    },
    true,
  );
}

const viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-view]"));
viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view ?? "hero";
    viewButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    if (view === "orbit") {
      applyCamera(
        {
          position: [55, 38, 52],
          target: [0, 3, -8],
          fov: 40,
        },
        false,
      );
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.22;
      return;
    }
    controls.autoRotate = false;
    if (CAMERAS[view]) applyCamera(CAMERAS[view], false);
  });
});

/* -------------------------------------------------------------------------- */
/* Explode controls                                                          */
/* -------------------------------------------------------------------------- */

const explodeSlider = document.getElementById("explode") as HTMLInputElement | null;
const explodeButton = document.getElementById("btn-explode");
let exploded = false;
const setExplodeUi = (value: number): void => {
  model.setExplode(value);
  if (explodeSlider) explodeSlider.value = String(value);
  exploded = value > 0.02;
  if (explodeButton) explodeButton.textContent = exploded ? "Assemble" : "Explode";
};

explodeSlider?.addEventListener("input", () => setExplodeUi(Number(explodeSlider.value)));
explodeButton?.addEventListener("click", () => setExplodeUi(exploded ? 0 : 0.72));

document.getElementById("btn-closeup")?.addEventListener("click", () => {
  applyCamera(CAMERAS.detail, false);
});

/* -------------------------------------------------------------------------- */
/* Capture contract                                                          */
/* -------------------------------------------------------------------------- */

const captureApi = {
  setCamera: async (spec: CameraSpec & { position: number[]; target: number[] }) => {
    applyCamera(
      {
        position: spec.position as [number, number, number],
        target: spec.target as [number, number, number],
        fov: spec.fov ?? 40,
      },
      true,
    );
    // Wait for two frames so the capture never receives a stale buffer.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return { ok: true };
  },
  setExplode: (value: number) => {
    setExplodeUi(value);
  },
  setView: (name: string) => {
    const spec = CAMERAS[name];
    if (spec) applyCamera(spec, true);
  },
};

(window as unknown as Record<string, unknown>).__IMG2THREEJS_CAPTURE__ = captureApi;
(window as unknown as Record<string, unknown>).__SCENE__ = scene;
(window as unknown as Record<string, unknown>).__CAMERA__ = camera;
(window as unknown as Record<string, unknown>).__MODEL__ = model;

/* -------------------------------------------------------------------------- */
/* Resize + animation                                                        */
/* -------------------------------------------------------------------------- */

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height);
  composer.setPixelRatio(dpr);
  composer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);

const clock = new THREE.Clock();
let elapsed = 0;
let frame = 0;

function animate(): void {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  elapsed += delta;
  frame += 1;

  if (cameraTween) {
    const t = Math.min((performance.now() / 1000 - cameraTween.start) / cameraTween.duration, 1);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, eased);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
    camera.fov = THREE.MathUtils.lerp(cameraTween.fromFov, cameraTween.toFov, eased);
    camera.updateProjectionMatrix();
    if (t >= 1) cameraTween = null;
  }

  model.update(elapsed, delta);
  controls.update();
  if (selectionBox) selectionBox.update();

  // A very subtle exposure drift gives the lava a slow breathing quality.
  renderer.toneMappingExposure = baseExposure + Math.sin(elapsed * 0.21) * 0.012;

  if (alphaMode) {
    renderer.render(scene, camera);
  } else {
    composer.render();
  }

  if (frame === 2) {
    document.getElementById("loading")?.classList.add("hidden");
    (window as unknown as Record<string, unknown>).__IMG2THREEJS_READY__ = true;
  }
}

animate();

// Warm up shaders before the loading veil lifts.
setTimeout(() => {
  const loading = document.getElementById("loading");
  if (loading && !loading.classList.contains("hidden")) {
    loading.classList.add("hidden");
    (window as unknown as Record<string, unknown>).__IMG2THREEJS_READY__ = true;
  }
}, 6000);
