import * as THREE from "three";
import {
  PALETTE,
  makeBlobShadow,
  makeGroundTextures,
  makeSoilTexture,
  makeTexture,
  remapSideUv,
  remapTopUv,
  roundedRectShape,
} from "./procedural";

export const PLATFORM_SIZE = 20.7846;
export const PLATFORM_DEPTH = 1.3;
export const PLATFORM_RADIUS = 3.6;
export const PLATFORM_TOP = 0.1;

export function uvToWorld(u: number, v: number): { x: number; z: number } {
  return {
    x: (u - 0.5) * PLATFORM_SIZE,
    z: (v - 0.5) * PLATFORM_SIZE,
  };
}

export function worldToUv(x: number, z: number): { u: number; v: number } {
  return {
    u: x / PLATFORM_SIZE + 0.5,
    v: z / PLATFORM_SIZE + 0.5,
  };
}

export interface PondSpec {
  u: number;
  v: number;
  rx: number;
  rz: number;
}

// The pond stays at the same world position while the surrounding meadow grows.
export const POND_WORLD = {
  x: 2.28,
  z: 3.36,
  rx: 1.7,
  rz: 1.25,
};

export const POND: PondSpec = {
  u: POND_WORLD.x / PLATFORM_SIZE + 0.5,
  v: POND_WORLD.z / PLATFORM_SIZE + 0.5,
  rx: POND_WORLD.rx / PLATFORM_SIZE,
  rz: POND_WORLD.rz / PLATFORM_SIZE,
};

export interface Terrain {
  group: THREE.Group;
  bounds: THREE.Box3;
  water: THREE.Mesh;
  update: (time: number, delta: number) => void;
}

