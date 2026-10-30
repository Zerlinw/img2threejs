import * as THREE from "three";
import {
  PALETTE,
  makePetalGeometry,
  makeSoftCircleTexture,
  mulberry32,
  pick,
  range,
} from "./procedural";
import { POND_WORLD, PLATFORM_TOP } from "./terrain";

export interface Ambient {
  group: THREE.Group;
  update: (time: number, delta: number) => void;
}

interface PetalState {
  x: number;
  z: number;
  y: number;
  speed: number;
  drift: number;
  spin: number;
  phase: number;
}

interface ButterflyState {
  group: THREE.Group;
  wingL: THREE.Object3D;
  wingR: THREE.Object3D;
  cx: number;
  cz: number;
  radius: number;
  phase: number;
  speed: number;
  height: number;
}

interface KoiState {
  group: THREE.Group;
  tail: THREE.Object3D;
  angle: number;
  radiusX: number;
  radiusZ: number;
  speed: number;
  phase: number;
}

export function createAmbient(): Ambient {
  const group = new THREE.Group();
  group.name = "PipiAmbient";

  /* ------------------------------------------------------------------ */
  /* Falling sakura petals                                               */
  /* ------------------------------------------------------------------ */

  const rand = mulberry32(0x51a4);
  const petalCount = 110;
  const petalGeometry = makePetalGeometry();
  petalGeometry.scale(1, 1, 1);
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const petals = new THREE.InstancedMesh(petalGeometry, petalMaterial, petalCount);
  petals.name = "SakuraPetals";
  petals.frustumCulled = false;
  const petalStates: PetalState[] = [];
  const petalDummy = new THREE.Object3D();
  const petalColor = new THREE.Color();
  for (let i = 0; i < petalCount; i += 1) {
    petalStates.push({
      x: range(rand, -9.7, 9.7),
      z: range(rand, -9.7, 9.7),
      y: range(rand, 0.35, 5.1),
      speed: range(rand, 0.12, 0.34),
      drift: range(rand, 0.1, 0.4),
      spin: range(rand, -1.5, 1.5),
      phase: range(rand, 0, Math.PI * 2),
    });
    petalColor.set(pick(rand, ["#f3b7c7", "#f7d1da", "#efb0c2", "#fff0e7", "#f4c3cf"]));
    petals.setColorAt(i, petalColor);
  }
  if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
  group.add(petals);

  /* ------------------------------------------------------------------ */
  /* Butterflies                                                         */
  /* ------------------------------------------------------------------ */

  const butterflies: ButterflyState[] = [];
  const wingGeometry = new THREE.SphereGeometry(1, 10, 7);
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: 0xf092a9,
    roughness: 0.78,
    side: THREE.DoubleSide,
  });
  const wingMaterial2 = new THREE.MeshStandardMaterial({
    color: 0xffc56d,
    roughness: 0.78,
    side: THREE.DoubleSide,
  });
  const butterflyBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x5e4231,
    roughness: 0.9,
  });
  const butterflySpots: Array<[number, number, number, number]> = [
    [-3.2, 2.2, 0.85, 0.95],
    [2.5, -1.4, 0.72, 1.35],
    [0.3, 2.8, 0.6, 0.8],
    [0.1, 1.2, 0.5, 1.1],
    [1.4, 1.9, 0.65, 1.15],
    [-8.3, 4.9, 0.7, 1.0],
    [8.8, -1.0, 0.65, 1.25],
    [4.0, 7.9, 0.6, 1.05],
    [-7.0, -5.0, 0.6, 1.2],
  ];
  butterflySpots.forEach(([cx, cz, radius, speed], i) => {
    const b = new THREE.Group();
    b.name = `Butterfly${i}`;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.018, 0.095, 3, 6),
      butterflyBodyMaterial,
    );
    body.rotation.x = Math.PI / 2;
    b.add(body);
    const wingL = new THREE.Group();
    const wingR = new THREE.Group();
    const left = new THREE.Mesh(wingGeometry, i % 2 === 0 ? wingMaterial : wingMaterial2);
    left.scale.set(0.22, 0.022, 0.15);
    left.position.set(-0.14, 0, 0);
    const right = new THREE.Mesh(wingGeometry, i % 2 === 0 ? wingMaterial2 : wingMaterial);
    right.scale.set(0.22, 0.022, 0.15);
    right.position.set(0.14, 0, 0);
    wingL.add(left);
    wingR.add(right);
    b.add(wingL, wingR);
    group.add(b);
    butterflies.push({
      group: b,
      wingL,
      wingR,
      cx,
      cz,
      radius,
      phase: i * 2.1,
      speed,
      height: 1.2 + i * 0.32,
    });
  });

  /* ------------------------------------------------------------------ */
  /* Koi                                                                 */
  /* ------------------------------------------------------------------ */

  const koi: KoiState[] = [];
  const koiBodyGeo = new THREE.SphereGeometry(1, 10, 7);
  const koiTailGeo = new THREE.ConeGeometry(0.075, 0.18, 5);
  const orange = new THREE.MeshStandardMaterial({ color: 0xe8833d, roughness: 0.72 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfff0d2, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3c2b22, roughness: 0.8 });
  const koiSpecs: Array<[number, number, number, number, number]> = [
    [0.16, 0.18, 0.44, 0.34, 0.0],
    [0.22, 0.15, 0.5, 0.42, 1.4],
    [0.12, 0.2, 0.36, 0.3, 2.4],
    [0.26, 0.14, 0.55, 0.48, 3.4],
    [0.18, 0.18, 0.48, 0.4, 4.6],
  ];
  koiSpecs.forEach(([rx, rz, speed, size, phase], i) => {
    const b = new THREE.Group();
    b.name = `Koi${i}`;
    const body = new THREE.Mesh(koiBodyGeo, i % 2 === 0 ? orange : cream);
    body.scale.set(0.09 * size, 0.045 * size, 0.17 * size);
    b.add(body);
    const patch = new THREE.Mesh(koiBodyGeo, i % 2 === 0 ? cream : orange);
    patch.scale.set(0.045 * size, 0.043 * size, 0.075 * size);
    patch.position.set(0.035, 0.025, 0.02);
    b.add(patch);
    const tail = new THREE.Mesh(koiTailGeo, i % 2 === 0 ? orange : cream);
    tail.scale.set(size, size, size);
    tail.position.z = -0.18 * size;
    tail.rotation.x = Math.PI / 2;
    b.add(tail);
    const fin = new THREE.Mesh(koiBodyGeo, i % 2 === 0 ? orange : cream);
    fin.scale.set(0.045 * size, 0.008 * size, 0.06 * size);
    fin.position.set(-0.08, 0, 0.01);
    fin.rotation.z = -0.5;
    b.add(fin);
    b.scale.setScalar(1.55);
    b.renderOrder = 5;
    group.add(b);
    koi.push({
      group: b,
      tail,
      angle: phase,
      radiusX: POND_WORLD.rx * rx,
      radiusZ: POND_WORLD.rz * rz,
      speed,
      phase,
    });
  });

  /* ------------------------------------------------------------------ */
  /* Lily pads                                                           */
  /* ------------------------------------------------------------------ */

  const padGeometry = new THREE.CircleGeometry(1, 18);
  const padMaterial = new THREE.MeshStandardMaterial({
    color: 0x6f9e56,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const lotusMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5b8c3,
    roughness: 0.85,
  });
  const lotusCenterMaterial = new THREE.MeshStandardMaterial({
    color: 0xf3d27a,
    roughness: 0.85,
  });
  const padSpots: Array<[number, number, number, number]> = [
    [-0.42, -0.12, 0.19, 0.4],
    [0.3, -0.3, 0.16, 1.4],
    [0.42, 0.22, 0.14, 2.2],
    [-0.1, 0.36, 0.17, 3.1],
    [-0.52, 0.28, 0.12, 4.2],
    [0.08, 0.08, 0.11, 5.0],
    [0.52, -0.06, 0.12, 1.1],
  ];
  padSpots.forEach(([dx, dz, size, rotation], index) => {
    const pad = new THREE.Mesh(padGeometry, padMaterial);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = rotation;
    pad.scale.set(size * 1.55, size, 1);
    pad.position.set(
      POND_WORLD.x + dx * POND_WORLD.rx,
      0.138 + index * 0.0005,
      POND_WORLD.z + dz * POND_WORLD.rz,
    );
    pad.renderOrder = 6;
    group.add(pad);
    if (index % 3 === 0) {
      const lotus = new THREE.Group();
      const petals = 5;
      for (let p = 0; p < petals; p += 1) {
        const petal = new THREE.Mesh(wingGeometry, lotusMaterial);
        petal.scale.set(0.035, 0.012, 0.065);
        const a = (p / petals) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.035, 0.01, Math.sin(a) * 0.035);
        petal.rotation.y = a;
        lotus.add(petal);
      }
      const center = new THREE.Mesh(wingGeometry, lotusCenterMaterial);
      center.scale.set(0.025, 0.018, 0.025);
      center.position.y = 0.02;
      lotus.add(center);
      lotus.position.set(pad.position.x, 0.15, pad.position.z);
      lotus.renderOrder = 7;
      group.add(lotus);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Floating motes                                                      */
  /* ------------------------------------------------------------------ */

  const moteCount = 64;
  const motePositions = new Float32Array(moteCount * 3);
  const moteBase = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i += 1) {
    const x = range(rand, -9.6, 9.6);
    const y = range(rand, 0.3, 4.8);
    const z = range(rand, -9.6, 9.6);
    motePositions[i * 3] = x;
    motePositions[i * 3 + 1] = y;
    motePositions[i * 3 + 2] = z;
    moteBase[i * 3] = x;
    moteBase[i * 3 + 1] = y;
    moteBase[i * 3 + 2] = z;
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
  const moteMaterial = new THREE.PointsMaterial({
    map: makeSoftCircleTexture(),
    color: 0xfff0c9,
    size: 0.075,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const motes = new THREE.Points(moteGeometry, moteMaterial);
  motes.name = "FloatingMotes";
  motes.frustumCulled = false;
  group.add(motes);

  const update = (time: number, delta: number): void => {
    // Petals.
    for (let i = 0; i < petalStates.length; i += 1) {
      const p = petalStates[i]!;
      p.y -= p.speed * delta;
      p.x += Math.sin(time * 0.7 + p.phase) * p.drift * delta;
      p.z += Math.cos(time * 0.54 + p.phase) * p.drift * 0.5 * delta;
      if (p.y < 0.04) {
        p.y = range(rand, 3.8, 5.2);
        p.x = range(rand, -9.7, 9.7);
        p.z = range(rand, -9.7, 9.7);
      }
      petalDummy.position.set(p.x, p.y, p.z);
      petalDummy.rotation.set(
        time * p.spin + p.phase,
        time * 0.6 + p.phase,
        Math.sin(time + p.phase) * 0.7,
      );
      petalDummy.scale.setScalar(1.0 + (i % 4) * 0.14);
      petalDummy.updateMatrix();
      petals.setMatrixAt(i, petalDummy.matrix);
    }
    petals.instanceMatrix.needsUpdate = true;

    // Butterflies.
    for (const b of butterflies) {
      const phase = time * b.speed + b.phase;
      const x = b.cx + Math.cos(phase) * b.radius + Math.sin(phase * 2.3) * 0.16;
      const z = b.cz + Math.sin(phase * 0.9) * b.radius * 0.75;
      const y = PLATFORM_TOP + b.height + Math.sin(phase * 2.1) * 0.16;
      b.group.position.set(x, y, z);
      b.group.rotation.y = -phase * 0.7 + Math.PI / 2;
      const flap = Math.sin(time * 15 + b.phase) * 0.7;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
    }

    // Koi.
    for (const f of koi) {
      f.angle += f.speed * delta;
      const x = POND_WORLD.x + Math.cos(f.angle) * f.radiusX;
      const z = POND_WORLD.z + Math.sin(f.angle) * f.radiusZ;
      f.group.position.set(x, 0.135, z);
      f.group.rotation.y = -f.angle + Math.PI / 2;
      f.tail.rotation.z = Math.sin(time * 7 + f.phase) * 0.55;
    }

    // Motes.
    const pos = moteGeometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < moteCount; i += 1) {
      const phase = time * 0.18 + i * 0.71;
      pos.setXYZ(
        i,
        moteBase[i * 3]! + Math.sin(phase) * 0.25,
        moteBase[i * 3 + 1]! + Math.sin(phase * 0.7) * 0.18,
        moteBase[i * 3 + 2]! + Math.cos(phase * 0.8) * 0.25,
      );
    }
    pos.needsUpdate = true;
  };

  return { group, update };
}
