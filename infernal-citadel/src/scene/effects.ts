import * as THREE from "three";
import type { Architecture } from "./architecture";
import type { MaterialLibrary } from "./procedural";
import {
  createBeamMaterial,
  createLavaMaterial,
  makeGlowTexture,
  mulberry32,
} from "./procedural";

export interface Effects {
  update: (elapsed: number) => void;
  lavaMaterial: THREE.ShaderMaterial;
  beamMaterial: THREE.ShaderMaterial;
  root: THREE.Group;
}

export function createEffects(
  architecture: Architecture,
  lib: MaterialLibrary,
): Effects {
  const root = new THREE.Group();
  root.name = "Atmosphere";
  const rand = mulberry32(0xbadc0de);

  /* Lava sea ------------------------------------------------------- */
  const lavaMaterial = createLavaMaterial();
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(190, 190), lavaMaterial);
  lava.name = "LavaSea";
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(0, -8.2, -10);
  lava.receiveShadow = false;
  root.add(lava);

  // Secondary lava shelf closer to the camera to carry the glow into the foreground.
  const foregroundLava = new THREE.Mesh(new THREE.PlaneGeometry(110, 48), lavaMaterial.clone());
  foregroundLava.name = "LavaSeaForeground";
  foregroundLava.rotation.x = -Math.PI / 2;
  foregroundLava.position.set(-3, -8.1, 50);
  root.add(foregroundLava);

  /* Volumetric red beam -------------------------------------------- */
  const beamMaterial = createBeamMaterial();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 0.7, 42, 28, 1, true),
    beamMaterial,
  );
  beam.name = "RitualBeam";
  beam.position.copy(architecture.ritualBeamAnchor);
  beam.position.y += 21;
  beam.renderOrder = 10;
  root.add(beam);

  const beamCoreMaterial = beamMaterial.clone();
  beamCoreMaterial.uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0.86 },
  };
  const beamCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.14, 46, 14, 1, true),
    beamCoreMaterial,
  );
  beamCore.name = "RitualBeamCore";
  beamCore.position.copy(architecture.ritualBeamAnchor);
  beamCore.position.y += 23;
  beamCore.renderOrder = 11;
  root.add(beamCore);

  const beamGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture("255, 52, 16"),
      color: 0xff3b12,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  beamGlow.name = "RitualBeamGlow";
  beamGlow.position.copy(architecture.ritualBeamAnchor);
  beamGlow.position.y += 2.0;
  beamGlow.scale.set(18, 7.5, 1);
  root.add(beamGlow);

  // A broad crimson halo behind the sanctum, visible above the facade line.
  const portalHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture("150, 8, 6"),
      color: 0xc11f10,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  portalHalo.name = "PortalHalo";
  portalHalo.position.set(0, 23, -48);
  portalHalo.scale.set(54, 33, 1);
  root.add(portalHalo);

  /* Background haze ------------------------------------------------ */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(170, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          float h = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
          vec3 top = vec3(0.012, 0.006, 0.008);
          vec3 mid = vec3(0.085, 0.012, 0.015);
          vec3 low = vec3(0.22, 0.025, 0.018);
          vec3 col = mix(low, mid, smoothstep(0.0, 0.34, h));
          col = mix(col, top, smoothstep(0.42, 0.96, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  sky.name = "SkyDome";
  sky.position.z = -12;
  root.add(sky);

  // Layered vapour sprites. They are deliberately broad and low contrast.
  const haze: Array<{ sprite: THREE.Sprite; baseX: number; baseY: number; speed: number; phase: number }> = [];
  const hazePositions: Array<[number, number, number, number, number]> = [
    [-26, 2.5, -22, 38, 18],
    [28, 3.2, -18, 42, 20],
    [0, 1.5, -48, 46, 24],
    [-42, 1.0, 8, 36, 16],
    [42, 0.6, 22, 34, 16],
    [0, 9.0, -39, 30, 14],
    [-8, -2.0, 24, 44, 15],
    [14, -1.0, 38, 38, 13],
    [0, 15.0, -60, 60, 26],
  ];
  hazePositions.forEach(([x, y, z, w, h], i) => {
    const material = lib.smoke.clone();
    material.opacity = 0.11 + (i % 3) * 0.035;
    material.rotation = rand() * Math.PI;
    const sprite = new THREE.Sprite(material);
    sprite.name = "HazeVapour";
    sprite.position.set(x, y, z);
    sprite.scale.set(w, h, 1);
    root.add(sprite);
    haze.push({
      sprite,
      baseX: x,
      baseY: y,
      speed: 0.04 + rand() * 0.05,
      phase: rand() * Math.PI * 2,
    });
  });

  /* Embers --------------------------------------------------------- */
  const emberCount = 980;
  const emberPositions = new Float32Array(emberCount * 3);
  const emberColors = new Float32Array(emberCount * 3);
  const emberVelocity = new Float32Array(emberCount * 3);
  const emberLife = new Float32Array(emberCount);
  const emberBase = new Float32Array(emberCount * 3);
  const colorA = new THREE.Color(0xff2b06);
  const colorB = new THREE.Color(0xffb35a);

  const resetEmber = (i: number): void => {
    const side = rand() > 0.44 ? 1 : -1;
    const x = side * (4 + rand() * 34);
    const z = -46 + rand() * 86;
    const y = -6 + rand() * 20;
    emberBase[i * 3] = x;
    emberBase[i * 3 + 1] = y;
    emberBase[i * 3 + 2] = z;
    emberPositions[i * 3] = x;
    emberPositions[i * 3 + 1] = y;
    emberPositions[i * 3 + 2] = z;
    emberVelocity[i * 3] = (rand() - 0.5) * 0.24;
    emberVelocity[i * 3 + 1] = 0.32 + rand() * 1.1;
    emberVelocity[i * 3 + 2] = (rand() - 0.5) * 0.2;
    emberLife[i] = rand();
    const c = colorA.clone().lerp(colorB, rand() * 0.8);
    emberColors[i * 3] = c.r;
    emberColors[i * 3 + 1] = c.g;
    emberColors[i * 3 + 2] = c.b;
  };

  for (let i = 0; i < emberCount; i += 1) resetEmber(i);

  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute("position", new THREE.BufferAttribute(emberPositions, 3));
  emberGeometry.setAttribute("color", new THREE.BufferAttribute(emberColors, 3));
  const emberMaterial = new THREE.PointsMaterial({
    size: 0.22,
    map: makeGlowTexture("255, 86, 28"),
    vertexColors: true,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const embers = new THREE.Points(emberGeometry, emberMaterial);
  embers.frustumCulled = false;
  root.add(embers);

  const ashCount = 320;
  const ashPositions = new Float32Array(ashCount * 3);
  for (let i = 0; i < ashCount; i += 1) {
    ashPositions[i * 3] = (rand() - 0.5) * 96;
    ashPositions[i * 3 + 1] = rand() * 26 + 1;
    ashPositions[i * 3 + 2] = (rand() - 0.5) * 110;
  }
  const ashGeometry = new THREE.BufferGeometry();
  ashGeometry.setAttribute("position", new THREE.BufferAttribute(ashPositions, 3));
  const ashMaterial = new THREE.PointsMaterial({
    size: 0.055,
    color: 0x9b7468,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const ash = new THREE.Points(ashGeometry, ashMaterial);
  ash.frustumCulled = false;
  root.add(ash);

  /* Reusable red light pools --------------------------------------- */
  const lavaLights: Array<THREE.PointLight> = [];
  for (const anchor of architecture.lavaAnchors) {
    const light = new THREE.PointLight(0xff2b09, 300, 34, 2);
    light.position.copy(anchor);
    light.position.y += 3.2;
    root.add(light);
    lavaLights.push(light);
  }

  const update = (elapsed: number): void => {
    lavaMaterial.uniforms.uTime.value = elapsed;
    (foregroundLava.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed + 7.3;
    beamMaterial.uniforms.uTime.value = elapsed;
    beamCoreMaterial.uniforms.uTime.value = elapsed;

    const flicker = 0.86 + Math.sin(elapsed * 2.7) * 0.055 + Math.sin(elapsed * 7.9) * 0.025;
    beamMaterial.uniforms.uOpacity.value = flicker;
    beamCoreMaterial.uniforms.uOpacity.value = 0.82 + Math.sin(elapsed * 3.1) * 0.12;
    beamGlow.material.opacity = 0.68 + Math.sin(elapsed * 2.3) * 0.12;
    beamGlow.scale.setScalar(1 + Math.sin(elapsed * 1.9) * 0.035);

    lavaLights.forEach((light, i) => {
      light.intensity = 250 + Math.sin(elapsed * (1.3 + i * 0.15) + i) * 45;
    });

    const positions = emberGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < emberCount; i += 1) {
      emberLife[i] += 0.0022;
      if (emberLife[i] > 1) {
        emberLife[i] = 0;
        resetEmber(i);
      }
      positions[i * 3] += emberVelocity[i * 3] * 0.012;
      positions[i * 3 + 1] += emberVelocity[i * 3 + 1] * 0.012;
      positions[i * 3 + 2] += emberVelocity[i * 3 + 2] * 0.012;
      if (positions[i * 3 + 1] > 26) {
        emberLife[i] = 1;
      }
    }
    emberGeometry.attributes.position.needsUpdate = true;

    const ashPos = ashGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < ashCount; i += 1) {
      ashPos[i * 3 + 1] -= 0.011;
      ashPos[i * 3] += Math.sin(elapsed * 0.2 + i) * 0.0025;
      if (ashPos[i * 3 + 1] < -4) {
        ashPos[i * 3 + 1] = 26;
        ashPos[i * 3] = (rand() - 0.5) * 96;
      }
    }
    ashGeometry.attributes.position.needsUpdate = true;

    haze.forEach(({ sprite, baseX, baseY, speed, phase }, i) => {
      sprite.position.x = baseX + Math.sin(elapsed * speed + phase) * (2.6 + i * 0.35);
      sprite.position.y = baseY + Math.sin(elapsed * speed * 1.4 + phase * 2) * 0.8;
      const material = sprite.material as THREE.SpriteMaterial;
      material.rotation += 0.0006;
    });
  };

  return { update, lavaMaterial, beamMaterial, root };
}
