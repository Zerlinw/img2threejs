import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  PALETTE,
  clamp,
  makeBlobShadow,
  makeLeafGeometry,
  makeSignTexture,
  makeTexture,
  makeWoodTexture,
  mulberry32,
  pick,
  range,
  setVertexColor,
  stripGeometry,
} from "./procedural";
import { PLATFORM_TOP, POND_WORLD, PLATFORM_SIZE, PLATFORM_RADIUS, uvToWorld } from "./terrain";

export interface ObstacleCircle {
  x: number;
  z: number;
  r: number;
  kind: string;
}

export interface Props {
  group: THREE.Group;
  obstacles: ObstacleCircle[];
  top: number;
  framePoints: THREE.Vector3[];
  update: (time: number, delta: number) => void;
}

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function insidePlatformArea(x: number, z: number, margin = 0.12): boolean {
  const half = PLATFORM_SIZE * 0.5;
  const qx = Math.abs(x) - half + PLATFORM_RADIUS;
  const qz = Math.abs(z) - half + PLATFORM_RADIUS;
  const sdf =
    Math.min(Math.max(qx, qz), 0) +
    Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) -
    PLATFORM_RADIUS;
  return sdf <= -margin;
}

function transform(
  geometry: THREE.BufferGeometry,
  position: THREE.Vector3,
  rotation: THREE.Euler,
  scale: THREE.Vector3,
  color: THREE.ColorRepresentation,
): THREE.BufferGeometry {
  const geo = geometry.toNonIndexed();
  _q.setFromEuler(rotation);
  _m.compose(position, _q, scale);
  geo.applyMatrix4(_m);
  stripGeometry(geo);
  setVertexColor(geo, color);
  return geo;
}

function transformed(
  geometry: THREE.BufferGeometry,
  px: number,
  py: number,
  pz: number,
  rx: number,
  ry: number,
  rz: number,
  sx: number,
  sy: number,
  sz: number,
  color: THREE.ColorRepresentation,
): THREE.BufferGeometry {
  return transform(
    geometry,
    new THREE.Vector3(px, py, pz),
    new THREE.Euler(rx, ry, rz),
    new THREE.Vector3(sx, sy, sz),
    color,
  );
}

function cylinderBetween(
  a: THREE.Vector3,
  b: THREE.Vector3,
  rBottom: number,
  rTop: number,
  color: THREE.ColorRepresentation,
  radialSegments = 8,
): THREE.BufferGeometry {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = Math.max(0.0001, direction.length());
  const geo = new THREE.CylinderGeometry(rTop, rBottom, length, radialSegments, 1, false).toNonIndexed();
  geo.translate(0, length / 2, 0);
  _q.setFromUnitVectors(UP, direction.normalize());
  _m.compose(a, _q, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(_m);
  stripGeometry(geo);
  setVertexColor(geo, color);
  return geo;
}

function addMerged(
  parent: THREE.Object3D,
  geos: THREE.BufferGeometry[],
  material: THREE.Material,
  name: string,
  castShadow = true,
): THREE.Mesh | null {
  if (geos.length === 0) return null;
  const merged = mergeGeometries(geos, false);
  if (!merged) return null;
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function foliageMaterial(side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side,
  });
}

/* -------------------------------------------------------------------------- */
/* Bamboo                                                                     */
/* -------------------------------------------------------------------------- */

function addBambooCluster(
  stalkGeos: THREE.BufferGeometry[],
  leafGeos: THREE.BufferGeometry[],
  centerX: number,
  centerZ: number,
  seed: number,
  baseCount = 4,
  heightScale = 1,
): number {
  const rand = mulberry32(seed);
  const leafGeo = makeLeafGeometry(0.44, 0.125);
  const leafPuffGeo = new THREE.SphereGeometry(1, 7, 5);
  let maxY = 0;
  const count = baseCount + 1 + (rand() > 0.45 ? 1 : 0);

  for (let i = 0; i < count; i += 1) {
    const baseX = centerX + range(rand, -0.36, 0.36);
    const baseZ = centerZ + range(rand, -0.34, 0.34);
    const height = range(rand, 3.7, 6.0) * heightScale;
    const baseRadius = range(rand, 0.052, 0.078);
    const segments = 7;
    const leanX = range(rand, -0.18, 0.18);
    const leanZ = range(rand, -0.18, 0.18);
    const bend = range(rand, 0.02, 0.11);

    const points: THREE.Vector3[] = [];
    for (let s = 0; s <= segments; s += 1) {
      const t = s / segments;
      const sway = Math.sin(t * Math.PI) * bend;
      points.push(
        new THREE.Vector3(
          baseX + leanX * t + sway,
          PLATFORM_TOP + t * height,
          baseZ + leanZ * t - sway * 0.4,
        ),
      );
    }

    for (let s = 0; s < segments; s += 1) {
      const t = s / segments;
      const r0 = baseRadius * (1 - t * 0.62);
      const r1 = baseRadius * (1 - (t + 1 / segments) * 0.62);
      const color = new THREE.Color(PALETTE.bamboo[s % PALETTE.bamboo.length]!);
      color.offsetHSL(0, 0, (s / segments) * 0.07);
      stalkGeos.push(cylinderBetween(points[s]!, points[s + 1]!, r0, r1, color));
    }

    for (let s = 1; s < segments; s += 1) {
      const t = s / segments;
      const p = points[s]!;
      const radius = baseRadius * (1 - t * 0.62) + 0.013;
      const ring = new THREE.TorusGeometry(radius, 0.012, 5, 10);
      stalkGeos.push(
        transformed(ring, p.x, p.y, p.z, Math.PI / 2, 0, 0, 1, 1, 1, "#647d3a"),
      );
    }

    const tip = new THREE.ConeGeometry(baseRadius * 0.45, 0.22, 7);
    const top = points[points.length - 1]!;
    stalkGeos.push(
      transformed(
        tip,
        top.x,
        top.y + 0.11,
        top.z,
        0,
        0,
        0,
        1,
        1,
        1,
        "#8aa14d",
      ),
    );

    // Branches and leaf fans near the top.
    const branchStarts = [0.6, 0.7, 0.79, 0.87, 0.94];
    branchStarts.forEach((bt, bi) => {
      const pointIndex = Math.min(segments, Math.floor(bt * segments));
      const start = points[pointIndex]!;
      const angle = range(rand, 0, Math.PI * 2) + bi * 1.8;
      const length = range(rand, 0.32, 0.78) * heightScale;
      const end = new THREE.Vector3(
        start.x + Math.cos(angle) * length,
        start.y + range(rand, 0.02, 0.32),
        start.z + Math.sin(angle) * length,
      );
      stalkGeos.push(
        cylinderBetween(start, end, 0.014, 0.007, "#6e8941", 6),
      );
      const leaves = 8 + Math.floor(rand() * 6);
      const puffCount = 3 + Math.floor(rand() * 3);
      for (let p = 0; p < puffCount; p += 1) {
        const pa = angle + range(rand, -0.9, 0.9);
        const pr = range(rand, 0.05, 0.32);
        leafGeos.push(
          transformed(
            leafPuffGeo,
            end.x + Math.cos(pa) * pr,
            end.y + range(rand, -0.04, 0.3),
            end.z + Math.sin(pa) * pr,
            0,
            rand() * Math.PI,
            0,
            range(rand, 0.07, 0.16),
            range(rand, 0.05, 0.12),
            range(rand, 0.07, 0.16),
            pick(rand, PALETTE.leaf),
          ),
        );
      }
      for (let l = 0; l < leaves; l += 1) {
        const a = angle + range(rand, -0.75, 0.75);
        const spread = range(rand, 0.04, 0.42);
        const ly = end.y + range(rand, -0.14, 0.26);
        const lx = end.x + Math.cos(a) * spread;
        const lz = end.z + Math.sin(a) * spread;
        const leafColor = new THREE.Color(PALETTE.leaf[l % PALETTE.leaf.length]!);
        leafColor.offsetHSL(range(rand, -0.02, 0.02), 0, range(rand, -0.04, 0.06));
        leafGeos.push(
          transformed(
            leafGeo,
            lx,
            ly,
            lz,
            range(rand, -0.8, 0.8),
            a + range(rand, -0.6, 0.6),
            range(rand, -0.7, 0.7),
            range(rand, 0.65, 1.35),
            range(rand, 0.72, 1.25),
            1,
            leafColor,
          ),
        );
      }
    });

    // A leafy crown so the tip always reads as complete.
    for (let l = 0; l < 8; l += 1) {
      const a = (l / 8) * Math.PI * 2 + rand();
      const radius = range(rand, 0.05, 0.32);
      leafGeos.push(
        transformed(
          leafPuffGeo,
          top.x + Math.cos(a) * radius,
          top.y + range(rand, -0.02, 0.34),
          top.z + Math.sin(a) * radius,
          0,
          rand() * Math.PI,
          0,
          range(rand, 0.08, 0.18),
          range(rand, 0.06, 0.13),
          range(rand, 0.08, 0.18),
          pick(rand, PALETTE.leaf),
        ),
      );
    }
    for (let l = 0; l < 16; l += 1) {
      const a = (l / 16) * Math.PI * 2 + rand();
      const radius = range(rand, 0.12, 0.48);
      leafGeos.push(
        transformed(
          leafGeo,
          top.x + Math.cos(a) * radius,
          top.y + range(rand, -0.05, 0.45),
          top.z + Math.sin(a) * radius,
          range(rand, -1.1, 1.1),
          a,
          range(rand, -0.9, 0.9),
          range(rand, 0.75, 1.35),
          range(rand, 0.8, 1.35),
          1,
          pick(rand, PALETTE.leaf),
        ),
      );
    }

    maxY = Math.max(maxY, top.y + 0.55);
  }

  return maxY;
}