function makePondShape(): THREE.Shape {
  const shape = new THREE.Shape();
  const segments = 80;
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    const wobble =
      1 +
      Math.sin(t * 3 + 0.6) * 0.035 +
      Math.sin(t * 5 - 1.1) * 0.022 +
      Math.sin(t * 7 + 2.2) * 0.012;
    const x = Math.cos(t) * POND_WORLD.rx * wobble;
    const y = Math.sin(t) * POND_WORLD.rz * wobble;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function remapPondUv(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return;
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  const width = Math.max(0.0001, box.max.x - box.min.x);
  const depth = Math.max(0.0001, box.max.z - box.min.z);
  for (let i = 0; i < pos.count; i += 1) {
    uv.setXY(
      i,
      (pos.getX(i) - box.min.x) / width,
      (pos.getZ(i) - box.min.z) / depth,
    );
  }
  uv.needsUpdate = true;
}

function makeWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
      uLight: { value: new THREE.Color(PALETTE.water) },
      uFoam: { value: new THREE.Color(PALETTE.cream) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uLight;
      uniform vec3 uFoam;
      varying vec2 vUv;

      void main() {
        vec2 p = vUv - 0.5;
        float edge = length(p * vec2(1.02, 1.22));
        float t = uTime;

        float rippleA = sin((vUv.x * 20.0 + sin(vUv.y * 15.0 + t * 0.7) * 1.2) + t * 1.1);
        float rippleB = sin((vUv.y * 27.0 - vUv.x * 8.0) - t * 0.8);
        float rippleC = sin(length(p) * 48.0 - t * 1.7);
        float shimmer = rippleA * 0.5 + rippleB * 0.3 + rippleC * 0.2;

        vec3 color = mix(uDeep, uLight, 0.58 + shimmer * 0.08);
        color += vec3(0.11, 0.09, 0.04) * smoothstep(0.22, 0.46, edge);
        color = mix(color, uFoam, smoothstep(0.405, 0.49, edge) * 0.52);

        vec3 highlight = vec3(1.0, 0.96, 0.82);
        float glint = smoothstep(0.86, 1.0, sin((vUv.x * 13.0 + vUv.y * 9.0) - t * 0.55) * 0.5 + 0.5);
        color += highlight * glint * 0.055;

        gl_FragColor = vec4(color, 0.9);
      }
    `,
  });
}

export function createTerrain(maxAnisotropy = 8): Terrain {
  const group = new THREE.Group();
  group.name = "PipiTerrain";

  /* ------------------------------------------------------------------ */
  /* Slab body                                                           */
  /* ------------------------------------------------------------------ */

  const shape = roundedRectShape(PLATFORM_SIZE, PLATFORM_SIZE, PLATFORM_RADIUS);
  const pondHolePoints = makePondShape().getPoints(80).reverse();
  const pondHole = new THREE.Path();
  pondHolePoints.forEach((point, index) => {
    const x = point.x + POND_WORLD.x;
    const y = point.y + POND_WORLD.z;
    if (index === 0) pondHole.moveTo(x, y);
    else pondHole.lineTo(x, y);
  });
  pondHole.closePath();
  shape.holes.push(pondHole);
  const slab = new THREE.ExtrudeGeometry(shape, {
    depth: PLATFORM_DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.09,
    bevelSegments: 3,
    curveSegments: 28,
    steps: 1,
  });
  slab.rotateX(Math.PI / 2);
  remapSideUv(slab);

  const soilCanvas = makeSoilTexture(1024, 512);
  const soilMap = makeTexture(soilCanvas);
  soilMap.wrapS = THREE.RepeatWrapping;
  soilMap.wrapT = THREE.ClampToEdgeWrapping;
  soilMap.anisotropy = maxAnisotropy;
  soilMap.needsUpdate = true;

  const soilMaterial = new THREE.MeshStandardMaterial({
    map: soilMap,
    roughness: 0.98,
    metalness: 0,
  });
  const undersideMaterial = new THREE.MeshStandardMaterial({
    color: 0x5d4a39,
    roughness: 1,
  });

  const slabMesh = new THREE.Mesh(slab, [undersideMaterial, soilMaterial, undersideMaterial]);
  slabMesh.receiveShadow = true;
  slabMesh.castShadow = true;
  slabMesh.name = "RoundedPlatformCutFace";
  group.add(slabMesh);

  // A few three-dimensional roots and stones break up the cut face so it does
  // not read as a flat painted band from the default angle.
  const cutDetails = new THREE.Group();
  cutDetails.name = "CutFaceDetails";
  const rootMaterial = new THREE.MeshStandardMaterial({
    color: 0x3c281a,
    roughness: 0.96,
  });
  const pebbleMaterial = new THREE.MeshStandardMaterial({
    color: 0x9b8d78,
    roughness: 0.92,
    flatShading: true,
  });
  const rootAnchors: Array<[number, number, number, number]> = [
    [-7.8, 10.49, 0.2, 0.65],
    [-3.9, 10.49, 0.16, 0.88],
    [0, 10.49, 0.22, 0.58],
    [3.9, 10.49, 0.18, 0.78],
    [7.8, 10.49, 0.2, 0.66],
    [10.49, -4.2, 0.18, 0.62],
    [10.49, 0, 0.2, 0.74],
    [10.49, 4.2, 0.18, 0.7],
  ];
  for (const [x, z, topY, length] of rootAnchors) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, topY, z),
      new THREE.Vector3(x + 0.05, topY - length * 0.38, z + 0.01),
      new THREE.Vector3(x - 0.04, topY - length * 0.72, z + 0.015),
      new THREE.Vector3(x + 0.03, topY - length, z + 0.02),
    ]);
    const tube = new THREE.TubeGeometry(curve, 10, 0.022, 5, false);
    const root = new THREE.Mesh(tube, rootMaterial);
    root.castShadow = true;
    cutDetails.add(root);
  }
  const pebbleGeo = new THREE.DodecahedronGeometry(0.085, 0);
  for (let i = 0; i < 10; i += 1) {
    const front = i < 6;
    const x = front ? -8.5 + i * 3.4 : 10.47;
    const z = front ? 10.47 : -5.5 + (i - 6) * 3.0;
    const pebble = new THREE.Mesh(pebbleGeo, pebbleMaterial);
    pebble.position.set(
      x + (front ? 0 : 0.02),
      -0.35 - (i % 4) * 0.16,
      z + (front ? 0.02 : 0),
    );
    pebble.scale.set(1 + (i % 3) * 0.25, 0.55 + (i % 2) * 0.15, 0.8);
    pebble.rotation.set(i * 0.7, i * 1.1, i * 0.4);
    pebble.castShadow = true;
    cutDetails.add(pebble);
  }

  // Dark strata seams wrap the cut face, keeping the layers readable at a glance.
  const perimeter = shape.getPoints(96).map((point) => point.clone());
  const seamMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a291c,
    roughness: 0.98,
  });
  for (const seamY of [-0.24, -0.56, -0.9]) {
    const points = perimeter.map(
      (point) =>
        new THREE.Vector3(
          point.x * 1.006,
          seamY,
          point.y * 1.006,
        ),
    );
    const curve = new THREE.CatmullRomCurve3(points, true);
    const seam = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 128, 0.009, 4, true),
      seamMaterial,
    );
    cutDetails.add(seam);
  }

  group.add(cutDetails);

  /* ------------------------------------------------------------------ */
  /* Top mossy surface                                                   */
  /* ------------------------------------------------------------------ */

  // The ground skin is a separate, upward-facing cap. A second shape is used so
  // its pond hole lands on +Z after the -90 degree rotation.
  const topShape = roundedRectShape(PLATFORM_SIZE, PLATFORM_SIZE, PLATFORM_RADIUS);
  const topHolePoints = makePondShape().getPoints(80).reverse();
  const topHole = new THREE.Path();
  topHolePoints.forEach((point, index) => {
    const x = point.x + POND_WORLD.x;
    const y = point.y - POND_WORLD.z;
    if (index === 0) topHole.moveTo(x, y);
    else topHole.lineTo(x, y);
  });
  topHole.closePath();
  topShape.holes.push(topHole);
  const groundGeometry = new THREE.ShapeGeometry(topShape, 48);
  groundGeometry.rotateX(-Math.PI / 2);
  remapTopUv(groundGeometry, PLATFORM_SIZE, PLATFORM_SIZE);

  const ground = makeGroundTextures(2048);
  const groundMap = makeTexture(ground.color);
  groundMap.anisotropy = maxAnisotropy;
  const bumpMap = makeTexture(ground.height, THREE.NoColorSpace);
  bumpMap.anisotropy = maxAnisotropy;

  const groundMaterial = new THREE.MeshStandardMaterial({
    map: groundMap,
    bumpMap,
    bumpScale: 0.022,
    roughness: 0.97,
    metalness: 0,
    color: 0xffffff,
  });
  const top = new THREE.Mesh(groundGeometry, groundMaterial);
  top.position.y = PLATFORM_TOP;
  top.receiveShadow = true;
  top.name = "MossyGround";
  group.add(top);

  /* ------------------------------------------------------------------ */
  /* Pond                                                                */
  /* ------------------------------------------------------------------ */

  const pondShape = makePondShape();
  const basinGeometry = new THREE.ShapeGeometry(pondShape, 48);
  basinGeometry.rotateX(Math.PI / 2);
  const basinMaterial = new THREE.MeshStandardMaterial({
    color: 0x315c5a,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const basin = new THREE.Mesh(basinGeometry, basinMaterial);
  basin.position.set(POND_WORLD.x, 0.088, POND_WORLD.z);
  basin.scale.set(1.05, 1, 1.05);
  basin.receiveShadow = true;
  group.add(basin);

  const waterGeometry = new THREE.ShapeGeometry(pondShape, 64);
  waterGeometry.rotateX(Math.PI / 2);
  remapPondUv(waterGeometry);
  const water = new THREE.Mesh(waterGeometry, makeWaterMaterial());
  water.position.set(POND_WORLD.x, 0.112, POND_WORLD.z);
  water.renderOrder = 3;
  water.name = "PondWater";
  group.add(water);

  const rimGeometry = new THREE.DodecahedronGeometry(0.16, 0);
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: 0x9b8d78,
    roughness: 0.92,
    flatShading: true,
  });
  const rim = new THREE.InstancedMesh(rimGeometry, rimMaterial, 22);
  const dummy = new THREE.Object3D();
  const rimColor = new THREE.Color();
  for (let i = 0; i < 22; i += 1) {
    const t = (i / 22) * Math.PI * 2 + 0.06;
    const wobble = 1 + Math.sin(t * 3 + 0.6) * 0.035 + Math.sin(t * 5 - 1.1) * 0.022;
    const x = POND_WORLD.x + Math.cos(t) * POND_WORLD.rx * wobble * 1.02;
    const z = POND_WORLD.z + Math.sin(t) * POND_WORLD.rz * wobble * 1.02;
    dummy.position.set(x, 0.13 + (i % 3) * 0.012, z);
    dummy.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    dummy.scale.setScalar(0.55 + (i % 5) * 0.12);
    dummy.updateMatrix();
    rim.setMatrixAt(i, dummy.matrix);
    rimColor.set(PALETTE.rock[i % PALETTE.rock.length]!);
    rimColor.offsetHSL(0, -0.02, (i % 4) * 0.015 - 0.02);
    rim.setColorAt(i, rimColor);
  }
  rim.receiveShadow = true;
  rim.castShadow = true;
  group.add(rim);

  /* ------------------------------------------------------------------ */
  /* Water ripple rings                                                  */
  /* ------------------------------------------------------------------ */

  const ripples: Array<{ mesh: THREE.Mesh; phase: number; speed: number }> = [];
  const ringGeometry = new THREE.RingGeometry(0.92, 1, 56);
  for (let i = 0; i < 7; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? 0xfff4d8 : 0xd8f1e7,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(
      POND_WORLD.x + Math.cos(i * 2.1) * POND_WORLD.rx * 0.2,
      0.122 + i * 0.001,
      POND_WORLD.z + Math.sin(i * 2.1) * POND_WORLD.rz * 0.2,
    );
    mesh.scale.set(POND_WORLD.rx * 0.32, POND_WORLD.rz * 0.32, 1);
    mesh.renderOrder = 4;
    group.add(mesh);
    ripples.push({ mesh, phase: i * 0.97, speed: 0.13 + i * 0.007 });
  }

  /* ------------------------------------------------------------------ */
  /* Floating shadow on the paper                                        */
  /* ------------------------------------------------------------------ */

  const paperShadow = makeBlobShadow(32, 26, 0.34, 0x35251c);
  paperShadow.position.y = -1.47;
  paperShadow.scale.set(1, 1, 1);
  group.add(paperShadow);

  const tightShadow = makeBlobShadow(22, 18, 0.2, 0x2f2119);
  tightShadow.position.y = -1.455;
  group.add(tightShadow);

  const bounds = new THREE.Box3(
    new THREE.Vector3(-10.6, -1.55, -10.6),
    new THREE.Vector3(10.6, 7.25, 10.6),
  );

  const update = (time: number): void => {
    (water.material as THREE.ShaderMaterial).uniforms.uTime!.value = time;
    for (const ripple of ripples) {
      const phase = (time * ripple.speed + ripple.phase) % 1;
      const s = 0.22 + phase * 0.72;
      ripple.mesh.scale.set(POND_WORLD.rx * s, POND_WORLD.rz * s, 1);
      (ripple.mesh.material as THREE.MeshBasicMaterial).opacity =
        Math.sin(phase * Math.PI) * 0.22;
    }
  };

  return { group, bounds, water, update };
}
