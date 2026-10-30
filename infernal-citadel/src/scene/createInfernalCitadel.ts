import * as THREE from "three";
import { createArchitecture, type Part } from "./architecture";
import { createEffects } from "./effects";
import { createProps } from "./props";
import { createMaterialLibrary, makeRuneTexture, setShadow } from "./procedural";

export interface CameraSpec {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface InfernalCitadel {
  root: THREE.Group;
  parts: Part[];
  update: (elapsed: number, delta: number) => void;
  setExplode: (amount: number) => void;
  cameras: Record<string, CameraSpec>;
  stats: { meshes: number; triangles: number; flames: number; lights: number };
  focus: { ritual: THREE.Vector3; nave: THREE.Vector3 };
}

export const CAMERAS: Record<string, CameraSpec> = {
  hero: {
    // 45° pitch + 45° yaw: horizontal distance to target equals height.
    // Exact reference setup: straight X=0, Y:Z = 1:1, no Y-axis rotation.
    position: [0, 20, 20],
    target: [0, 0, 0],
    fov: 48,
  },
  aerial: {
    position: [0.5, 88, 46],
    target: [0, 2.0, -7],
    fov: 38,
  },
  nave: {
    position: [0.1, 14.5, 43],
    target: [0, 6.5, -25],
    fov: 48,
  },
  orbit: {
    position: [51, 39, 52],
    target: [0, 3.0, -8],
    fov: 40,
  },
  detail: {
    position: [0.8, 21.5, -2.0],
    target: [0, 8.0, -34],
    fov: 35,
  },
};

export function createInfernalCitadel(renderer: THREE.WebGLRenderer): InfernalCitadel {
  const root = new THREE.Group();
  root.name = "InfernalCitadelModel";

  const lib = createMaterialLibrary(renderer);
  const architecture = createArchitecture(lib);
  const effects = createEffects(architecture, lib);
  const props = createProps(architecture, lib);

  root.add(architecture.root);
  root.add(props.root);
  root.add(effects.root);

  /* ------------------------------------------------------------------ */
  /* Lighting                                                           */
  /* ------------------------------------------------------------------ */

  const lighting = new THREE.Group();
  lighting.name = "Lighting";

  const ambient = new THREE.AmbientLight(0x6b7c94, 1.8);
  lighting.add(ambient);

  const hemisphere = new THREE.HemisphereLight(0x617088, 0x181624, 2.0);
  lighting.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffdbc8, 3.0);
  key.position.set(10, 20, 10);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 125;
  key.shadow.camera.left = -56;
  key.shadow.camera.right = 56;
  key.shadow.camera.top = 58;
  key.shadow.camera.bottom = -52;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.045;
  key.shadow.radius = 3;
  lighting.add(key);
  lighting.add(key.target);

  // Low warm fill from the viewer side keeps the near faces readable while
  // preserving the deep silhouette language of the reference.
  const viewerFill = new THREE.DirectionalLight(0xc8d3e4, 1.2);
  viewerFill.position.set(0, 16, 68);
  viewerFill.target.position.set(0, 4, -6);
  lighting.add(viewerFill);
  lighting.add(viewerFill.target);

  const rim = new THREE.DirectionalLight(0xc24a39, 1.55);
  rim.position.set(-34, 24, -44);
  rim.target.position.set(0, 6, 0);
  lighting.add(rim);
  lighting.add(rim.target);

  const under = new THREE.DirectionalLight(0xff2b0d, 1.0);
  under.position.set(0, -8, 6);
  under.target.position.set(0, 7, -18);
  lighting.add(under);
  lighting.add(under.target);

  const portalLight = new THREE.PointLight(0xff2b0b, 260, 30, 2);
  portalLight.position.set(0, 12.5, -35.5);
  lighting.add(portalLight);

  const naveLight = new THREE.PointLight(0xff3b12, 150, 14, 2);
  naveLight.position.set(0, 7, 4);
  lighting.add(naveLight);

  const westLight = new THREE.PointLight(0xff4b16, 125, 13, 2);
  westLight.position.set(-17, 4.5, 8);
  lighting.add(westLight);

  const eastLight = new THREE.PointLight(0xff4212, 125, 13, 2);
  eastLight.position.set(19, 5, 4);
  lighting.add(eastLight);

  // A low ember lamp under the great western chain.
  const chainLight = new THREE.PointLight(0xff4a18, 120, 12, 2);
  chainLight.position.set(-33.5, 8.0, -15.0);
  lighting.add(chainLight);

  root.add(lighting);

  /* ------------------------------------------------------------------ */
  /* Rune inlays and wall marks                                         */
  /* ------------------------------------------------------------------ */

  const crossTexture = makeRuneTexture("cross");
  const circleTexture = makeRuneTexture("circle");
  const inlays = new THREE.Group();
  inlays.name = "RuneInlays";