function addBambooShoots(shootGeos: THREE.BufferGeometry[], seed: number): void {
  const rand = mulberry32(seed);
  const spots: Array<[number, number]> = [
    [-4.55, -2.1],
    [-4.15, -2.55],
    [4.2, -2.1],
    [4.55, 0.45],
    [2.65, 2.55],
    [-2.25, -3.2],
    [-4.7, 1.1],
    [4.75, 1.6],
    // Outer-ring shoots.
    [-8.4, 0.2],
    [-7.6, -2.4],
    [8.0, -6.1],
    [8.3, 4.6],
    [-5.2, 7.9],
    [5.1, 8.1],
  ];
  for (const [x, z] of spots) {
    const h = range(rand, 0.26, 0.48);
    const segments = 3;
    for (let i = 0; i < segments; i += 1) {
      const t = i / segments;
      const radius = 0.085 * (1 - t * 0.55);
      const layer = new THREE.ConeGeometry(radius, h / segments * 1.35, 6);
      shootGeos.push(
        transformed(
          layer,
          x + range(rand, -0.03, 0.03),
          PLATFORM_TOP + t * h + h / segments * 0.5,
          z + range(rand, -0.03, 0.03),
          range(rand, -0.1, 0.1),
          range(rand, 0, Math.PI * 2),
          range(rand, -0.12, 0.12),
          1,
          1,
          1,
          i === segments - 1 ? "#8aa34e" : pick(rand, ["#8a6a42", "#765634", "#9c7d50"]),
        ),
      );
    }
    const leaf = new THREE.ConeGeometry(0.07, 0.24, 4);
    shootGeos.push(
      transformed(
        leaf,
        x,
        PLATFORM_TOP + h + 0.08,
        z,
        range(rand, -0.4, 0.4),
        rand() * Math.PI,
        range(rand, -0.3, 0.3),
        1,
        1,
        1,
        "#9fb75b",
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Sakura                                                                     */
/* -------------------------------------------------------------------------- */

function addSakura(
  trunkGeos: THREE.BufferGeometry[],
  canopyGeos: THREE.BufferGeometry[],
  blossomGeos: THREE.BufferGeometry[],
  x: number,
  z: number,
  seed: number,
): number {
  const rand = mulberry32(seed);
  const base = new THREE.Vector3(x, PLATFORM_TOP, z);
  const top = new THREE.Vector3(x + 0.26, PLATFORM_TOP + 3.45, z - 0.12);
  const topY = top.y;

  trunkGeos.push(cylinderBetween(base, top, 0.4, 0.17, "#684633", 10));
  for (let i = 0; i < 4; i += 1) {
    const rootAngle = (i / 4) * Math.PI * 2 + 0.4;
    const rootEnd = new THREE.Vector3(
      x + Math.cos(rootAngle) * range(rand, 0.3, 0.58),
      PLATFORM_TOP + range(rand, 0.25, 0.55),
      z + Math.sin(rootAngle) * range(rand, 0.3, 0.58),
    );
    trunkGeos.push(cylinderBetween(base, rootEnd, 0.14, 0.055, "#5e3f2f", 7));
  }

  const branchEnds: THREE.Vector3[] = [];
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2 + range(rand, -0.5, 0.5);
    const length = range(rand, 0.8, 1.85);
    const end = new THREE.Vector3(
      top.x + Math.cos(angle) * length,
      top.y + range(rand, -0.2, 1.15),
      top.z + Math.sin(angle) * length * 0.8,
    );
    const start = new THREE.Vector3(
      top.x,
      top.y - range(rand, 0.2, 1.6),
      top.z,
    );
    trunkGeos.push(cylinderBetween(start, end, 0.11, 0.05, "#70503b", 7));
    branchEnds.push(end);
  }

  const puffGeo = new THREE.SphereGeometry(1, 12, 9);
  const centers: THREE.Vector3[] = [];
  for (let i = 0; i < 24; i += 1) {
    const anchor = branchEnds[i % branchEnds.length]!;
    const angle = rand() * Math.PI * 2;
    const radius = range(rand, 0.24, 1.08);
    const center = new THREE.Vector3(
      anchor.x + Math.cos(angle) * radius,
      anchor.y + range(rand, -0.5, 0.58),
      anchor.z + Math.sin(angle) * radius * 0.85,
    );
    centers.push(center);
    const size = range(rand, 0.38, 0.82);
    const puffColor = new THREE.Color(pick(rand, PALETTE.sakura));
    if (center.y < topY + 0.2) puffColor.offsetHSL(0, 0.02, -0.06);
    canopyGeos.push(
      transformed(
        puffGeo,
        center.x,
        center.y,
        center.z,
        0,
        rand() * Math.PI,
        0,
        size,
        size * range(rand, 0.7, 0.98),
        size * range(rand, 0.8, 1.12),
        puffColor,
      ),
    );
  }

  // Small blossom dots around the silhouette.
  const blossomGeo = new THREE.SphereGeometry(1, 6, 5);
  for (let i = 0; i < 170; i += 1) {
    const center = centers[Math.floor(rand() * centers.length)]!;
    const angle = rand() * Math.PI * 2;
    const radius = range(rand, 0.4, 1.15);
    blossomGeos.push(
      transformed(
        blossomGeo,
        center.x + Math.cos(angle) * radius,
        center.y + range(rand, -0.55, 0.55),
        center.z + Math.sin(angle) * radius,
        0,
        0,
        0,
        range(rand, 0.035, 0.085),
        range(rand, 0.03, 0.07),
        range(rand, 0.035, 0.085),
        pick(rand, ["#f8d6df", "#f9e4e9", "#efb2c3", "#fff0e8"]),
      ),
    );
  }

  // Fallen petals around the base.
  for (let i = 0; i < 38; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = range(rand, 0.4, 2.2);
    blossomGeos.push(
      transformed(
        blossomGeo,
        x + Math.cos(a) * r,
        PLATFORM_TOP + 0.025,
        z + Math.sin(a) * r,
        0,
        rand() * Math.PI,
        0,
        range(rand, 0.035, 0.075),
        0.02,
        range(rand, 0.025, 0.055),
        pick(rand, ["#f3bac9", "#f6d4dd", "#eaa6ba"]),
      ),
    );
  }

  return top.y + 2.65;
}

/* -------------------------------------------------------------------------- */
/* Sign, lantern                                                              */
/* -------------------------------------------------------------------------- */

function addSign(
  parent: THREE.Group,
  x: number,
  z: number,
  woodMap: THREE.CanvasTexture,
): void {
  const group = new THREE.Group();
  group.position.set(x, PLATFORM_TOP, z);
  group.rotation.y = 0.58;
  group.name = "WoodenSign";

  const wood = new THREE.MeshStandardMaterial({
    map: woodMap,
    color: 0xcfa878,
    roughness: 0.9,
  });
  const woodDark = new THREE.MeshStandardMaterial({
    color: 0x67462c,
    roughness: 0.95,
  });

  for (const px of [-0.72, 0.72]) {
    const post = new THREE.Mesh(
      new RoundedBoxGeometry(0.14, 1.08, 0.14, 3, 0.035),
      woodDark,
    );
    post.position.set(px, 0.54, 0);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);
  }

  const board = new THREE.Mesh(
    new RoundedBoxGeometry(2.15, 1.0, 0.15, 4, 0.06),
    wood,
  );
  board.position.set(0, 1.05, 0);
  board.castShadow = true;
  board.receiveShadow = true;
  group.add(board);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.84),
    new THREE.MeshStandardMaterial({
      color: 0xf4e4c8,
      roughness: 0.93,
      side: THREE.DoubleSide,
    }),
  );
  face.position.set(0, 1.05, 0.081);
  group.add(face);

  const textTexture = makeTexture(makeSignTexture());
  const text = new THREE.Mesh(
    new THREE.PlaneGeometry(1.86, 0.93),
    new THREE.MeshBasicMaterial({
      map: textTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    }),
  );
  text.position.set(0, 1.05, 0.088);
  text.renderOrder = 6;
  group.add(text);

  const topBeam = new THREE.Mesh(
    new RoundedBoxGeometry(2.34, 0.14, 0.22, 3, 0.05),
    woodDark,
  );
  topBeam.position.set(0, 1.61, 0);
  topBeam.castShadow = true;
  group.add(topBeam);

  // A tiny mossy foot.
  const moss = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 10, 6),
    new THREE.MeshStandardMaterial({ color: 0x78945a, roughness: 1 }),
  );
  moss.scale.set(1.25, 0.08, 0.55);
  moss.position.set(0, 0.02, 0);
  moss.receiveShadow = true;
  group.add(moss);

  const shadow = makeBlobShadow(2.3, 1.2, 0.26, 0x3a291d);
  shadow.position.set(0, 0.012, 0);
  group.add(shadow);

  parent.add(group);
}

