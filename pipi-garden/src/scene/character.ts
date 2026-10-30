import * as THREE from "three";
import { makeBlobShadow } from "./procedural";

export type PandaAction = "idle" | "walk" | "sit" | "eat" | "wag";

export interface PandaPoseOptions {
  time?: number;
  blink?: number;
}

const SPHERE = new THREE.SphereGeometry(1, 20, 16);
const SMALL_SPHERE = new THREE.SphereGeometry(1, 10, 8);
const CAPSULE = new THREE.CapsuleGeometry(0.06, 0.1, 4, 9);
const EYE = new THREE.SphereGeometry(1, 14, 10);

const MAT = {
  rust: new THREE.MeshStandardMaterial({ color: 0xc96338, roughness: 0.86 }),
  rustLight: new THREE.MeshStandardMaterial({ color: 0xd97a4b, roughness: 0.86 }),
  rustDeep: new THREE.MeshStandardMaterial({ color: 0xa84a2c, roughness: 0.88 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xf8ebd5, roughness: 0.9 }),
  creamSoft: new THREE.MeshStandardMaterial({ color: 0xfff4e2, roughness: 0.92 }),
  chocolate: new THREE.MeshStandardMaterial({ color: 0x4a2b20, roughness: 0.9 }),
  chocolateLight: new THREE.MeshStandardMaterial({ color: 0x5a3425, roughness: 0.9 }),
  nose: new THREE.MeshStandardMaterial({ color: 0x33201a, roughness: 0.7 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x241611, roughness: 0.35, metalness: 0.05 }),
  highlight: new THREE.MeshBasicMaterial({ color: 0xfffdf2, toneMapped: false }),
  blush: new THREE.MeshBasicMaterial({
    color: 0xec8b7a,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    toneMapped: false,
  }),
  bamboo: new THREE.MeshStandardMaterial({ color: 0x91ad55, roughness: 0.85 }),
  bambooDark: new THREE.MeshStandardMaterial({ color: 0x718d43, roughness: 0.9 }),
  tongue: new THREE.MeshStandardMaterial({ color: 0xe98d84, roughness: 0.8 }),
};

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

const UP = new THREE.Vector3(0, 1, 0);

function makeArmBetween(
  a: THREE.Vector3,
  b: THREE.Vector3,
  material: THREE.Material,
  thickness = 0.045,
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(thickness * 0.8, thickness, length, 7);
  const m = new THREE.Mesh(geometry, material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, direction.normalize());
  m.castShadow = false;
  return m;
}

export class PandaActor {
  readonly group = new THREE.Group();
  readonly shadow: THREE.Mesh;
  readonly bodyPivot = new THREE.Group();
  readonly head = new THREE.Group();
  readonly tailRoot = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly eatArms = new THREE.Group();
  readonly legFL = new THREE.Group();
  readonly legFR = new THREE.Group();
  readonly legBL = new THREE.Group();
  readonly legBR = new THREE.Group();
  readonly eyeL = new THREE.Group();
  readonly eyeR = new THREE.Group();
  readonly shoot = new THREE.Group();
  readonly name: string;

  action: PandaAction = "idle";
  time = 0;
  frozen = false;
  blinkValue = 1;

  private nextBlink = 2.4 + Math.random() * 2.7;
  private blinkStart = -10;
  private target = {
    bodyY: 0.36,
    bodyPitch: 0,
    bodyRoll: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    armLX: 0,
    armLZ: -0.08,
    armRX: 0,
    armRZ: 0.08,
    legFL: 0,
    legFR: 0,
    legBL: 0,
    legBR: 0,
    tailYaw: 0,
    tailPitch: 0.12,
    tailRoll: 0,
    eyeScale: 1,
    shootVisible: false,
  };
  private current = { ...this.target };