  const inlay = (
    map: THREE.Texture,
    x: number,
    y: number,
    z: number,
    size: number,
    opacity = 0.52,
    rotation = 0,
  ): void => {
    const material = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rotation;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 4;
    inlays.add(mesh);
  };

  inlay(circleTexture, -17.8, 1.14, 8.2, 8.6, 0.28, 0.2);
  inlay(circleTexture, 19.2, 1.24, 3.4, 7.4, 0.22, -0.5);
  inlay(circleTexture, -27.5, 1.82, 16.0, 5.2, 0.2, 0.8);
  inlay(crossTexture, 21.8, 5.31, -35.6, 4.6, 0.18, 0.0);
  inlay(circleTexture, -2.0, 30.5, 30.8, 4.0, 0.12, 0.0);

  // Vertical sigils on walls, catchable from the reference camera.
  const wallSigil = (
    x: number,
    y: number,
    z: number,
    size: number,
    rotationY: number,
    opacity = 0.55,
  ): void => {
    const material = new THREE.MeshBasicMaterial({
      map: crossTexture,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 1.6), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    mesh.renderOrder = 4;
    inlays.add(mesh);
  };

  wallSigil(-28.55, 4.8, 12.8, 1.3, Math.PI / 2, 0.62);
  wallSigil(28.15, 5.2, 5.0, 1.2, -Math.PI / 2, 0.55);
  wallSigil(-7.45, 3.1, 2.0, 0.9, -Math.PI / 2, 0.45);
  wallSigil(7.45, 3.0, -3.0, 0.9, Math.PI / 2, 0.45);
  wallSigil(0, 11.4, -43.15, 1.5, 0, 0.5);
  wallSigil(-33.75, 8.2, 2.5, 2.1, Math.PI / 2, 0.72);
  wallSigil(33.75, 8.8, 6.2, 2.3, -Math.PI / 2, 0.72);
  root.add(inlays);

  /* ------------------------------------------------------------------ */
  /* Soft contact pools                                                 */
  /* ------------------------------------------------------------------ */

  const contactPool = new THREE.Group();
  contactPool.name = "ContactPools";
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  });
  const poolPositions: Array<[number, number, number, number]> = [
    [-7.6, 4.2, 23.2, 5.0],
    [7.6, 4.2, 23.2, 5.0],
    [-10.4, 5.25, -29.4, 5.4],
    [10.4, 5.25, -29.4, 5.4],
    [-31.0, 17.3, 27.6, 7.5],
    [-32.4, 14.3, -17.2, 8.4],
    [-17.8, 1.08, 8.0, 18.0],
    [19.2, 1.2, 3.0, 19.0],
  ];
  for (const [x, y, z, size] of poolPositions) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), poolMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.012, z);
    mesh.renderOrder = 1;
    contactPool.add(mesh);
  }
  root.add(contactPool);

  setShadow(root, true, true);

  /* ------------------------------------------------------------------ */
  /* Explode and update                                                 */
  /* ------------------------------------------------------------------ */

  let explodeCurrent = 0;
  let explodeTarget = 0;

  const setExplode = (amount: number): void => {
    explodeTarget = THREE.MathUtils.clamp(amount, 0, 1);
  };

  const update = (elapsed: number, delta: number): void => {
    effects.update(elapsed);
    props.update(elapsed);

    explodeCurrent = THREE.MathUtils.damp(explodeCurrent, explodeTarget, 5.2, delta);
    architecture.parts.forEach((part) => {
      const base = part.group.userData.basePosition as THREE.Vector3;
      part.group.position.copy(base).addScaledVector(part.explodeDir, explodeCurrent);
      part.group.position.y += Math.abs(part.explodeDir.y) * explodeCurrent * 0.5;
    });

    portalLight.intensity = 330 + Math.sin(elapsed * 1.7) * 36 + Math.sin(elapsed * 7.1) * 10;
    naveLight.intensity = 190 + Math.sin(elapsed * 2.3) * 16;
    westLight.intensity = 168 + Math.sin(elapsed * 1.8 + 1.2) * 16;
    eastLight.intensity = 170 + Math.sin(elapsed * 2.1 + 2.4) * 16;

    // Very slow scene breathing keeps the still readable while alive.
    key.intensity = 2.98 + Math.sin(elapsed * 0.35) * 0.07;
    ambient.intensity = 1.78 + Math.sin(elapsed * 0.52) * 0.03;
  };

  root.updateMatrixWorld(true);
  let meshes = 0;
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    const geo = object.geometry;
    const count = geo.index ? geo.index.count : geo.attributes.position?.count ?? 0;
    triangles += (count / 3) * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });

  return {
    root,
    parts: architecture.parts,
    update,
    setExplode,
    cameras: CAMERAS,
    stats: {
      meshes,
      triangles: Math.round(triangles),
      flames: props.flameCount,
      lights: lighting.children.filter((c) => c instanceof THREE.Light).length,
    },
    focus: {
      ritual: architecture.pentagramAnchor.clone(),
      nave: new THREE.Vector3(0, 4, 6),
    },
  };
}