function addGardenGate(
  parent: THREE.Group,
  x: number,
  z: number,
  woodMap: THREE.CanvasTexture,
): void {
  const group = new THREE.Group();
  group.position.set(x, PLATFORM_TOP, z);
  group.name = "GardenGate";

  const wood = new THREE.MeshStandardMaterial({
    map: woodMap,
    color: 0xb98758,
    roughness: 0.93,
  });
  const woodDark = new THREE.MeshStandardMaterial({
    color: 0x6f4b2e,
    roughness: 0.96,
  });

  for (const px of [-1.35, 1.35]) {
    const post = new THREE.Mesh(
      new RoundedBoxGeometry(0.18, 2.15, 0.18, 2, 0.03),
      woodDark,
    );
    post.position.set(px, 1.08, 0);
    post.castShadow = true;
    group.add(post);
  }

  for (const [y, width, depth] of [
    [2.03, 3.45, 0.22],
    [1.7, 2.8, 0.16],
  ] as const) {
    const beam = new THREE.Mesh(
      new RoundedBoxGeometry(width, 0.16, depth, 2, 0.04),
      wood,
    );
    beam.position.set(0, y, 0);
    beam.castShadow = true;
    group.add(beam);
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.0, 0.34, 4), woodDark);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.28;
  roof.castShadow = true;
  group.add(roof);

  const shadow = makeBlobShadow(4.1, 1.3, 0.16, 0x3a291d);
  shadow.position.set(0, 0.012, 0.08);
  group.add(shadow);

  parent.add(group);
}

function addTeaTable(
  parent: THREE.Group,
  x: number,
  z: number,
  woodMap: THREE.CanvasTexture,
): void {
  const group = new THREE.Group();
  group.position.set(x, PLATFORM_TOP, z);
  group.name = "TeaTable";

  const wood = new THREE.MeshStandardMaterial({
    map: woodMap,
    color: 0xc39a64,
    roughness: 0.92,
  });
  const ceramic = new THREE.MeshStandardMaterial({
    color: 0xf2e2c4,
    roughness: 0.72,
  });
  const cushion = new THREE.MeshStandardMaterial({
    color: 0xd88474,
    roughness: 0.94,
  });

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.76, 0.09, 24),
    wood,
  );
  top.position.y = 0.52;
  top.castShadow = true;
  group.add(top);

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.16, 0.48, 10),
    wood,
  );
  stem.position.y = 0.26;
  stem.castShadow = true;
  group.add(stem);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.46, 0.06, 18),
    wood,
  );
  base.position.y = 0.03;
  group.add(base);

  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 7), ceramic);
  pot.scale.y = 0.72;
  pot.position.set(-0.12, 0.6, 0.04);
  group.add(pot);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), ceramic);
  lid.position.set(-0.12, 0.7, 0.04);
  group.add(lid);

  for (const [cx, cz] of [
    [0.22, 0.12],
    [0.12, -0.18],
    [0.36, -0.04],
  ] as const) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.06, 8), ceramic);
    cup.position.set(cx, 0.59, cz);
    group.add(cup);
  }

  for (const side of [-1, 1]) {
    const mat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 0.1, 14),
      cushion,
    );
    mat.position.set(side * 1.02, 0.06, side * 0.16);
    mat.castShadow = true;
    group.add(mat);
  }

  const shadow = makeBlobShadow(2.2, 1.5, 0.18, 0x3a291d);
  shadow.position.y = 0.012;
  group.add(shadow);

  parent.add(group);
}

