import * as THREE from "three";
import type { Architecture } from "./architecture";
import type { MaterialLibrary } from "./procedural";
import { makeFlameTexture, mulberry32, setShadow } from "./procedural";

interface Flame {
  sprite: THREE.Sprite;
  baseScale: number;
  phase: number;
  light?: THREE.PointLight;
  baseIntensity?: number;
}

export interface Props {
  root: THREE.Group;
  update: (elapsed: number) => void;
  flameCount: number;
}

export function createProps(
  architecture: Architecture,
  lib: MaterialLibrary,
): Props {
  const root = new THREE.Group();
  root.name = "PropsAndVotives";
  const rand = mulberry32(0xc0ffee);
  const flames: Flame[] = [];
  const flameTexture = makeFlameTexture();

  /* ------------------------------------------------------------------ */
  /* Shared fire and candle helpers                                     */
  /* ------------------------------------------------------------------ */

  const addFlame = (
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    scale = 0.45,
    withLight = false,
    lightIntensity = 15,
  ): Flame => {
    const material = new THREE.SpriteMaterial({
      map: flameTexture,
      color: 0xffb25e,
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(scale * 0.7, scale * 1.5, 1);
    parent.add(sprite);
    const flame: Flame = {
      sprite,
      baseScale: scale,
      phase: rand() * Math.PI * 2,
    };

    if (withLight) {
      const light = new THREE.PointLight(0xff6a27, lightIntensity, 13, 2);
      light.position.set(x, y + 0.07, z);
      parent.add(light);
      flame.light = light;
      flame.baseIntensity = lightIntensity;
    }
    flames.push(flame);
    return flame;
  };

  const candleGeometry = new THREE.CylinderGeometry(0.075, 0.095, 1, 7);
  const candleCluster = (
    x: number,
    z: number,
    y: number,
    count: number,
    spread: number,
    scale = 1,
    withLight = false,
  ): void => {
    for (let i = 0; i < count; i += 1) {
      const angle = rand() * Math.PI * 2;
      const radius = Math.sqrt(rand()) * spread;
      const cx = x + Math.cos(angle) * radius;
      const cz = z + Math.sin(angle) * radius;
      const h = (0.28 + rand() * 1.45) * scale;
      const candle = new THREE.Mesh(candleGeometry, lib.wax);
      candle.scale.set(scale, h, scale);
      candle.position.set(cx, y + h / 2, cz);
      candle.castShadow = false;
      candle.receiveShadow = true;
      root.add(candle);

      // A small melted pool at the base.
      if (rand() > 0.55) {
        const pool = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13 * scale, 0.19 * scale, 0.035, 7),
          lib.wax,
        );
        pool.position.set(cx, y + 0.018, cz);
        root.add(pool);
      }
      addFlame(root, cx, y + h + 0.11 * scale, cz, 0.2 * scale, false);
    }
    if (withLight) {
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: lib.glow.map,
          color: 0xff7c3b,
          transparent: true,
          opacity: 0.3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      glow.position.set(x, y + 1.1, z);
      glow.scale.set(6 * scale, 4 * scale, 1);
      root.add(glow);
      const light = new THREE.PointLight(0xff7c3b, 130, 11, 2);
      light.position.set(x, y + 1.5, z);
      root.add(light);
    }
  };

  const torchPost = (
    x: number,
    z: number,
    y: number,
    withLight = false,
    rotationY = 0,
  ): void => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotationY;
    root.add(g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.1, 3.1, 7), lib.iron);
    pole.position.y = 1.55;
    pole.castShadow = true;
    g.add(pole);
    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.8, 6), lib.iron);
    bracket.rotation.z = Math.PI / 2;
    bracket.position.set(0.32, 3.0, 0);
    g.add(bracket);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.18, 0.3, 10), lib.bronze);
    cup.position.set(0.7, 3.12, 0);
    cup.castShadow = true;
    g.add(cup);

    const light = new THREE.PointLight(0xff7a34, withLight ? 180 : 0, 9, 2);
    light.position.set(0.7, 3.65, 0);
    g.add(light);
    const f = addFlame(g, 0.7, 3.53, 0, 0.43, false);
    f.light = light;
    f.baseIntensity = 180;

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: lib.glow.map,
        color: 0xff7333,
        transparent: true,
        opacity: withLight ? 0.34 : 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    glow.position.set(0.7, 3.7, 0);
    glow.scale.set(3.8, 3.2, 1);
    g.add(glow);
  };

  const brazier = (
    x: number,
    z: number,
    y: number,
    scale = 1,
    withLight = true,
  ): void => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    root.add(g);

    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95 * scale, 0.42 * scale, 0.55 * scale, 12),
      lib.bronze,
    );
    bowl.position.y = 1.8 * scale;
    bowl.castShadow = true;
    g.add(bowl);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.93 * scale, 0.09 * scale, 6, 18),
      lib.iron,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 2.06 * scale;
    g.add(rim);
    const coals = new THREE.Mesh(
      new THREE.CylinderGeometry(0.79 * scale, 0.79 * scale, 0.08, 12),
      new THREE.MeshBasicMaterial({ color: 0xff3d0c, toneMapped: false }),
    );
    coals.position.y = 2.05 * scale;
    g.add(coals);

    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2 + 0.25;
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * scale, 0.1 * scale, 1.8 * scale, 5),
        lib.iron,
      );
      leg.position.set(Math.cos(a) * 0.54 * scale, 0.9 * scale, Math.sin(a) * 0.54 * scale);
      leg.rotation.z = Math.cos(a) * 0.13;
      leg.rotation.x = -Math.sin(a) * 0.13;
      leg.castShadow = true;
      g.add(leg);
    }
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6 * scale, 0.75 * scale, 0.18, 6),
      lib.stoneDark,
    );
    base.position.y = 0.09 * scale;
    g.add(base);

    for (let i = 0; i < 3; i += 1) {
      const f = addFlame(
        g,
        (rand() - 0.5) * 0.65 * scale,
        2.2 * scale + rand() * 0.3,
        (rand() - 0.5) * 0.65 * scale,
        0.55 * scale,
        false,
      );
      if (i === 0) {
        f.light = withLight
          ? (() => {
              const light = new THREE.PointLight(0xff5d1d, 300, 14, 2);
              light.position.y = 2.8 * scale;
              g.add(light);
              return light;
            })()
          : undefined;
        f.baseIntensity = 300;
      }
    }

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: lib.glow.map,
        color: 0xff6825,
        transparent: true,
        opacity: withLight ? 0.42 : 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    glow.position.y = 2.45 * scale;
    glow.scale.set(6.6 * scale, 5.2 * scale, 1);
    g.add(glow);
  };

  const candelabra = (
    x: number,
    z: number,
    baseY: number,
    scale = 1,
    withLight = true,
  ): void => {
    const g = new THREE.Group();
    g.position.set(x, baseY, z);
    root.add(g);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42 * scale, 0.65 * scale, 0.25, 8),
      lib.stoneDark,
    );
    base.position.y = 0.12 * scale;
    g.add(base);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055 * scale, 0.085 * scale, 3.9 * scale, 7),
      lib.iron,
    );
    pole.position.y = 2.0 * scale;
    pole.castShadow = true;
    g.add(pole);

    const armLengths = [2.1, 1.35, 0.8];
    const armHeights = [3.55, 3.95, 4.25];
    armLengths.forEach((length, armIndex) => {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(length * scale, 0.06 * scale, 0.06 * scale),
        lib.iron,
      );
      arm.position.y = armHeights[armIndex] * scale;
      arm.rotation.y = armIndex * 0.6;
      g.add(arm);
      for (const side of [-1, 1]) {
        const px = Math.cos(armIndex * 0.6) * side * length * 0.5 * scale;
        const pz = -Math.sin(armIndex * 0.6) * side * length * 0.5 * scale;
        const cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16 * scale, 0.09 * scale, 0.16 * scale, 8),
          lib.bronze,
        );
        cup.position.set(px, armHeights[armIndex] * scale + 0.1, pz);
        g.add(cup);
        const candle = new THREE.Mesh(candleGeometry, lib.wax);
        const h = (0.35 + rand() * 0.35) * scale;
        candle.scale.set(0.55 * scale, h, 0.55 * scale);
        candle.position.set(px, armHeights[armIndex] * scale + 0.16 + h / 2, pz);
        g.add(candle);
        addFlame(
          g,
          px,
          armHeights[armIndex] * scale + 0.22 + h,
          pz,
          0.2 * scale,
          false,
        );
      }
    });

    // Central candle.
    const tallest = new THREE.Mesh(candleGeometry, lib.wax);
    tallest.scale.set(0.65 * scale, 1.0 * scale, 0.65 * scale);
    tallest.position.y = 4.55 * scale;
    g.add(tallest);
    addFlame(g, 0, 5.12 * scale, 0, 0.24 * scale, false);

    if (withLight) {
      const light = new THREE.PointLight(0xff7c36, 165, 12, 2);
      light.position.set(0, 4.6 * scale, 0);
      g.add(light);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: lib.glow.map,
          color: 0xff7c36,
          transparent: true,
          opacity: 0.26,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      glow.position.y = 4.7 * scale;
      glow.scale.set(4.6, 4.2, 1);
      g.add(glow);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Winged sentinels                                                   */
  /* ------------------------------------------------------------------ */

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.55, 1.4, 1.15, 2.15);
  wingShape.quadraticCurveTo(2.2, 2.9, 3.25, 2.85);
  wingShape.lineTo(2.45, 1.78);
  wingShape.lineTo(3.3, 0.58);
  wingShape.quadraticCurveTo(2.55, 0.9, 1.92, 1.02);
  wingShape.lineTo(1.0, 0.08);
  wingShape.quadraticCurveTo(0.75, -0.36, 0.35, -0.52);
  wingShape.closePath();
  const wingGeometry = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    curveSegments: 8,
  });
  wingGeometry.translate(0, 0, -0.06);

  const createWingedSentinel = (
    x: number,
    z: number,
    baseY: number,
    rotationY = 0,
    scale = 1,
    sword = true,
  ): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, baseY, z);
    g.rotation.y = rotationY;
    g.scale.setScalar(scale);
    root.add(g);

    // Plinth.
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 2.2), lib.stoneDark);
    plinth.position.y = 0.75;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    g.add(plinth);
    const plinthCap = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.24, 2.45), lib.trim);
    plinthCap.position.y = 1.58;
    plinthCap.castShadow = true;
    g.add(plinthCap);
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.7, 1.45), lib.stoneAlt);
    pedestal.position.y = 1.95;
    g.add(pedestal);

    const body = new THREE.Group();
    body.position.y = 2.3;
    g.add(body);

    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.88, 2.6, 7), lib.stoneDark);
    robe.position.y = 1.3;
    robe.castShadow = true;
    body.add(robe);
    const robeHem = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.02, 0.18, 7), lib.stoneAlt);
    robeHem.position.y = 0.09;
    body.add(robeHem);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 0.62), lib.stoneDark);
    chest.position.y = 2.67;
    chest.rotation.z = 0.02;
    chest.castShadow = true;
    body.add(chest);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.63, 10, 7), lib.stoneDark);
    shoulders.position.y = 3.18;
    shoulders.scale.set(1.42, 0.42, 0.9);
    shoulders.castShadow = true;
    body.add(shoulders);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.23, 0.35, 7), lib.stoneDark);
    neck.position.y = 3.44;
    body.add(neck);

    // Hood + head + horns.
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.47, 1.15, 7), lib.stoneDark);
    hood.position.y = 3.88;
    hood.rotation.x = 0.09;
    hood.castShadow = true;
    body.add(hood);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.31, 9, 7), lib.black);
    face.position.set(0, 3.65, 0.17);
    face.scale.z = 0.75;
    body.add(face);

    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.82, 5), lib.stoneDark);
      horn.position.set(side * 0.3, 4.2, 0.02);
      horn.rotation.z = side * 0.42;
      horn.rotation.x = -0.1;
      body.add(horn);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.047, 6, 5), lib.crimsonGlow);
      eye.position.set(side * 0.115, 3.72, 0.39);
      body.add(eye);
    }

    // Bat wings, folded high behind the shoulders so the silhouette stays tall.
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(wingGeometry, lib.stoneDark);
      wing.scale.set(side * 0.86, 1.55, 1);
      wing.position.set(side * 0.36, 3.2, -0.12);
      wing.rotation.y = side * -0.62;
      wing.rotation.z = side * 0.55;
      wing.castShadow = true;
      body.add(wing);

      for (let i = 0; i < 3; i += 1) {
        const rib = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.055, 2.3 + i * 0.35, 4),
          lib.iron,
        );
        rib.position.set(side * (0.62 + i * 0.34), 3.2 + i * 0.55, 0.04);
        rib.rotation.z = side * (-1.0 - i * 0.14);
        body.add(rib);
      }
    }

    // Arms and downward sword.
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 1.3, 6), lib.stoneDark);
      arm.position.set(side * 0.52, 2.7, 0.28);
      arm.rotation.z = side * -0.3;
      arm.rotation.x = 0.14;
      arm.castShadow = true;
      body.add(arm);
    }

    if (sword) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.45, 0.055), lib.iron);
      blade.position.set(0, 1.82, 0.57);
      blade.castShadow = true;
      body.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 4), lib.iron);
      tip.rotation.z = Math.PI;
      tip.position.set(0, 0.47, 0.57);
      body.add(tip);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.13, 0.16), lib.bronze);
      guard.position.set(0, 3.07, 0.57);
      body.add(guard);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.7, 6), lib.iron);
      grip.position.set(0, 3.47, 0.57);
      body.add(grip);
      const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), lib.bronze);
      pommel.position.set(0, 3.88, 0.57);
      body.add(pommel);

      // Blood groove catches the red light.
      const groove = new THREE.Mesh(
        new THREE.PlaneGeometry(0.045, 1.75),
        new THREE.MeshBasicMaterial({
          color: 0x7d0d06,
          transparent: true,
          opacity: 0.6,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      groove.position.set(0, 1.95, 0.602);
      body.add(groove);
    }

    // Tattered cloak tail.
    const cloakGeo = new THREE.PlaneGeometry(1.4, 2.1, 4, 7);
    const pos = cloakGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      pos.setZ(i, Math.sin(px * 3.4 + py * 2.2) * 0.1);
      if (py < -0.7) pos.setX(i, px * (1 + (-py - 0.7) * 0.28));
    }
    cloakGeo.computeVertexNormals();
    const cloak = new THREE.Mesh(
      cloakGeo,
      new THREE.MeshStandardMaterial({
        color: 0x140c0d,
        roughness: 0.94,
        metalness: 0.04,
        side: THREE.DoubleSide,
      }),
    );
    cloak.position.set(0, 1.75, -0.54);
    cloak.castShadow = true;
    body.add(cloak);

    setShadow(g, true, true);
    return g;
  };

  // Gate guardians.
  createWingedSentinel(-7.6, 23.2, 4.2, 0.02, 0.92);
  createWingedSentinel(7.6, 23.2, 4.2, -0.02, 0.92);
  // Sanctum guardians.
  createWingedSentinel(-10.4, -29.4, 5.2, 0.12, 1.22);
  createWingedSentinel(10.4, -29.4, 5.2, -0.12, 1.22);
  // Ward sentinels.
  createWingedSentinel(-11.0, 11.8, 1.15, 0.55, 0.74, false);
  createWingedSentinel(28.0, 8.6, 1.3, -0.8, 0.8);
  createWingedSentinel(-31.0, 7.5, 1.7, 1.2, 0.9);
  // Mid-nave guardians stand on the bridge piers, visible from the hero view.
  createWingedSentinel(-7.4, 10.9, 2.55, 0.05, 1.05);
  createWingedSentinel(7.4, 10.9, 2.55, -0.05, 1.05);
  createWingedSentinel(-6.4, -24.9, 3.2, 0.0, 1.0);
  createWingedSentinel(6.4, -24.9, 3.2, 0.0, 1.0);

  /* ------------------------------------------------------------------ */
  /* The gargoyle                                                        */
  /* ------------------------------------------------------------------ */

  const gargoyle = new THREE.Group();
  gargoyle.position.copy(architecture.gargoylePerch);
  gargoyle.rotation.y = 0.35;
  gargoyle.scale.setScalar(1.35);
  root.add(gargoyle);

  const bodyG = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 9), lib.stoneDark);
  bodyG.scale.set(1.05, 0.95, 1.35);
  bodyG.position.y = 1.2;
  bodyG.rotation.x = 0.25;
  bodyG.castShadow = true;
  gargoyle.add(bodyG);
  const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), lib.stoneDark);
  haunch.scale.set(1.5, 0.9, 1.3);
  haunch.position.set(0, 0.5, -0.65);
  haunch.castShadow = true;
  gargoyle.add(haunch);

  const headG = new THREE.Mesh(new THREE.SphereGeometry(0.72, 11, 8), lib.stoneDark);
  headG.position.set(0, 2.35, 0.7);
  headG.scale.set(0.9, 0.85, 1.05);
  headG.castShadow = true;
  gargoyle.add(headG);
  const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 7), lib.stoneDark);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 2.16, 1.45);
  muzzle.castShadow = true;
  gargoyle.add(muzzle);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.24, 0.82), lib.stoneDark);
  jaw.position.set(0, 1.95, 1.38);
  gargoyle.add(jaw);

  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.05, 5), lib.stoneDark);
    horn.position.set(side * 0.43, 2.95, 0.55);
    horn.rotation.z = side * 0.45;
    horn.rotation.x = -0.3;
    gargoyle.add(horn);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.75, 4), lib.stoneDark);
    ear.position.set(side * 0.62, 2.56, 0.42);
    ear.rotation.z = side * 0.9;
    gargoyle.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 6), lib.crimsonGlow);
    eye.position.set(side * 0.23, 2.39, 1.31);
    gargoyle.add(eye);

    // Huge spread bat wings.
    const wing = new THREE.Mesh(wingGeometry, lib.stoneDark);
    wing.scale.set(side * 2.4, 1.95, 1);
    wing.position.set(side * 0.7, 2.0, -0.15);
    wing.rotation.y = side * -0.32;
    wing.rotation.z = side * 0.2;
    wing.castShadow = true;
    gargoyle.add(wing);

    // Forelimbs and claws gripping the parapet.
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.27, 1.4, 6), lib.stoneDark);
    leg.position.set(side * 0.72, 0.45, 0.7);
    leg.rotation.z = side * -0.27;
    gargoyle.add(leg);
    for (let i = 0; i < 3; i += 1) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 5), lib.bone);
      claw.position.set(side * (0.58 + i * 0.16), 0.02, 0.9 + (i - 1) * 0.14);
      claw.rotation.x = 0.5;
      gargoyle.add(claw);
    }
  }

  // Curled tail.
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.75, -1.3),
    new THREE.Vector3(0.65, 0.4, -2.0),
    new THREE.Vector3(1.35, 0.7, -1.6),
    new THREE.Vector3(1.52, 1.35, -0.7),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 14, 0.13, 5, false), lib.stoneDark);
  tail.castShadow = true;
  gargoyle.add(tail);
  setShadow(gargoyle, true, true);

  // A furnace glow behind the gargoyle separates the silhouette from the wall.
  const gargoyleHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: lib.glow.map,
      color: 0x9f1208,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  gargoyleHalo.position.set(-35.0, 12.4, -22.5);
  gargoyleHalo.scale.set(21, 16, 1);
  root.add(gargoyleHalo);

  /* ------------------------------------------------------------------ */
  /* Candles, torches and braziers                                      */
  /* ------------------------------------------------------------------ */

  candleCluster(-24.6, 11.8, 1.15, 12, 1.4, 1.0, true);
  candleCluster(-16.8, 7.2, -0.35, 7, 0.8, 0.9);
  candleCluster(21.4, 3.6, 2.32, 12, 1.2, 1.1, true);
  candleCluster(25.0, 9.7, 2.9, 9, 0.8, 0.8);
  candleCluster(13.0, -0.6, 1.3, 8, 1.1, 1.0);
  candleCluster(-13.2, -19.0, 2.3, 8, 0.9, 0.95);
  candleCluster(19.0, -20.0, 2.3, 8, 0.9, 0.95);
  candleCluster(-27.0, 29.3, 1.35, 13, 1.3, 1.15, true);
  candleCluster(15.8, 32.0, 1.45, 9, 1.0, 0.9);
  candleCluster(-6.9, 16.4, 2.45, 7, 0.5, 0.8);
  candleCluster(6.9, 2.8, 2.45, 7, 0.5, 0.8);
  candleCluster(1.8, -27.4, 3.9, 8, 0.8, 0.95);
  candleCluster(-30.2, 16.5, 1.8, 8, 0.7, 0.8, true);
  candleCluster(-33.6, -8.2, 1.4, 9, 1.0, 1.0, true);
  candleCluster(34.1, -5.0, 1.4, 9, 1.0, 1.0, true);
  candleCluster(33.9, 20.8, 1.4, 8, 0.8, 0.9);
  candleCluster(-33.9, 25.4, 1.4, 8, 0.8, 0.9);
  candleCluster(-24.4, 20.8, 1.15, 10, 1.2, 1.0, true);
  candleCluster(-13.0, 16.0, 1.1, 8, 1.0, 0.9);
  candleCluster(-21.8, -0.4, 1.15, 9, 1.1, 0.95);
  candleCluster(-18.0, -11.5, 2.3, 8, 0.9, 0.95);
  candleCluster(27.4, 1.6, 1.3, 9, 1.1, 1.0, true);
  candleCluster(18.4, 18.4, 1.2, 8, 1.0, 0.9);
  candleCluster(23.2, -11.0, 2.25, 8, 0.9, 0.9);
  candleCluster(14.7, -16.0, 2.25, 7, 0.8, 0.9);
  candleCluster(-9.2, 7.3, 2.55, 6, 0.6, 0.8);
  candleCluster(9.2, 7.3, 2.55, 6, 0.6, 0.8);

  // Cascade of candles down the sanctum steps.
  for (let i = 0; i < 16; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -24.2 - (i % 8) * 1.1;
    const y = 2.45 + Math.floor(i / 8) * 0.8;
    const candle = new THREE.Mesh(candleGeometry, lib.wax);
    const h = 0.55 + rand() * 0.9;
    candle.scale.set(0.8, h, 0.8);
    candle.position.set(side * (4.2 + rand() * 1.0), y + h / 2, z);
    root.add(candle);
    addFlame(root, candle.position.x, y + h + 0.12, z, 0.18);
  }

  // Torch posts along the processional spine.
  const torchZs = [20.2, 12.8, 4.6, -3.2, -11.2, -18.8];
  torchZs.forEach((z, i) => {
    torchPost(-6.3, z, 1.3 + (i % 2) * 0.2, i % 2 === 0, Math.PI / 2);
    torchPost(6.3, z, 1.3 + ((i + 1) % 2) * 0.2, i % 2 === 1, -Math.PI / 2);
  });

  // Courtyard and sanctum braziers.
  brazier(-11.8, -20.2, 2.2, 1.05, true);
  brazier(12.4, -20.8, 2.2, 1.05, true);
  brazier(-8.4, 4.6, 2.55, 0.86, true);
  brazier(8.4, 4.6, 2.55, 0.86, false);
  brazier(-8.4, -4.9, 2.55, 0.82, false);
  brazier(8.4, -4.9, 2.55, 0.82, true);
  brazier(-16.4, 4.8, 1.15, 0.92, true);
  brazier(23.6, 12.8, 1.3, 0.9, false);
  brazier(-7.0, -32.4, 5.25, 1.1, true);
  brazier(7.0, -32.4, 5.25, 1.1, true);
  brazier(25.2, -4.6, 2.3, 0.82, false);

  // Processional candelabra, tall enough to read from the top-down camera.
  candelabra(-5.9, 18.2, 2.5, 1.0, true);
  candelabra(5.9, 18.2, 2.5, 1.0, false);
  candelabra(-5.9, 1.8, 2.5, 1.0, true);
  candelabra(5.9, 1.8, 2.5, 1.0, false);
  candelabra(-5.9, -14.4, 2.5, 0.95, false);
  candelabra(5.9, -14.4, 2.5, 0.95, true);
  candelabra(-6.2, -27.0, 3.8, 0.9, false);
  candelabra(6.2, -27.0, 3.8, 0.9, false);

  // Votive glow pools under selected clusters.
  const poolPositions: Array<[number, number, number, number]> = [
    [-24.6, 1.15, 11.8, 5.2],
    [21.4, 2.32, 3.6, 5.0],
    [-27.0, 1.35, 29.3, 4.6],
    [-30.2, 1.8, 16.5, 4.0],
    [25.0, 2.9, 9.7, 4.2],
  ];
  for (const [x, y, z, size] of poolPositions) {
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: lib.glow.map,
        color: 0xff8d39,
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    glow.position.set(x, y + 1.0, z);
    glow.scale.set(size * 2.0, size * 1.2, 1);
    root.add(glow);
  }

  // Ritual candles in a ring around the pentagram.
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    const radius = 9.4 + rand() * 0.5;
    const x = Math.cos(a) * radius;
    const z = -35.4 + Math.sin(a) * radius * 0.8;
    const h = 0.28 + rand() * 0.85;
    const candle = new THREE.Mesh(candleGeometry, lib.wax);
    candle.scale.set(0.82, h, 0.82);
    candle.position.set(x, 6.72 + h / 2, z);
    root.add(candle);
    addFlame(root, x, 6.72 + h + 0.08, z, 0.16);
  }

  // Eight votive fire-bowls encircling the pentagram.
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 8.7;
    const z = -35.4 + Math.sin(a) * 6.7;
    addFlame(root, x, 7.12, z, 0.42, false);
    addFlame(root, x + 0.13, 7.05, z - 0.08, 0.28, false);
    if (i % 2 === 0) {
      const light = new THREE.PointLight(0xff6726, 140, 12, 2);
      light.position.set(x, 7.8, z);
      root.add(light);
    }
  }

  setShadow(root, true, true);

  const update = (elapsed: number): void => {
    flames.forEach((flame) => {
      const flicker =
        0.88 +
        Math.sin(elapsed * 10.7 + flame.phase) * 0.08 +
        Math.sin(elapsed * 23.3 + flame.phase * 2.0) * 0.035;
      flame.sprite.scale.x = flame.baseScale * 0.72 * flicker;
      flame.sprite.scale.y = flame.baseScale * 1.65 * flicker;
      (flame.sprite.material as THREE.SpriteMaterial).opacity = 0.8 + flicker * 0.12;
      flame.sprite.position.x += Math.sin(elapsed * 1.3 + flame.phase) * 0.0008;
      if (flame.light && flame.baseIntensity) {
        flame.light.intensity =
          flame.baseIntensity *
          (0.82 + Math.sin(elapsed * 8.9 + flame.phase) * 0.12 + Math.sin(elapsed * 17.0 + flame.phase) * 0.06);
      }
    });
  };

  return { root, update, flameCount: flames.length };
}