  constructor(name = "小熊猫") {
    this.name = name;
    this.group.name = "PandaActor";
    this.group.scale.setScalar(0.95);

    this.group.add(this.bodyPivot);
    this.bodyPivot.position.set(0, 0.36, 0);

    const body = mesh(SPHERE, MAT.rust, 0.33, 0.31, 0.37, 0, 0, 0);
    body.castShadow = false;
    this.bodyPivot.add(body);

    const belly = mesh(SPHERE, MAT.cream, 0.205, 0.19, 0.09, 0, -0.07, 0.31);
    this.bodyPivot.add(belly);

    const chest = mesh(SPHERE, MAT.creamSoft, 0.14, 0.11, 0.055, 0, 0.12, 0.31);
    this.bodyPivot.add(chest);

    this.head.position.set(0, 0.245, 0.2);
    this.bodyPivot.add(this.head);

    const head = mesh(SPHERE, MAT.rust, 0.3, 0.27, 0.27);
    this.head.add(head);

    const cheekTuftL = mesh(SPHERE, MAT.rustLight, 0.07, 0.085, 0.05, -0.265, -0.02, 0.03);
    const cheekTuftR = cheekTuftL.clone();
    cheekTuftR.position.x = 0.265;
    this.head.add(cheekTuftL, cheekTuftR);

    const muzzle = mesh(SPHERE, MAT.creamSoft, 0.145, 0.105, 0.105, 0, -0.045, 0.232);
    this.head.add(muzzle);

    const nose = mesh(SPHERE, MAT.nose, 0.032, 0.025, 0.026, 0, 0.005, 0.326);
    this.head.add(nose);

    const mouth = mesh(SPHERE, MAT.nose, 0.033, 0.009, 0.012, 0, -0.09, 0.31);
    this.head.add(mouth);
    const mouthL = mesh(SPHERE, MAT.nose, 0.014, 0.007, 0.01, -0.024, -0.1, 0.309);
    const mouthR = mouthL.clone();
    mouthR.position.x = 0.024;
    this.head.add(mouthL, mouthR);

    const tongue = mesh(SPHERE, MAT.tongue, 0.022, 0.01, 0.012, 0, -0.1, 0.316);
    this.head.add(tongue);

    // Cream eye patches, angled down and out so the face reads gentle.
    const patchL = mesh(SPHERE, MAT.cream, 0.093, 0.125, 0.032, -0.115, 0.055, 0.228);
    patchL.rotation.z = -0.3;
    const patchR = mesh(SPHERE, MAT.cream, 0.093, 0.125, 0.032, 0.115, 0.055, 0.228);
    patchR.rotation.z = 0.3;
    this.head.add(patchL, patchR);

    const browL = mesh(SPHERE, MAT.creamSoft, 0.045, 0.021, 0.016, -0.115, 0.16, 0.236);
    browL.rotation.z = -0.26;
    const browR = browL.clone();
    browR.position.x = 0.115;
    browR.rotation.z = 0.26;
    this.head.add(browL, browR);

    this.eyeL.position.set(-0.115, 0.05, 0.258);
    this.eyeR.position.set(0.115, 0.05, 0.258);
    this.head.add(this.eyeL, this.eyeR);
    for (const eye of [this.eyeL, this.eyeR]) {
      const ball = mesh(EYE, MAT.eye, 0.047, 0.061, 0.038);
      eye.add(ball);
      const h1 = mesh(SMALL_SPHERE, MAT.highlight, 0.015, 0.019, 0.012, -0.012, 0.018, 0.033);
      const h2 = mesh(SMALL_SPHERE, MAT.highlight, 0.007, 0.009, 0.006, 0.017, -0.014, 0.035);
      eye.add(h1, h2);
    }

    const blushL = mesh(SPHERE, MAT.blush, 0.062, 0.032, 0.018, -0.205, -0.055, 0.19);
    blushL.rotation.z = -0.16;
    const blushR = blushL.clone();
    blushR.position.x = 0.205;
    blushR.rotation.z = 0.16;
    this.head.add(blushL, blushR);

    // Ears with cream rims and soft tufts.
    for (const side of [-1, 1] as const) {
      const ear = mesh(SPHERE, MAT.rustDeep, 0.105, 0.115, 0.06, side * 0.205, 0.19, 0.02);
      ear.rotation.z = side * 0.12;
      this.head.add(ear);
      const inner = mesh(SPHERE, MAT.cream, 0.062, 0.072, 0.025, side * 0.205, 0.19, 0.062);
      inner.rotation.z = side * 0.12;
      this.head.add(inner);
      const tuft = mesh(SPHERE, MAT.creamSoft, 0.02, 0.03, 0.018, side * 0.235, 0.265, 0.028);
      tuft.rotation.z = side * 0.35;
      this.head.add(tuft);
    }

    // Arms.
    this.armL.position.set(-0.27, 0.015, 0.13);
    this.armR.position.set(0.27, 0.015, 0.13);
    this.bodyPivot.add(this.armL, this.armR);
    for (const [arm, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      const limb = mesh(CAPSULE, MAT.chocolate, 1, 1, 1, 0, -0.1, 0);
      arm.add(limb);
      const paw = mesh(SPHERE, MAT.chocolateLight, 0.067, 0.052, 0.078, 0, -0.21, 0.025);
      arm.add(paw);
      arm.rotation.z = side * 0.08;
    }

    // A dedicated pair of longer arms for the eating pose. The regular stubby
    // arms stay hidden then, so the shoot reads as held rather than floating.
    const eatShoulderL = new THREE.Vector3(-0.235, 0.1, 0.21);
    const eatShoulderR = new THREE.Vector3(0.235, 0.1, 0.21);
    const eatPawL = new THREE.Vector3(-0.09, -0.14, 0.39);
    const eatPawR = new THREE.Vector3(0.09, -0.14, 0.39);
    this.eatArms.add(
      makeArmBetween(eatShoulderL, eatPawL, MAT.chocolate),
      makeArmBetween(eatShoulderR, eatPawR, MAT.chocolate),
    );
    for (const pawPoint of [eatPawL, eatPawR]) {
      const paw = mesh(SPHERE, MAT.chocolateLight, 0.052, 0.044, 0.058, pawPoint.x, pawPoint.y, pawPoint.z);
      this.eatArms.add(paw);
    }
    this.bodyPivot.add(this.eatArms);
    this.eatArms.visible = false;

    // Legs.
    this.legFL.position.set(-0.17, -0.16, 0.13);
    this.legFR.position.set(0.17, -0.16, 0.13);
    this.legBL.position.set(-0.17, -0.16, -0.14);
    this.legBR.position.set(0.17, -0.16, -0.14);
    this.bodyPivot.add(this.legFL, this.legFR, this.legBL, this.legBR);
    for (const leg of [this.legFL, this.legFR, this.legBL, this.legBR]) {
      const limb = mesh(CAPSULE, MAT.chocolate, 0.9, 1, 0.9, 0, -0.09, 0);
      leg.add(limb);
      const paw = mesh(SPHERE, MAT.chocolateLight, 0.075, 0.045, 0.095, 0, -0.19, 0.025);
      leg.add(paw);
    }

    // Ringed tail.
    this.tailRoot.position.set(0, 0.02, -0.31);
    this.bodyPivot.add(this.tailRoot);
    const tailPoints: Array<[number, number, number, number]> = [
      [0, 0.01, -0.02, 0.105],
      [0.045, 0.075, -0.11, 0.108],
      [0.125, 0.135, -0.18, 0.103],
      [0.22, 0.16, -0.21, 0.093],
      [0.31, 0.135, -0.18, 0.081],
      [0.365, 0.09, -0.12, 0.069],
      [0.375, 0.045, -0.05, 0.057],
      [0.34, 0.015, 0.02, 0.048],
    ];
    tailPoints.forEach(([x, y, z, size], index) => {
      const material = index % 2 === 0 ? MAT.rust : MAT.rustDeep;
      const puff = mesh(SPHERE, material, size, size * 0.82, size, x, y, z);
      this.tailRoot.add(puff);
    });
    const tailTip = mesh(SPHERE, MAT.rustDeep, 0.05, 0.04, 0.05, 0.31, 0.005, 0.06);
    this.tailRoot.add(tailTip);

    // Bamboo shoot held while eating.
    this.shoot.position.set(0, -0.22, 0.34);
    this.shoot.rotation.set(0.78, 0.2, 0.1);
    this.bodyPivot.add(this.shoot);
    const shootStem = mesh(
      new THREE.CylinderGeometry(0.024, 0.032, 0.28, 7),
      MAT.bamboo,
      1,
      1,
      1,
      0,
      0.09,
      0,
    );
    this.shoot.add(shootStem);
    for (let i = 0; i < 3; i += 1) {
      const leaf = mesh(new THREE.ConeGeometry(0.045, 0.16, 4), MAT.bambooDark, 1, 1, 1, 0, 0.17 + i * 0.035, 0);
      leaf.rotation.set(i * 0.8, i * 1.5, 0.5);
      this.shoot.add(leaf);
    }
    this.shoot.visible = false;

    this.shadow = makeBlobShadow(1.15, 0.86, 0.34, 0x37261b);
    this.shadow.position.y = 0.014;
    this.shadow.name = "PandaBlobShadow";

    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });

    this.applyPose(1);
  }

  setAction(action: PandaAction, immediate = false): void {
    this.action = action;
    if (immediate) this.applyPose(1);
  }

  setPosition(x: number, z: number): void {
    this.group.position.set(x, 0, z);
    this.shadow.position.set(x, 0.014, z);
  }

  setScale(scale: number): void {
    this.group.scale.setScalar(scale);
    this.shadow.scale.set(scale, scale, scale);
  }

  setYaw(yaw: number): void {
    this.group.rotation.y = yaw;
  }

  forcePose(action: PandaAction, time: number): void {
    this.action = action;
    this.time = time;
    this.frozen = true;
    this.blinkValue = 1;
    this.applyPose(1);
  }

  update(delta: number): void {
    if (this.frozen) {
      this.applyPose(1);
      return;
    }
    this.time += delta;

    if (this.time > this.nextBlink) {
      this.blinkStart = this.time;
      this.nextBlink = this.time + 2.2 + Math.random() * 3.2;
    }
    const blinkAge = this.time - this.blinkStart;
    if (blinkAge >= 0 && blinkAge < 0.16) {
      const t = blinkAge / 0.16;
      this.blinkValue = 1 - Math.sin(t * Math.PI) * 0.9;
    } else {
      this.blinkValue = 1;
    }

    this.applyPose(1 - Math.exp(-delta * 13));
  }

  private applyPose(blend: number): void {
    const t = this.time;
    const target = this.target;
    let shootVisible = false;

    if (this.action === "walk") {
      const phase = t * 7.2;
      target.bodyY = 0.33;
      target.bodyPitch = 0.3;
      target.bodyRoll = Math.sin(phase * 0.5) * 0.035;
      target.headPitch = -0.26 + Math.sin(phase * 2) * 0.03;
      target.headYaw = Math.sin(t * 0.9) * 0.03;
      target.headRoll = 0;
      target.legFL = Math.sin(phase) * 0.78;
      target.legFR = -Math.sin(phase) * 0.78;
      target.legBL = -Math.sin(phase) * 0.72;
      target.legBR = Math.sin(phase) * 0.72;
      target.armLX = -Math.sin(phase) * 0.42;
      target.armRX = Math.sin(phase) * 0.42;
      target.armLZ = -0.08;
      target.armRZ = 0.08;
      target.tailYaw = Math.sin(phase * 0.55) * 0.34;
      target.tailPitch = 0.2;
      target.tailRoll = 0;
    } else if (this.action === "sit") {
      target.bodyY = 0.3;
      target.bodyPitch = -0.72;
      target.bodyRoll = 0;
      target.headPitch = 0.62;
      target.headYaw = Math.sin(t * 0.5) * 0.09;
      target.headRoll = Math.sin(t * 0.7) * 0.025;
      target.legFL = 0.55;
      target.legFR = 0.55;
      target.legBL = -1.6;
      target.legBR = -1.6;
      target.armLX = -0.08;
      target.armRX = -0.08;
      target.armLZ = -0.12;
      target.armRZ = 0.12;
      target.tailYaw = -0.55 + Math.sin(t * 1.1) * 0.08;
      target.tailPitch = 0.2;
      target.tailRoll = 0;
    } else if (this.action === "eat") {
      target.bodyY = 0.3;
      target.bodyPitch = -0.7;
      target.bodyRoll = 0;
      target.headPitch = 0.58 + Math.sin(t * 8.5) * 0.07;
      target.headYaw = Math.sin(t * 0.7) * 0.025;
      target.headRoll = 0;
      target.legFL = 0.55;
      target.legFR = 0.55;
      target.legBL = -1.6;
      target.legBR = -1.6;
      target.armLX = -1.45;
      target.armRX = -1.45;
      target.armLZ = 0.85;
      target.armRZ = -0.85;
      target.tailYaw = -0.46 + Math.sin(t * 1.3) * 0.06;
      target.tailPitch = 0.18;
      target.tailRoll = 0;
      shootVisible = true;
    } else if (this.action === "wag") {
      target.bodyY = 0.36 + Math.sin(t * 2.4) * 0.004;
      target.bodyPitch = 0.03;
      target.bodyRoll = Math.sin(t * 8.2) * 0.05;
      target.headPitch = 0.02;
      target.headYaw = Math.sin(t * 2.1) * 0.1;
      target.headRoll = Math.sin(t * 4.1) * 0.03;
      target.legFL = 0;
      target.legFR = 0;
      target.legBL = 0;
      target.legBR = 0;
      target.armLX = 0.08;
      target.armRX = -0.08;
      target.armLZ = -0.1;
      target.armRZ = 0.1;
      target.tailYaw = Math.sin(t * 8.8) * 0.82;
      target.tailPitch = 0.16;
      target.tailRoll = 0;
    } else {
      target.bodyY = 0.36 + Math.sin(t * 1.55) * 0.006;
      target.bodyPitch = 0;
      target.bodyRoll = 0;
      target.headPitch = 0.02 + Math.sin(t * 0.75) * 0.02;
      target.headYaw = Math.sin(t * 0.48) * 0.12;
      target.headRoll = Math.sin(t * 0.62) * 0.025;
      target.legFL = 0;
      target.legFR = 0;
      target.legBL = 0;
      target.legBR = 0;
      target.armLX = 0;
      target.armRX = 0;
      target.armLZ = -0.08;
      target.armRZ = 0.08;
      target.tailYaw = Math.sin(t * 1.15) * 0.25;
      target.tailPitch = 0.12;
      target.tailRoll = 0;
    }

    target.eyeScale = this.blinkValue;
    target.shootVisible = shootVisible;

    const cur = this.current;
    const k = Math.min(1, Math.max(0, blend));
    const numericKeys = [
      "bodyY",
      "bodyPitch",
      "bodyRoll",
      "headPitch",
      "headYaw",
      "headRoll",
      "armLX",
      "armLZ",
      "armRX",
      "armRZ",
      "legFL",
      "legFR",
      "legBL",
      "legBR",
      "tailYaw",
      "tailPitch",
      "tailRoll",
      "eyeScale",
    ] as const;
    for (const key of numericKeys) {
      cur[key] = lerp(cur[key], target[key], k);
    }
    cur.shootVisible = target.shootVisible;

    this.bodyPivot.position.y = cur.bodyY;
    this.bodyPivot.rotation.x = cur.bodyPitch;
    this.bodyPivot.rotation.z = cur.bodyRoll;
    this.head.rotation.set(cur.headPitch, cur.headYaw, cur.headRoll);
    this.armL.rotation.set(cur.armLX, 0, cur.armLZ);
    this.armR.rotation.set(cur.armRX, 0, cur.armRZ);
    this.legFL.rotation.x = cur.legFL;
    this.legFR.rotation.x = cur.legFR;
    this.legBL.rotation.x = cur.legBL;
    this.legBR.rotation.x = cur.legBR;
    this.tailRoot.rotation.set(cur.tailPitch, cur.tailYaw, cur.tailRoll);
    this.eyeL.scale.y = cur.eyeScale;
    this.eyeR.scale.y = cur.eyeScale;
    this.shoot.visible = cur.shootVisible;
    this.armL.visible = !cur.shootVisible;
    this.armR.visible = !cur.shootVisible;
    this.eatArms.visible = cur.shootVisible;
    this.shoot.rotation.z = 0.2 + Math.sin(this.time * 7.3) * 0.05;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