function addBench(
  parent: THREE.Group,
  x: number,
  z: number,
  woodMap: THREE.CanvasTexture,
): void {
  const group = new THREE.Group();
  group.position.set(x, PLATFORM_TOP, z);
  group.rotation.y = -0.18;
  group.name = "GardenBench";

  const wood = new THREE.MeshStandardMaterial({
    map: woodMap,
    color: 0xc59c6c,
    roughness: 0.92,
  });
  const woodDark = new THREE.MeshStandardMaterial({
    color: 0x705033,
    roughness: 0.95,
  });

  const seat = new THREE.Mesh(
    new RoundedBoxGeometry(1.35, 0.1, 0.42, 3, 0.035),
    wood,
  );
  seat.position.y = 0.36;
  seat.castShadow = true;
  seat.receiveShadow = true;
  group.add(seat);

  const back = new THREE.Mesh(
    new RoundedBoxGeometry(1.35, 0.42, 0.09, 3, 0.035),
    wood,
  );
  back.position.set(0, 0.62, -0.17);
  back.rotation.x = -0.1;
  back.castShadow = true;
  group.add(back);

  for (const lx of [-0.48, 0.48]) {
    for (const lz of [-0.14, 0.14]) {
      const leg = new THREE.Mesh(
        new RoundedBoxGeometry(0.09, 0.34, 0.09, 2, 0.02),
        woodDark,
      );
      leg.position.set(lx, 0.18, lz);
      leg.castShadow = true;
      group.add(leg);
    }
  }

  const shadow = makeBlobShadow(1.7, 0.9, 0.18, 0x3a291d);
  shadow.position.set(0, 0.012, 0.02);
  group.add(shadow);

  parent.add(group);
}

function addPavilion(
  parent: THREE.Group,
  x: number,
  z: number,
  woodMap: THREE.CanvasTexture,
): void {
  const group = new THREE.Group();
  group.position.set(x, PLATFORM_TOP, z);
  group.scale.setScalar(0.72);
  group.name = "TeaPavilion";

  const wood = new THREE.MeshStandardMaterial({
    map: woodMap,
    color: 0xc59a68,
    roughness: 0.93,
  });
  const woodDark = new THREE.MeshStandardMaterial({
    color: 0x6f4b2e,
    roughness: 0.96,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    map: woodMap,
    color: 0xa96d4b,
    roughness: 0.92,
    side: THREE.DoubleSide,
  });

  for (const px of [-1.15, 1.15]) {
    for (const pz of [-0.95, 0.95]) {
      const post = new THREE.Mesh(
        new RoundedBoxGeometry(0.14, 1.85, 0.14, 2, 0.025),
        woodDark,
      );
      post.position.set(px, 0.93, pz);
      post.castShadow = true;
      group.add(post);
    }
  }

  const platform = new THREE.Mesh(
    new RoundedBoxGeometry(2.9, 0.12, 2.5, 3, 0.08),
    wood,
  );
  platform.position.y = 0.06;
  platform.receiveShadow = true;
  group.add(platform);

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 0.08), wood);
    rail.position.set(0, 0.54, side * 1.12);
    group.add(rail);
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.95, 0.55, 4), roofMaterial);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.02;
  roof.castShadow = true;
  group.add(roof);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), woodDark);
  finial.position.y = 2.35;
  group.add(finial);

  const shadow = makeBlobShadow(3.5, 2.8, 0.2, 0x3a291d);
  shadow.position.y = 0.012;
  group.add(shadow);

  parent.add(group);
}

function addFence(
  parent: THREE.Group,
  z: number,
  woodMap: THREE.CanvasTexture,
): void {
  const group = new THREE.Group();
  group.position.z = z;
  group.name = "OuterFence";

  const wood = new THREE.MeshStandardMaterial({
    map: woodMap,
    color: 0xb58a5c,
    roughness: 0.94,
  });
  const woodDark = new THREE.MeshStandardMaterial({
    color: 0x76512f,
    roughness: 0.96,
  });

  const postGeometry = new RoundedBoxGeometry(0.14, 1.02, 0.14, 2, 0.025);
  const posts = new THREE.InstancedMesh(postGeometry, woodDark, 13);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 13; i += 1) {
    dummy.position.set(-9.0 + i * 1.5, 0.5, 0);
    dummy.rotation.set(0, (i % 2) * 0.03, 0);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
  }
  posts.castShadow = true;
  group.add(posts);

  for (const y of [0.56, 0.86]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(18.1, 0.09, 0.1), wood);
    rail.position.set(0, y, 0.02);
    rail.castShadow = true;
    group.add(rail);
  }

  const shadow = makeBlobShadow(19.2, 0.9, 0.14, 0x3a291d);
  shadow.position.set(0, 0.014, 0.04);
  group.add(shadow);

  parent.add(group);
}

function addLantern(parent: THREE.Group, x: number, z: number): void {  const group = new THREE.Group();
  group.position.set(x, PLATFORM_TOP, z);
  group.name = "StoneLantern";

  const stone = new THREE.MeshStandardMaterial({
    color: 0x968b7b,
    roughness: 0.95,
    flatShading: true,
  });
  const stoneDark = new THREE.MeshStandardMaterial({
    color: 0x736b5f,
    roughness: 1,
    flatShading: true,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: 0xffdf9c,
    emissive: 0xffb85c,
    emissiveIntensity: 1.7,
    roughness: 0.5,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.5, 0.2, 8), stoneDark);
  base.position.y = 0.1;
  base.castShadow = true;
  group.add(base);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.62, 8), stone);
  stem.position.y = 0.5;
  stem.castShadow = true;
  group.add(stem);

  const lightBox = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.36, 0.45), glow);
  lightBox.position.y = 0.99;
  group.add(lightBox);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.25, 4), stoneDark);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.28;
  roof.castShadow = true;
  group.add(roof);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), stone);
  finial.position.y = 1.46;
  group.add(finial);

  const light = new THREE.PointLight(0xffc978, 2.4, 4.2, 2);
  light.position.set(0, 1.02, 0.08);
  group.add(light);

  const shadow = makeBlobShadow(1.1, 0.9, 0.22, 0x33251a);
  shadow.position.set(0, 0.012, 0);
  group.add(shadow);

  parent.add(group);
}

/* -------------------------------------------------------------------------- */
/* Rocks, flowers, mushrooms, bushes, stepping stones                          */
/* -------------------------------------------------------------------------- */

function addRocks(
  rockGeos: THREE.BufferGeometry[],
  mossGeos: THREE.BufferGeometry[],
  obstacles: ObstacleCircle[],
  seed: number,
): void {
  const rand = mulberry32(seed);
  const spots: Array<[number, number, number]> = [
    [3.95, 2.15, 0.5],
    [1.05, 3.9, 0.35],
    [3.45, 4.1, 0.42],
    [-2.25, 0.3, 0.3],
    [-3.85, -0.4, 0.26],
    [-1.15, -3.35, 0.34],
    [2.1, -0.15, 0.22],
    // Outer ring boulders and pebble clusters.
    [-7.6, 2.8, 0.64],
    [-9.1, -3.9, 0.5],
    [8.8, 0.9, 0.58],
    [8.0, 7.8, 0.48],
    [-4.6, 7.8, 0.38],
    [4.3, -8.7, 0.44],
    [-8.8, 8.3, 0.34],
    [8.9, -4.3, 0.36],
    [-6.8, 3.8, 0.4],
    [8.0, 1.8, 0.35],
    [-7.0, -2.5, 0.32],
    [7.2, -2.0, 0.3],
  ];
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const mossGeo = new THREE.SphereGeometry(1, 8, 5);

  for (const [x, z, size] of spots) {
    const sx = range(rand, 0.8, 1.25) * size;
    const sy = range(rand, 0.45, 0.8) * size;
    const sz = range(rand, 0.8, 1.3) * size;
    rockGeos.push(
      transformed(
        rockGeo,
        x,
        PLATFORM_TOP + sy * 0.42,
        z,
        range(rand, -0.2, 0.2),
        rand() * Math.PI,
        range(rand, -0.2, 0.2),
        sx,
        sy,
        sz,
        pick(rand, PALETTE.rock),
      ),
    );
    mossGeos.push(
      transformed(
        mossGeo,
        x,
        PLATFORM_TOP + sy * 0.82,
        z,
        0,
        rand() * Math.PI,
        0,
        sx * 0.78,
        sy * 0.16,
        sz * 0.8,
        pick(rand, ["#738d50", "#819b5d", "#647e45"]),
      ),
    );
    if (size > 0.3) {
      obstacles.push({ x, z, r: size * 1.1, kind: "rock" });
    }
  }

  // A handful of path pebbles.
  const pebbleGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 28; i += 1) {
    const t = rand();
    const x = -3.7 + t * 6.3 + range(rand, -0.35, 0.35);
    const z = 2.1 + Math.sin(t * Math.PI * 1.4) * 1.0 + range(rand, -0.25, 0.25);
    const s = range(rand, 0.05, 0.13);
    rockGeos.push(
      transformed(
        pebbleGeo,
        x,
        PLATFORM_TOP + s * 0.3,
        z,
        rand(),
        rand() * Math.PI,
        rand(),
        s,
        s * 0.55,
        s * 0.85,
        pick(rand, ["#c4b392", "#a79a83", "#8f8270"]),
      ),
    );
  }
}

function isInsidePond(x: number, z: number): boolean {
  const dx = (x - POND_WORLD.x) / (POND_WORLD.rx * 1.02);
  const dz = (z - POND_WORLD.z) / (POND_WORLD.rz * 1.02);
  return dx * dx + dz * dz < 1;
}

function addFlowers(
  petalGeos: THREE.BufferGeometry[],
  centerGeos: THREE.BufferGeometry[],
  seed: number,
): void {
  const rand = mulberry32(seed);
  const petalGeo = new THREE.SphereGeometry(1, 7, 5);
  const centerGeo = new THREE.SphereGeometry(1, 6, 4);
  const clusters: Array<[number, number, number]> = [
    [-4.4, 2.6, 10],
    [-3.4, 2.3, 8],
    [-4.2, -0.9, 7],
    [-2.0, -2.5, 6],
    [-0.3, -3.4, 7],
    [1.6, -2.4, 7],
    [4.2, -1.4, 9],
    [4.6, 0.9, 8],
    [3.9, 3.9, 10],
    [1.0, 4.5, 9],
    [-1.3, 4.1, 8],
    [0.5, 1.9, 7],
    [2.9, 0.9, 6],
    // Outer meadow flower patches.
    [-7.5, 7.3, 12],
    [-8.8, 2.0, 9],
    [-7.0, -3.8, 10],
    [-8.6, 5.0, 8],
    [7.8, 7.6, 12],
    [8.8, 2.4, 10],
    [7.2, -3.2, 10],
    [8.7, 6.6, 8],
    [-2.0, 8.7, 8],
    [2.4, 8.8, 8],
    [-7.9, -7.9, 7],
    [7.8, -8.0, 7],
    [-6.8, 8.1, 16],
    [6.8, 8.2, 16],
    [-9.0, 6.6, 12],
    [8.8, 8.0, 12],
    [-5.2, -8.2, 10],
    [5.0, -8.3, 10],
    [-8.9, -2.0, 9],
    [8.9, -2.0, 9],
    [-3.2, 8.9, 18],
    [0.4, 9.0, 18],
    [3.3, 8.85, 18],
    [-8.4, -6.3, 8],
    [8.3, -6.2, 8],
    [-6.0, 9.1, 12],
    [-3.8, 9.1, 12],
    [-1.4, 9.15, 12],
    [1.0, 9.1, 12],
    [3.9, 9.1, 12],
    [6.1, 9.0, 12],
    [-7.2, 1.5, 10],
    [7.0, 2.8, 10],
    [-6.6, -5.5, 8],
    [6.8, -5.6, 8],
    [-5.2, 5.4, 9],
    [5.2, 5.6, 9],
  ];
  for (const [cx, cz, count] of clusters) {
    for (let i = 0; i < count; i += 1) {
      const x = cx + range(rand, -0.55, 0.55);
      const z = cz + range(rand, -0.5, 0.5);
      if (isInsidePond(x, z)) continue;
      const petals = 5;
      const color = pick(rand, ["#fff1c9", "#f8ccd9", "#f3b7c7", "#fff8e7", "#f2d39d"]);
      for (let p = 0; p < petals; p += 1) {
        const a = (p / petals) * Math.PI * 2 + rand() * 0.4;
        petalGeos.push(
          transformed(
            petalGeo,
            x + Math.cos(a) * 0.075,
            PLATFORM_TOP + 0.09,
            z + Math.sin(a) * 0.075,
            0,
            a,
            0,
            0.075,
            0.03,
            0.05,
            color,
          ),
        );
      }
      centerGeos.push(
        transformed(
          centerGeo,
          x,
          PLATFORM_TOP + 0.12,
          z,
          0,
          0,
          0,
          0.045,
          0.035,
          0.045,
          "#efc45d",
        ),
      );
    }
  }
}

function addFlowerMeadows(
  petalGeos: THREE.BufferGeometry[],
  centerGeos: THREE.BufferGeometry[],
  seed: number,
): void {
  const rand = mulberry32(seed);
  const petalGeo = new THREE.SphereGeometry(1, 6, 4);
  const centerGeo = new THREE.SphereGeometry(1, 5, 4);
  const patches: Array<[number, number, number, number, number]> = [
    [-6.7, 7.4, 1.4, 1.0, 52],
    [6.7, 7.4, 1.4, 1.0, 52],
    [-8.0, -2.4, 1.2, 1.4, 42],
    [8.0, 2.2, 1.2, 1.4, 42],
    [-5.8, -6.8, 1.4, 1.0, 38],
    [5.8, -6.8, 1.4, 1.0, 38],
  ];
  for (const [cx, cz, rx, rz, count] of patches) {
    for (let i = 0; i < count; i += 1) {
      const angle = rand() * Math.PI * 2;
      const radius = Math.sqrt(rand());
      const x = cx + Math.cos(angle) * radius * rx;
      const z = cz + Math.sin(angle) * radius * rz;
      if (isInsidePond(x, z)) continue;
      const color = pick(rand, ["#fff1c9", "#f8ccd9", "#f3b7c7", "#fff8e7", "#f2d39d"]);
      for (let p = 0; p < 5; p += 1) {
        const a = (p / 5) * Math.PI * 2 + rand() * 0.5;
        petalGeos.push(
          transformed(
            petalGeo,
            x + Math.cos(a) * 0.07,
            PLATFORM_TOP + 0.08,
            z + Math.sin(a) * 0.07,
            0,
            a,
            0,
            0.066,
            0.025,
            0.042,
            color,
          ),
        );
      }
      centerGeos.push(
        transformed(
          centerGeo,
          x,
          PLATFORM_TOP + 0.105,
          z,
          0,
          0,
          0,
          0.038,
          0.028,
          0.038,
          "#efc45d",
        ),
      );
    }
  }
}

function addGrass(parent: THREE.Group, seed: number): void {
  const rand = mulberry32(seed);
  const blade = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    -0.028, 0, 0, 0.028, 0, 0, 0.012, 0.24, 0,
    0, 0, -0.028, 0, 0, 0.028, 0, 0.26, 0.01,
  ]);
  blade.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  blade.computeVertexNormals();

  const count = 8000;
  const mesh = new THREE.InstancedMesh(
    blade,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      side: THREE.DoubleSide,
      vertexColors: false,
    }),
    count,
  );
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let index = 0;
  let guard = 0;
  while (index < count && guard < count * 5) {
    guard += 1;
    const x = range(rand, -9.95, 9.95);
    const z = range(rand, -9.95, 9.95);
    if (isInsidePond(x, z)) continue;
    if (!insidePlatformArea(x, z, 0.18)) continue;
    dummy.position.set(x, PLATFORM_TOP + 0.015, z);
    dummy.rotation.set(0, rand() * Math.PI, range(rand, -0.12, 0.12));
    dummy.scale.set(range(rand, 0.55, 1.35), range(rand, 0.55, 1.4), range(rand, 0.55, 1.35));
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    color.set(pick(rand, PALETTE.grass));
    color.offsetHSL(0, 0, range(rand, -0.05, 0.04));
    mesh.setColorAt(index, color);
    index += 1;
  }
  mesh.count = index;
  mesh.receiveShadow = true;
  mesh.name = "GrassTufts";
  parent.add(mesh);
}

function addMushrooms(
  stemGeos: THREE.BufferGeometry[],
  capGeos: THREE.BufferGeometry[],
  spotGeos: THREE.BufferGeometry[],
  seed: number,
): void {
  const rand = mulberry32(seed);
  const clusters: Array<[number, number, number]> = [
    [-2.45, -1.9, 5],
    [-3.8, 0.9, 4],
    [3.7, 2.6, 4],
    [-7.2, 6.8, 5],
    [8.0, -6.4, 4],
    [-6.9, -6.1, 4],
  ];
  const stemGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.18, 7);
  const capGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const spotGeo = new THREE.SphereGeometry(1, 6, 4);
  for (const [cx, cz, count] of clusters) {
    for (let i = 0; i < count; i += 1) {
      const x = cx + range(rand, -0.28, 0.28);
      const z = cz + range(rand, -0.25, 0.25);
      const scale = range(rand, 0.72, 1.35);
      stemGeos.push(
        transformed(stemGeo, x, PLATFORM_TOP + 0.09 * scale, z, 0, 0, 0, scale, scale, scale, "#f0dfc0"),
      );
      capGeos.push(
        transformed(capGeo, x, PLATFORM_TOP + 0.17 * scale, z, 0, rand() * Math.PI, 0, 0.13 * scale, 0.1 * scale, 0.13 * scale, pick(rand, ["#d96a4e", "#c95843", "#e07a55"])),
      );
      for (let s = 0; s < 3; s += 1) {
        const a = rand() * Math.PI * 2;
        spotGeos.push(
          transformed(
            spotGeo,
            x + Math.cos(a) * 0.07 * scale,
            PLATFORM_TOP + 0.225 * scale,
            z + Math.sin(a) * 0.07 * scale,
            0,
            0,
            0,
            0.018 * scale,
            0.008 * scale,
            0.018 * scale,
            "#fff1cf",
          ),
        );
      }
    }
  }
}

function addBushes(
  bushGeos: THREE.BufferGeometry[],
  flowerGeos: THREE.BufferGeometry[],
  obstacles: ObstacleCircle[],
  seed: number,
): void {
  const rand = mulberry32(seed);
  const spots: Array<[number, number, number]> = [
    [-4.7, -3.3, 0.9],
    [-2.9, -4.3, 0.7],
    [4.55, -3.25, 0.85],
    [3.3, -4.25, 0.65],
    [4.75, 2.95, 0.7],
    [-4.55, 3.65, 0.6],
    [0.2, -2.6, 0.52],
    [2.0, -2.35, 0.48],
    // Outer ring shrub masses.
    [-9.2, 1.2, 0.72],
    [-9.1, -5.8, 0.8],
    [9.2, -2.0, 0.72],
    [9.0, 7.3, 0.62],
    [-5.4, -9.0, 0.68],
    [5.2, -9.0, 0.68],
    [-2.6, 9.2, 0.58],
    [2.2, 9.3, 0.58],
    [-6.8, 8.7, 0.56],
    [6.8, 8.8, 0.56],
    [-8.6, 7.0, 0.5],
    [8.6, 7.0, 0.5],
    [-6.4, 0.6, 0.62],
    [-6.0, -4.2, 0.58],
    [6.2, 4.4, 0.58],
    [-5.8, 4.6, 0.52],
    [5.8, -4.6, 0.52],
    [-6.9, 7.0, 0.9],
    [6.9, 7.1, 0.9],
    [-8.2, -2.6, 0.85],
    [8.2, 2.0, 0.85],
    [-5.6, -7.2, 0.82],
    [5.6, -7.2, 0.82],
  ];
  const puff = new THREE.SphereGeometry(1, 10, 7);
  const dot = new THREE.SphereGeometry(1, 5, 4);
  for (const [cx, cz, scale] of spots) {
    const puffs = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < puffs; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = range(rand, 0.05, 0.48) * scale;
      bushGeos.push(
        transformed(
          puff,
          cx + Math.cos(a) * r,
          PLATFORM_TOP + range(rand, 0.12, 0.55) * scale,
          cz + Math.sin(a) * r,
          0,
          rand() * Math.PI,
          0,
          range(rand, 0.22, 0.48) * scale,
          range(rand, 0.18, 0.4) * scale,
          range(rand, 0.22, 0.48) * scale,
          pick(rand, ["#5f7f49", "#6f8d54", "#527240", "#7e9b5e"]),
        ),
      );
    }
    for (let i = 0; i < 8; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = range(rand, 0.1, 0.55) * scale;
      flowerGeos.push(
        transformed(
          dot,
          cx + Math.cos(a) * r,
          PLATFORM_TOP + range(rand, 0.35, 0.65) * scale,
          cz + Math.sin(a) * r,
          0,
          0,
          0,
          0.032,
          0.026,
          0.032,
          pick(rand, ["#fff2d0", "#f6c9d7", "#f5dfac"]),
        ),
      );
    }
    if (scale > 0.65) obstacles.push({ x: cx, z: cz, r: scale * 0.55, kind: "bush" });
  }
}

function addSteppingStones(
  stones: THREE.BufferGeometry[],
  seed: number,
): void {
  const rand = mulberry32(seed);
  const stoneGeo = new THREE.CylinderGeometry(1, 1.05, 0.05, 10);
  const points: Array<[number, number]> = [
    [-2.9, 2.0],
    [-2.2, 2.35],
    [-1.45, 2.6],
    [-0.7, 2.85],
    [0.05, 3.0],
    [0.75, 3.15],
    [1.4, 3.3],
    // A new entry path from the enlarged front meadow.
    [0.3, 9.2],
    [-0.25, 8.35],
    [0.2, 7.5],
    [-0.15, 6.65],
    [0.25, 5.8],
    [0.0, 4.95],
    [-0.2, 4.15],
  ];
  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2 + 0.08;
    points.push([Math.cos(angle) * 7.2, Math.sin(angle) * 7.2]);
  }
  for (const [x, z] of points) {
    stones.push(
      transformed(
        stoneGeo,
        x,
        PLATFORM_TOP + 0.025,
        z,
        range(rand, -0.05, 0.05),
        rand() * Math.PI,
        range(rand, -0.04, 0.04),
        range(rand, 0.25, 0.42),
        1,
        range(rand, 0.22, 0.36),
        pick(rand, ["#b7a88d", "#a2937b", "#c4b698"]),
      ),
    );
  }
}

function addGrassClumps(geos: THREE.BufferGeometry[], seed: number): void {
  const rand = mulberry32(seed);
  const blade = makeLeafGeometry(0.34, 0.085);
  const spots: Array<[number, number, number]> = [
    [-4.8, 1.3, 5],
    [-3.9, -2.6, 6],
    [-2.1, 2.8, 5],
    [-1.2, -0.6, 4],
    [0.2, 2.2, 5],
    [1.2, -1.6, 5],
    [2.4, 2.1, 6],
    [3.4, -2.2, 5],
    [4.4, 3.5, 6],
    [4.1, -0.4, 5],
    [0.9, 4.3, 5],
    [-3.4, 4.0, 4],
    [2.2, -3.7, 4],
    [-0.8, -4.1, 5],
    // Outer-ring grasses.
    [-7.2, 4.8, 6],
    [-8.8, 6.8, 6],
    [7.2, 4.6, 6],
    [8.6, 7.0, 6],
    [-7.4, -4.8, 5],
    [7.4, -4.2, 5],
    [-3.8, -8.2, 5],
    [3.6, -8.4, 5],
    [0.0, 8.9, 6],
    [-8.4, 8.1, 5],
    [8.4, 8.2, 5],
    [6.8, -8.6, 4],
    [-6.7, 8.7, 4],
  ];
  for (const [cx, cz, count] of spots) {
    for (let i = 0; i < count; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = range(rand, 0.02, 0.26);
      const heightScale = range(rand, 0.8, 1.45);
      geos.push(
        transformed(
          blade,
          cx + Math.cos(a) * r,
          PLATFORM_TOP + 0.02,
          cz + Math.sin(a) * r,
          0,
          a,
          range(rand, -0.08, 0.08),
          1,
          heightScale,
          1,
          pick(rand, ["#6d8848", "#7d9954", "#5f7b41", "#8ca55f"]),
        ),
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

export function createProps(): Props {
  const group = new THREE.Group();
  group.name = "PipiProps";
  const obstacles: ObstacleCircle[] = [];
  const framePoints: THREE.Vector3[] = [];

  const stalkGeos: THREE.BufferGeometry[] = [];
  const leafGeos: THREE.BufferGeometry[] = [];
  const shootGeos: THREE.BufferGeometry[] = [];
  const trunkGeos: THREE.BufferGeometry[] = [];
  const canopyGeos: THREE.BufferGeometry[] = [];
  const blossomGeos: THREE.BufferGeometry[] = [];
  const rockGeos: THREE.BufferGeometry[] = [];
  const mossGeos: THREE.BufferGeometry[] = [];
  const flowerPetalGeos: THREE.BufferGeometry[] = [];
  const flowerCenterGeos: THREE.BufferGeometry[] = [];
  const stemGeos: THREE.BufferGeometry[] = [];
  const capGeos: THREE.BufferGeometry[] = [];
  const spotGeos: THREE.BufferGeometry[] = [];
  const bushGeos: THREE.BufferGeometry[] = [];
  const bushFlowerGeos: THREE.BufferGeometry[] = [];
  const stoneGeos: THREE.BufferGeometry[] = [];
  const clumpGeos: THREE.BufferGeometry[] = [];

  // Tall elements around the rim, with a generous open centre.
  const bambooClusters: Array<[number, number, number, number, number]> = [
    [3.25, -2.8, 11, 4, 1.0],
    [4.8, 0.25, 22, 4, 0.9],
    [1.45, -4.25, 33, 3, 0.95],
    [-4.45, 2.65, 44, 3, 0.8],
    [-3.85, -3.4, 55, 4, 0.9],
    // Outer meadow ring: the original 12x12 garden stays in the centre.
    [-8.8, -0.6, 66, 4, 0.88],
    [8.4, -7.0, 77, 4, 0.95],
    [8.8, 5.3, 88, 4, 0.9],
    [-5.8, 8.8, 99, 3, 0.8],
    [5.6, 9.0, 111, 3, 0.82],
    [-8.7, -7.8, 122, 4, 0.9],
    // Mid-ring groves bridge the central garden and the outer meadow.
    [-6.4, 2.6, 133, 3, 0.82],
    [6.5, 2.1, 144, 3, 0.82],
  ];
  let propTop = 0;
  for (const [x, z, seed, count, scale] of bambooClusters) {
    const top = addBambooCluster(stalkGeos, leafGeos, x, z, seed, count, scale);
    propTop = Math.max(propTop, top);
    obstacles.push({ x, z, r: 0.7, kind: "bamboo" });
    framePoints.push(
      new THREE.Vector3(x, top, z),
      new THREE.Vector3(x + 0.45, top - 0.2, z),
      new THREE.Vector3(x - 0.45, top - 0.2, z),
      new THREE.Vector3(x, top - 0.2, z + 0.45),
      new THREE.Vector3(x, top - 0.2, z - 0.45),
    );
  }
  addBambooShoots(shootGeos, 88);

  const sakuraX = -3.35;
  const sakuraZ = -1.9;
  const sakuraTop = addSakura(trunkGeos, canopyGeos, blossomGeos, sakuraX, sakuraZ, 7);
  propTop = Math.max(propTop, sakuraTop);
  for (const [dx, dz] of [
    [0, 0],
    [1.1, 0],
    [-1.1, 0],
    [0, 1.1],
    [0, -1.1],
  ] as const) {
    framePoints.push(new THREE.Vector3(sakuraX + dx, sakuraTop - 0.2, sakuraZ + dz));
  }
  obstacles.push({ x: sakuraX, z: sakuraZ, r: 0.55, kind: "sakura" });

  const sakura2X = 7.6;
  const sakura2Z = -4.2;
  const sakura2Top = addSakura(trunkGeos, canopyGeos, blossomGeos, sakura2X, sakura2Z, 17);
  propTop = Math.max(propTop, sakura2Top);
  for (const [dx, dz] of [
    [0, 0],
    [1.1, 0],
    [-1.1, 0],
    [0, 1.1],
    [0, -1.1],
  ] as const) {
    framePoints.push(new THREE.Vector3(sakura2X + dx, sakura2Top - 0.2, sakura2Z + dz));
  }
  obstacles.push({ x: sakura2X, z: sakura2Z, r: 0.55, kind: "sakura" });

  addRocks(rockGeos, mossGeos, obstacles, 5);
  addFlowers(flowerPetalGeos, flowerCenterGeos, 14);
  addFlowerMeadows(flowerPetalGeos, flowerCenterGeos, 74);
  addMushrooms(stemGeos, capGeos, spotGeos, 19);
  addBushes(bushGeos, bushFlowerGeos, obstacles, 23);
  addSteppingStones(stoneGeos, 27);
  addGrassClumps(clumpGeos, 41);

  // The pond is a single circular no-go footprint for the panda AI.
  obstacles.push({
    x: POND_WORLD.x,
    z: POND_WORLD.z,
    r: Math.max(POND_WORLD.rx, POND_WORLD.rz) * 1.08,
    kind: "pond",
  });

  addMerged(group, stalkGeos, foliageMaterial(), "BambooStalks");
  addMerged(group, leafGeos, foliageMaterial(THREE.DoubleSide), "BambooLeaves");
  addMerged(group, shootGeos, foliageMaterial(), "BambooShoots");
  addMerged(group, trunkGeos, foliageMaterial(), "SakuraTrunk");
  addMerged(group, canopyGeos, foliageMaterial(), "SakuraCanopy");
  addMerged(group, blossomGeos, foliageMaterial(), "SakuraBlossoms");
  addMerged(group, rockGeos, foliageMaterial(), "Rocks");
  addMerged(group, mossGeos, foliageMaterial(), "MossCaps");
  addMerged(group, flowerPetalGeos, foliageMaterial(), "FlowerPetals");
  addMerged(group, flowerCenterGeos, foliageMaterial(), "FlowerCenters");
  addMerged(group, stemGeos, foliageMaterial(), "MushroomStems");
  addMerged(group, capGeos, foliageMaterial(), "MushroomCaps");
  addMerged(group, spotGeos, foliageMaterial(), "MushroomSpots");
  addMerged(group, bushGeos, foliageMaterial(), "Bushes");
  addMerged(group, bushFlowerGeos, foliageMaterial(), "BushFlowers");
  addMerged(group, stoneGeos, foliageMaterial(), "SteppingStones");
  addMerged(group, clumpGeos, foliageMaterial(THREE.DoubleSide), "TallGrassClumps");

  addGrass(group, 31);

  const woodMap = makeTexture(makeWoodTexture());
  const signX = -3.85;
  const signZ = 1.5;
  addSign(group, signX, signZ, woodMap);
  obstacles.push({ x: signX, z: signZ, r: 0.75, kind: "sign" });
  framePoints.push(new THREE.Vector3(signX, 1.72, signZ));

  const benchX = -1.9;
  const benchZ = -0.6;
  addBench(group, benchX, benchZ, woodMap);
  obstacles.push({ x: benchX, z: benchZ, r: 0.52, kind: "bench" });

  const lanternX = 3.75;
  const lanternZ = 1.55;
  addLantern(group, lanternX, lanternZ);
  obstacles.push({ x: lanternX, z: lanternZ, r: 0.32, kind: "lantern" });
  framePoints.push(new THREE.Vector3(lanternX, 1.58, lanternZ));

  const outerLanterns: Array<[number, number]> = [
    [-6.6, 7.8],
    [9.1, -1.4],
  ];
  for (const [x, z] of outerLanterns) {
    addLantern(group, x, z);
    obstacles.push({ x, z, r: 0.32, kind: "lantern" });
    framePoints.push(new THREE.Vector3(x, 1.58, z));
  }

  const outerBenchX = 7.2;
  const outerBenchZ = 7.7;
  addBench(group, outerBenchX, outerBenchZ, woodMap);
  obstacles.push({ x: outerBenchX, z: outerBenchZ, r: 0.55, kind: "bench" });

  addFence(group, -9.55, woodMap);
  framePoints.push(new THREE.Vector3(0, 1.15, -9.6));

  // Blob shadows for the major static masses.
  const shadows: Array<[number, number, number, number]> = [
    [3.25, -2.8, 2.2, 0.24],
    [4.8, 0.25, 1.8, 0.2],
    [1.45, -4.25, 1.8, 0.2],
    [-4.45, 2.65, 1.7, 0.18],
    [-3.15, -1.6, 3.1, 0.22],
    [3.75, 1.55, 1.2, 0.2],
    [-3.85, 1.5, 2.1, 0.18],
    [7.6, -4.2, 3.0, 0.2],
    [-8.8, -0.6, 1.8, 0.18],
    [8.4, -7.0, 1.8, 0.18],
    [8.8, 5.3, 1.9, 0.18],
    [-5.8, 8.8, 1.5, 0.16],
    [5.6, 9.0, 1.5, 0.16],
    [-8.7, -7.8, 1.8, 0.18],
    [-6.4, 2.6, 1.6, 0.16],
    [6.5, 2.1, 1.6, 0.16],
    [-6.6, 7.8, 1.1, 0.18],
    [9.1, -1.4, 1.1, 0.18],
    [7.2, 7.7, 1.7, 0.16],
  ];
  for (const [x, z, size, opacity] of shadows) {
    const shadow = makeBlobShadow(size, size * 0.8, opacity, 0x37261b);
    shadow.position.set(x, PLATFORM_TOP + 0.006, z);
    group.add(shadow);
  }

  return {
    group,
    obstacles,
    top: Math.max(propTop, 7.0),
    framePoints,
    update: () => {},
  };
}
