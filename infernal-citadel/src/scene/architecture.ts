import * as THREE from "three";
import type { MaterialLibrary } from "./procedural";
import { mulberry32, roughRockGeometry, setShadow } from "./procedural";

export interface Part {
  name: string;
  kind: string;
  description: string;
  group: THREE.Group;
  explodeDir: THREE.Vector3;
}

export interface Architecture {
  root: THREE.Group;
  parts: Part[];
  ritualBeamAnchor: THREE.Vector3;
  pentagramAnchor: THREE.Vector3;
  lavaAnchors: THREE.Vector3[];
  gargoylePerch: THREE.Vector3;
  chasmAnchors: THREE.Vector3[];
}

const DARK = new THREE.Color(0x171316);
void DARK;

export function createArchitecture(lib: MaterialLibrary): Architecture {
  const root = new THREE.Group();
  root.name = "InfernalCitadel";
  const rand = mulberry32(0x51c1ade);
  const parts: Part[] = [];
  const lavaAnchors: THREE.Vector3[] = [];
  const chasmAnchors: THREE.Vector3[] = [];

  const makePart = (
    name: string,
    kind: string,
    description: string,
    explode: [number, number, number],
  ): Part => {
    const group = new THREE.Group();
    group.name = name;
    group.userData.partName = name;
    group.userData.partKind = kind;
    group.userData.partDescription = description;
    group.userData.basePosition = group.position.clone();
    const part: Part = {
      name,
      kind,
      description,
      group,
      explodeDir: new THREE.Vector3(...explode),
    };
    root.add(group);
    parts.push(part);
    return part;
  };

  const addBox = (
    parent: THREE.Object3D,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    rotations?: [number, number, number],
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    if (rotations) mesh.rotation.set(...rotations);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const addCylinder = (
    parent: THREE.Object3D,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    segments: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const addCrenellations = (
    parent: THREE.Object3D,
    x: number,
    z: number,
    length: number,
    topY: number,
    axis: "x" | "z",
    spacing = 1.65,
    width = 0.72,
    height = 0.9,
    depth = 0.55,
    material = lib.stoneAlt,
  ): void => {
    const count = Math.max(2, Math.floor(length / spacing));
    const step = length / count;
    for (let i = 0; i <= count; i += 1) {
      // Weathering: a few merlons are missing, chipped or leaning.
      if (rand() < 0.12) continue;
      const offset = -length / 2 + i * step;
      const jitter = 0.92 + rand() * 0.13;
      const geo = new THREE.BoxGeometry(
        axis === "x" ? width : depth,
        height * jitter,
        axis === "x" ? depth : width,
      );
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(
        axis === "x" ? x + offset : x,
        topY + (height * jitter) / 2,
        axis === "x" ? z : z + offset,
      );
      mesh.rotation.z = (rand() - 0.5) * 0.06;
      mesh.rotation.x = (rand() - 0.5) * 0.03;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  };

  const WALL_HEIGHT_SCALE = 1.25;

  const addWall = (
    parent: THREE.Object3D,
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
    baseY: number,
    axis: "x" | "z",
    crenellated = true,
    material = lib.stone,
  ): THREE.Mesh => {
    const wallHeight = height * WALL_HEIGHT_SCALE;
    const mesh = addBox(
      parent,
      width,
      wallHeight,
      depth,
      x,
      baseY + wallHeight / 2,
      z,
      material,
    );
    addBox(parent, width + 0.18, 0.22, depth + 0.18, x, baseY + 0.11, z, lib.trim);
    addBox(parent, width + 0.28, 0.16, depth + 0.28, x, baseY + wallHeight - 0.1, z, lib.trim);
    if (crenellated) {
      addCrenellations(
        parent,
        x,
        z,
        axis === "x" ? width : depth,
        baseY + wallHeight,
        axis,
      );
    }
    return mesh;
  };

  const addPlatform = (
    parent: THREE.Object3D,
    x: number,
    z: number,
    width: number,
    depth: number,
    topY: number,
    options: {
      floorMaterial?: THREE.Material;
      foundationMaterial?: THREE.Material;
      depthBelow?: number;
      rim?: boolean;
    } = {},
  ): void => {
    const foundationDepth = options.depthBelow ?? Math.abs(topY) + 9.2;
    addBox(
      parent,
      width,
      foundationDepth,
      depth,
      x,
      topY - foundationDepth / 2,
      z,
      options.foundationMaterial ?? lib.stoneDark,
    );
    addBox(
      parent,
      width - 0.12,
      0.22,
      depth - 0.12,
      x,
      topY + 0.02,
      z,
      options.floorMaterial ?? lib.floor,
    );
    if (options.rim !== false) {
      addBox(parent, width + 0.3, 0.26, depth + 0.3, x, topY - 0.05, z, lib.trim);
    }

    // Rough support masses so the platform does not read as a floating cube.
    const massCount = Math.max(2, Math.floor((width * depth) / 90));
    for (let i = 0; i < massCount; i += 1) {
      const rock = new THREE.Mesh(
        roughRockGeometry(900 + Math.floor(rand() * 9999)),
        lib.stoneDark,
      );
      const sx = 1.8 + rand() * 3.4;
      rock.scale.set(sx, 2 + rand() * 3.5, sx * (0.6 + rand()));
      rock.position.set(
        x + (rand() - 0.5) * width * 0.8,
        topY - foundationDepth * (0.55 + rand() * 0.3),
        z + (rand() - 0.5) * depth * 0.8,
      );
      rock.rotation.set(rand(), rand() * Math.PI, rand() * 0.3);
      rock.castShadow = true;
      rock.receiveShadow = true;
      parent.add(rock);
    }
  };

  const addPointedArchFrame = (
    parent: THREE.Object3D,
    x: number,
    z: number,
    baseY: number,
    width: number,
    height: number,
    thickness: number,
    depth: number,
    rotationY = 0,
    material = lib.trim,
  ): THREE.Mesh => {
    const W = width;
    const T = thickness;
    const H = height;
    const spring = H * 0.52;
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2 - T, 0);
    shape.lineTo(-W / 2 - T, spring);
    shape.quadraticCurveTo(-W / 2 - T, H * 0.93, 0, H);
    shape.quadraticCurveTo(W / 2 + T, H * 0.93, W / 2 + T, spring);
    shape.lineTo(W / 2 + T, 0);
    shape.lineTo(W / 2, 0);
    shape.lineTo(W / 2, spring);
    shape.quadraticCurveTo(W / 2, H * 0.8, 0, H - T * 1.1);
    shape.quadraticCurveTo(-W / 2, H * 0.8, -W / 2, spring);
    shape.lineTo(-W / 2, 0);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 14,
    });
    geometry.translate(0, 0, -depth / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, baseY, z);
    mesh.rotation.y = rotationY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);

    // Keystone wedge.
    const keystone = new THREE.Mesh(
      new THREE.BoxGeometry(T * 0.58, T * 1.35, depth + 0.16),
      lib.stoneDark,
    );
    keystone.position.set(0, H - T * 0.5, 0);
    keystone.rotation.z = Math.PI / 4;
    keystone.castShadow = true;
    mesh.add(keystone);

    return mesh;
  };

  const addLancetWindow = (
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    rotationY = 0,
    glow = true,
  ): void => {
    const backing = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.9, height * 0.84),
      glow
        ? new THREE.MeshBasicMaterial({
            color: 0x8f0d06,
            transparent: true,
            opacity: 0.92,
            toneMapped: false,
          })
        : lib.black,
    );
    backing.position.set(x, y + height * 0.46, z);
    backing.rotation.y = rotationY;
    parent.add(backing);

    addPointedArchFrame(
      parent,
      x,
      z,
      y,
      width,
      height,
      0.22,
      0.24,
      rotationY,
      lib.stoneDark,
    );
  };

  const addBattlementedTower = (
    parent: THREE.Object3D,
    x: number,
    z: number,
    baseY: number,
    width: number,
    depth: number,
    height: number,
    options: {
      roof?: boolean;
      spires?: boolean;
      windows?: boolean;
      buttresses?: boolean;
    } = {},
  ): THREE.Group => {
    const tower = new THREE.Group();
    tower.position.set(x, baseY, z);
    parent.add(tower);

    addBox(tower, width, height, depth, 0, height / 2, 0, lib.stone);
    addBox(tower, width + 0.55, 0.75, depth + 0.55, 0, 0.35, 0, lib.stoneDark);
    addBox(tower, width + 0.4, 0.32, depth + 0.4, 0, height * 0.55, 0, lib.trim);
    addBox(tower, width + 0.62, 0.4, depth + 0.62, 0, height - 0.16, 0, lib.trim);

    if (options.buttresses !== false) {
      const corners: Array<[number, number]> = [
        [-width / 2, -depth / 2],
        [width / 2, -depth / 2],
        [-width / 2, depth / 2],
        [width / 2, depth / 2],
      ];
      for (const [cx, cz] of corners) {
        addBox(tower, 0.8, height * 0.94, 0.8, cx, height * 0.47, cz, lib.stoneDark);
        addBox(tower, 1.05, 0.38, 1.05, cx, height * 0.44, cz, lib.trim);
        addBox(tower, 1.0, 0.38, 1.0, cx, height * 0.9, cz, lib.trim);
      }
    }

    // The tower crest: alternating merlons and four corner pinnacles.
    addCrenellations(tower, 0, -depth / 2 + 0.33, width, height, "x", 1.4, 0.74, 1.05, 0.64);
    addCrenellations(tower, 0, depth / 2 - 0.33, width, height, "x", 1.4, 0.74, 1.05, 0.64);
    addCrenellations(tower, -width / 2 + 0.33, 0, depth, height, "z", 1.4, 0.74, 1.05, 0.64);
    addCrenellations(tower, width / 2 - 0.33, 0, depth, height, "z", 1.4, 0.74, 1.05, 0.64);

    if (options.spires !== false) {
      const corners: Array<[number, number]> = [
        [-width / 2 + 0.5, -depth / 2 + 0.5],
        [width / 2 - 0.5, -depth / 2 + 0.5],
        [-width / 2 + 0.5, depth / 2 - 0.5],
        [width / 2 - 0.5, depth / 2 - 0.5],
      ];
      corners.forEach(([cx, cz], i) => {
        const spire = new THREE.Mesh(
          new THREE.ConeGeometry(0.5, 3.2 + (i % 2) * 1.1, 4),
          lib.stoneDark,
        );
        spire.position.set(cx, height + 1.55, cz);
        spire.rotation.y = Math.PI / 4;
        spire.castShadow = true;
        tower.add(spire);
        const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), lib.iron);
        tip.position.set(cx, height + 3.15 + (i % 2) * 0.55, cz);
        tower.add(tip);
      });
    }

    if (options.roof) {
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(width * 0.62, height * 0.3, 4),
        lib.stoneDark,
      );
      roof.position.y = height + height * 0.15;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      tower.add(roof);
    }

    if (options.windows !== false) {
      const winCount = Math.max(1, Math.floor(height / 6));
      for (let i = 0; i < winCount; i += 1) {
        const wy = height * (0.22 + (i / winCount) * 0.5);
        addLancetWindow(tower, 0, wy, depth / 2 + 0.02, 1.15, 2.3, 0, true);
        addLancetWindow(tower, 0, wy, -depth / 2 - 0.02, 1.15, 2.3, Math.PI, false);
      }
    }

    return tower;
  };

  const addBannerPost = (
    parent: THREE.Object3D,
    x: number,
    z: number,
    baseY: number,
    rotationY = 0,
    variant: "cross" | "sigil" | "plain" = "cross",
    scale = 1,
  ): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, baseY, z);
    g.rotation.y = rotationY;
    parent.add(g);

    const pole = addCylinder(g, 0.08, 0.13, 6.4 * scale, 8, 0, 3.2 * scale, 0, lib.iron);
    pole.castShadow = true;
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 5), lib.bronze);
    finial.position.y = 6.8 * scale;
    g.add(finial);
    addBox(g, 2.25 * scale, 0.1, 0.12, 0, 6.1 * scale, 0, lib.iron);
    addBox(g, 0.14, 0.55, 0.14, -1.06 * scale, 6.38 * scale, 0, lib.iron);

    const geo = new THREE.PlaneGeometry(1.95 * scale, 4.4 * scale, 8, 14);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      pos.setZ(i, Math.sin((px / (1.95 * scale)) * Math.PI * 3.3 + py * 1.1) * 0.07 + 0.01);
    }
    geo.computeVertexNormals();
    const banner = new THREE.Mesh(geo, lib.banner[variant]);
    banner.position.set(0, 3.62 * scale, 0.03);
    banner.castShadow = false;
    g.add(banner);

    return g;
  };

  const addChain = (
    parent: THREE.Object3D,
    start: THREE.Vector3,
    end: THREE.Vector3,
    count: number,
    sag = 2.5,
    scale = 1,
  ): void => {
    const tangent = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const linkGeo = new THREE.TorusGeometry(0.54, 0.17, 7, 14);
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      const p = new THREE.Vector3().lerpVectors(start, end, t);
      p.y -= Math.sin(Math.PI * t) * sag;
      p.x += Math.sin(t * 5.7) * 0.08 * scale;
      const nextT = Math.min(1, (i + 1.5) / count);
      const pNext = new THREE.Vector3().lerpVectors(start, end, nextT);
      pNext.y -= Math.sin(Math.PI * nextT) * sag;
      tangent.subVectors(pNext, p).normalize();
      const link = new THREE.Mesh(linkGeo, lib.chain);
      link.position.copy(p);
      link.scale.set(0.8 * scale, 1.38 * scale, 0.52 * scale);
      link.quaternion.setFromUnitVectors(up, tangent);
      link.rotateY(i % 2 === 0 ? Math.PI / 2 : 0);
      link.castShadow = true;
      link.receiveShadow = true;
      parent.add(link);
    }
  };

  /* ================================================================ */
  /* 1. Lava and the foundations                                      */
  /* ================================================================ */

  const abyss = makePart(
    "The Molten Abyss",
    "Primordial chasm system",
    "A slow-moving river of molten rock, 9.5 metres below the lowest ward. Its light is the scene's only broad fill.",
    [0, -4, 0],
  );
  abyss.group.userData.lava = true;

  // Cliff shards emerging from the lava, both near and far.
  const shardCount = 34;
  for (let i = 0; i < shardCount; i += 1) {
    const angle = (i / shardCount) * Math.PI * 2 + rand() * 0.3;
    const radius = 34 + rand() * 42;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.85 - 4;
    const height = 2 + rand() * 11;
    const shard = new THREE.Mesh(
      new THREE.ConeGeometry(0.8 + rand() * 1.8, height, 5 + Math.floor(rand() * 3)),
      lib.stoneDark,
    );
    shard.position.set(x, -8.6 + height / 2, z);
    shard.rotation.y = rand() * Math.PI;
    shard.rotation.z = (rand() - 0.5) * 0.16;
    shard.castShadow = true;
    shard.receiveShadow = true;
    abyss.group.add(shard);
  }
  lavaAnchors.push(new THREE.Vector3(-26, -7.2, 14));
  lavaAnchors.push(new THREE.Vector3(24, -7.2, 8));
  lavaAnchors.push(new THREE.Vector3(0, -7.2, -46));
  lavaAnchors.push(new THREE.Vector3(-34, -7.2, -24));
  lavaAnchors.push(new THREE.Vector3(34, -7.2, 26));

  const foundations = makePart(
    "The Basalt Foundations",
    "Load-bearing masonry",
    "Cyclopean support blocks and broken cliff faces that lift the citadel above the lava sea.",
    [0, 0, 0],
  );
  // Broad support shelves under each ward, exposed as cliff faces at the gaps.
  addBox(foundations.group, 25, 11, 30, -18, -4.0, 7, lib.stoneDark);
  addBox(foundations.group, 23, 12, 30, 19, -4.4, 1, lib.stoneDark);
  addBox(foundations.group, 24, 10, 22, -21, -2.4, -23, lib.stoneDark);
  addBox(foundations.group, 22, 10, 22, 22, -2.8, -23, lib.stoneDark);
  addBox(foundations.group, 12, 12, 66, 0, -4.8, 0, lib.stoneDark);
  addBox(foundations.group, 20, 11, 20, -22, -4.3, 30, lib.stoneDark);
  addBox(foundations.group, 20, 11, 20, 23, -4.3, 30, lib.stoneDark);

  for (let i = 0; i < 58; i += 1) {
    const side = rand() > 0.5 ? 1 : -1;
    const x = side * (7 + rand() * 32);
    const z = -44 + rand() * 84;
    const h = 1.2 + rand() * 5;
    const rock = new THREE.Mesh(roughRockGeometry(2200 + i), lib.stoneDark);
    rock.scale.set(1.4 + rand() * 2.7, h, 1.2 + rand() * 2.2);
    rock.position.set(x, -5.5 + rand() * 3.1, z);
    rock.rotation.set(rand() * 0.4, rand() * Math.PI, rand() * 0.25);
    rock.castShadow = true;
    rock.receiveShadow = true;
    foundations.group.add(rock);
  }

  /* ================================================================ */
  /* 2. Central processional causeway and nave                        */
  /* ================================================================ */

  const nave = makePart(
    "The Crimson Nave",
    "Central processional causeway",
    "A 10-metre processional spine bridges the chasm from the lower gate to the ritual dais. Paired candle standards and blood banners mark its rhythm.",
    [0, 0, 2.6],
  );

  addPlatform(nave.group, 0, 3, 12.4, 52, 2.3, {
    floorMaterial: lib.floor,
    depthBelow: 11.5,
  });
  // Walkway surface is slightly proud of the support block.
  addBox(nave.group, 9.4, 0.2, 51, 0, 2.42, 3, lib.floor);

  // Broken drainage channels, so the causeway reads as built, not extruded.
  for (const side of [-1, 1]) {
    addBox(nave.group, 0.65, 0.1, 44, side * 4.55, 2.49, 3, lib.stoneDark);
    for (let i = 0; i < 19; i += 1) {
      addBox(
        nave.group,
        0.45 + rand() * 0.5,
        0.035,
        0.7 + rand() * 1.6,
        side * (2.0 + rand() * 2.2),
        2.54,
        -21 + i * 2.5 + rand(),
        new THREE.MeshStandardMaterial({
          color: 0x141112,
          roughness: 0.98,
        }),
      );
    }
  }

  // Parapet walls. Interrupted at stair landings to keep sight lines open.
  const parapetSpans: Array<[number, number]> = [
    [21, 12],
    [8.2, 11],
    [-4.4, 11],
    [-16.2, 9],
  ];
  for (const side of [-1, 1]) {
    for (const [z, len] of parapetSpans) {
      addWall(
        nave.group,
        side * 5.25,
        z,
        0.72,
        len,
        1.55,
        2.35,
        "z",
        true,
        lib.stoneAlt,
      );
    }
  }

  // Crossing bridges tie the nave to the flanking wards.
  for (const [z, side] of [
    [11, -1],
    [11, 1],
    [-7, -1],
    [-7, 1],
  ] as Array<[number, number]>) {
    addBox(nave.group, 3.2, 0.6, 3.2, side * 7.2, 2.25, z, lib.stoneAlt);
    addCrenellations(nave.group, side * 8.7, z, 2.6, 2.55, "x", 1.2, 0.55, 0.6, 0.5);
  }

  // Paired candle standards and banners down the nave.
  const naveBanners: Array<[number, number, "cross" | "sigil"]> = [
    [18, -1, "cross"],
    [18, 1, "sigil"],
    [7, -1, "sigil"],
    [7, 1, "cross"],
    [-4, -1, "cross"],
    [-4, 1, "sigil"],
  ];
  for (const [z, side, variant] of naveBanners) {
    addBannerPost(nave.group, side * 4.15, z, 2.55, side === -1 ? Math.PI * 0.06 : -Math.PI * 0.06, variant, 0.94);
  }

  // Processional stair down to the lower foreground gate.
  for (let i = 0; i < 7; i += 1) {
    addBox(
      nave.group,
      9.4,
      0.34,
      1.4,
      0,
      2.22 - i * 0.34,
      28.4 + i * 1.35,
      lib.stoneAlt,
    );
  }
  for (const side of [-1, 1]) {
    addBox(nave.group, 0.9, 1.1, 10.8, side * 5.0, 1.4, 32.6, lib.stoneDark);
  }

  /* ================================================================ */
  /* 3. The western ward                                               */
  /* ================================================================ */

  const west = makePart(
    "The Ashen Ward",
    "Western cloister and barracks",
    "A sunken rectangular ward wrapped by crenellated walls, with an interior stair, broken arcade and the western watchtower.",
    [-2.3, 0, 0.6],
  );

  addPlatform(west.group, -17.8, 8, 21, 22, 1.05, {
    floorMaterial: lib.floor,
    depthBelow: 10.0,
    rim: false,
  });
  // Perimeter walls, opened toward the causeway bridges.
  addWall(west.group, -28.0, 8, 18.5, 1.2, 4.1, 1.05, "z", true);
  addWall(west.group, -17.8, -2.8, 18.2, 1.25, 3.8, 1.05, "x", true);
  addWall(west.group, -17.8, 19.0, 18.2, 1.25, 3.2, 1.05, "x", true);
  addWall(west.group, -8.1, 8, 18.0, 1.2, 3.4, 1.05, "z", true);
  // Inner cloister lancets face the processional spine.
  for (let i = 0; i < 3; i += 1) {
    addLancetWindow(west.group, -7.45, 2.35, 3.0 + i * 5.2, 1.25, 2.6, Math.PI / 2, true);
  }
  // Gateway gap.
  addWall(west.group, -8.1, 16.1, 1.2, 4.0, 3.4, 1.05, "z", true);
  addPointedArchFrame(west.group, -8.1, 12.0, 1.05, 3.7, 4.2, 0.45, 1.45, Math.PI / 2);

  // The sunken interior court.
  addPlatform(west.group, -17.4, 9.0, 12.6, 11.2, -0.4, {
    floorMaterial: lib.floor,
    depthBelow: 2.6,
    rim: true,
  });
  for (let i = 0; i < 3; i += 1) {
    addBox(west.group, 5.8, 0.32, 1.1, -21.5, -0.22 + i * 0.3, 5.9 + i * 1.05, lib.stoneAlt);
  }
  // A ruined interior arcade along the inner edge.
  for (let i = 0; i < 3; i += 1) {
    const x = -22.0 + i * 4.1;
    addPointedArchFrame(west.group, x, 13.9, 1.05, 2.6, 3.2, 0.34, 0.7, 0);
  }

  // Arcade on the chasm-facing south edge, plus broken bridge.
  for (let i = 0; i < 3; i += 1) {
    addPointedArchFrame(west.group, -26.0 + i * 3.4, 22.5, -0.3, 2.2, 3.3, 0.35, 0.8, 0);
  }
  addBox(west.group, 2.9, 0.38, 10.5, -33.2, 1.0, 17.0, lib.stoneAlt);
  addCrenellations(west.group, -33.2, 15.4, 8.0, 1.25, "z", 1.4, 0.55, 0.8, 0.45);

  // Watchtower and banner.
  addBattlementedTower(west.group, -28.6, 27.6, 1.25, 6.2, 6.2, 14.5, {
    roof: false,
    spires: true,
    windows: true,
  });
  // The gargoyle perch: a heavier mid-ward tower that frames the western
  // chasm and supports the largest hanging chain.
  addBattlementedTower(west.group, -28.4, 11.6, 1.15, 6.6, 6.2, 16.0, {
    roof: false,
    spires: true,
    windows: true,
  });
  addBox(west.group, 8.0, 0.55, 7.4, -28.4, 17.4, 11.6, lib.trim);
  addCrenellations(west.group, -28.4, 15.2, 7.4, 17.7, "x", 1.4, 0.62, 0.9, 0.55);
  addBannerPost(west.group, -24.0, 11.8, 1.2, Math.PI / 2, "sigil", 1.15);
  addBannerPost(west.group, -22.6, 17.5, 1.2, -0.1, "cross", 1.02);
  addBannerPost(west.group, -12.2, 3.0, 1.2, Math.PI * 0.92, "sigil", 0.83);

  // Candle shelf and ribcage-like rubble.
  for (let i = 0; i < 5; i += 1) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(1.2 + rand(), 0.11, 6, 12, Math.PI * 1.2), lib.bone);
    rib.position.set(-24 + i * 1.8, 1.35, 14.2 + rand() * 1.5);
    rib.rotation.x = Math.PI / 2;
    rib.rotation.z = rand() * Math.PI;
    west.group.add(rib);
  }

  /* ================================================================ */
  /* 4. The eastern ward                                              */
  /* ================================================================ */

  const east = makePart(
    "The Blood Cloister",
    "Eastern chapel and reliquary court",
    "A mirror-broken eastern ward with a bell tower, votive braziers, and a long candle terrace above the chasm.",
    [2.3, 0, 0.6],
  );

  addPlatform(east.group, 18.2, 3.0, 21.5, 24, 1.15, {
    floorMaterial: lib.floor,
    depthBelow: 10.4,
    rim: false,
  });
  addWall(east.group, 28.8, 3.0, 22.0, 1.25, 4.5, 1.15, "z", true);
  addWall(east.group, 18.2, -8.6, 20.2, 1.2, 3.9, 1.15, "x", true);
  addWall(east.group, 18.2, 14.8, 20.2, 1.2, 3.4, 1.15, "x", true);
  addWall(east.group, 7.8, 3.0, 22.0, 1.25, 3.7, 1.15, "z", true);
  for (let i = 0; i < 3; i += 1) {
    addLancetWindow(east.group, 7.1, 2.45, -0.5 + i * 5.4, 1.25, 2.8, -Math.PI / 2, true);
  }
  addPointedArchFrame(east.group, 7.8, 8.6, 1.15, 3.5, 4.0, 0.42, 1.4, Math.PI / 2);

  // Raised eastern chapel platform.
  addPlatform(east.group, 21.5, -4.5, 9.6, 8.0, 2.2, {
    floorMaterial: lib.floor,
    depthBelow: 3.4,
    rim: true,
  });
  for (let i = 0; i < 4; i += 1) {
    addBox(east.group, 6.0, 0.28, 1.0, 21.5, 1.15 + i * 0.28, 1.4 + i * 1.0, lib.stoneAlt);
  }
  addWall(east.group, 21.5, -8.1, 9.8, 0.75, 3.7, 2.2, "x", false);
  addPointedArchFrame(east.group, 21.5, -8.2, 2.2, 3.2, 4.4, 0.38, 0.7, 0);
  addBannerPost(east.group, 17.1, -6.2, 2.2, Math.PI, "cross", 0.95);

  addBattlementedTower(east.group, 26.9, 17.6, 1.25, 5.8, 5.8, 12.0, {
    roof: false,
    spires: true,
    windows: true,
  });
  addBattlementedTower(east.group, 9.2, 22.8, 1.25, 4.6, 4.6, 9.5, {
    roof: true,
    spires: true,
    windows: true,
  });
  addBannerPost(east.group, 13.0, 12.0, 1.2, Math.PI * 0.9, "sigil", 1.0);

  // Long votive terrace and masonry tables.
  addBox(east.group, 5.4, 1.1, 2.2, 24.5, 1.7, 9.7, lib.stoneAlt);
  addBox(east.group, 4.4, 0.7, 1.6, 24.5, 2.55, 9.7, lib.trim);
  addBox(east.group, 6.1, 0.55, 2.0, 14.8, 1.5, -1.2, lib.stoneAlt);

  /* ================================================================ */
  /* 5. Far bastions and the gatehouse                                */
  /* ================================================================ */

  const bastions = makePart(
    "The Twin Bastions",
    "Flanking gatehouse system",
    "Paired fortified islands framing the approach to the ritual dais. Each carries a pointed gate, a watchtower, and a hanging war banner.",
    [0, 0, -1.8],
  );

  addPlatform(bastions.group, -19.2, -24.5, 20.5, 16.0, 2.2, {
    floorMaterial: lib.floor,
    depthBelow: 11.5,
    rim: false,
  });
  addPlatform(bastions.group, 19.2, -24.5, 20.5, 16.0, 2.2, {
    floorMaterial: lib.floor,
    depthBelow: 11.5,
    rim: false,
  });

  for (const side of [-1, 1]) {
    const cx = side * 19.2;
    addWall(bastions.group, cx, -16.5, 20.0, 1.4, 5.4, 2.2, "x", true);
    addWall(bastions.group, cx, -32.7, 20.0, 1.4, 4.8, 2.2, "x", true);
    addWall(bastions.group, cx + side * 10.0, -24.5, 16.4, 1.4, 5.5, 2.2, "z", true);
    addWall(bastions.group, cx - side * 10.0, -24.5, 16.4, 1.4, 5.0, 2.2, "z", true);

    addPointedArchFrame(
      bastions.group,
      cx,
      -16.6,
      2.2,
      7.0,
      7.8,
      0.75,
      1.6,
      0,
    );
    addBattlementedTower(bastions.group, cx + side * 7.4, -30.2, 2.2, 6.4, 6.0, 16.0, {
      roof: false,
      spires: true,
      windows: true,
    });
    addBannerPost(bastions.group, cx + side * 2.2, -18.9, 2.2, 0.05, side < 0 ? "sigil" : "cross", 1.14);
    addBattlementedTower(bastions.group, cx - side * 7.0, -19.5, 2.2, 4.6, 4.8, 9.0, {
      roof: false,
      spires: true,
      windows: true,
    });
  }

  // Narrow high bridges from the bastions to the ritual platform.
  for (const side of [-1, 1]) {
    addBox(bastions.group, 5.4, 0.5, 3.3, side * 8.1, 2.55, -29.2, lib.stoneAlt);
    addCrenellations(bastions.group, side * 8.1, -30.8, 4.2, 2.8, "x", 1.15, 0.48, 0.62, 0.5);
  }

  /* ================================================================ */
  /* 6. Ritual platform and façade                                    */
  /* ================================================================ */

  const ritual = makePart(
    "The Ninth Gate",
    "Ritual sanctum",
    "The terminal sanctuary: a raised octagonal dais, a 16-metre pentagram, a cruciform red beam and a colossal pointed gateway.",
    [0, 0, -3.8],
  );

  addPlatform(ritual.group, 0, -35.4, 23.0, 15.5, 5.15, {
    floorMaterial: lib.floor,
    depthBelow: 14.0,
    rim: true,
  });
  // Octagonal step mass.
  for (let i = 0; i < 4; i += 1) {
    const r = 12.0 - i * 1.4;
    const s = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r + 0.15, 0.35, 8),
      i % 2 === 0 ? lib.stoneAlt : lib.trim,
    );
    s.position.set(0, 5.15 + i * 0.34, -35.4);
    s.rotation.y = Math.PI / 8;
    s.receiveShadow = true;
    s.castShadow = true;
    ritual.group.add(s);
  }

  // Civic stairs from the nave into the sanctum.
  for (let i = 0; i < 6; i += 1) {
    addBox(
      ritual.group,
      10.4,
      0.36,
      1.5,
      0,
      2.38 + i * 0.42,
      -24.1 - i * 1.18,
      i % 2 === 0 ? lib.stoneAlt : lib.stone,
    );
  }
  for (const side of [-1, 1]) {
    addBox(ritual.group, 1.1, 1.7, 8.2, side * 5.85, 2.8, -27.1, lib.stoneDark);
    addCrenellations(ritual.group, side * 5.85, -29.4, 4.8, 3.6, "z", 1.2, 0.5, 0.7, 0.55);
  }

  // Red processional runnel up the stairs and across the dais.
  const runnel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 14),
    new THREE.MeshBasicMaterial({
      color: 0xa11208,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  runnel.rotation.x = -Math.PI / 2;
  runnel.position.set(0, 5.27, -31.6);
  ritual.group.add(runnel);

  // Colossal gateway façade.
  addBox(ritual.group, 31, 17, 2.4, 0, 13.65, -44.4, lib.stoneDark);
  addWall(ritual.group, -15.0, -44.4, 1.2, 3.0, 16.0, 5.2, "z", true, lib.stone);
  addWall(ritual.group, 15.0, -44.4, 1.2, 3.0, 16.0, 5.2, "z", true, lib.stone);
  addWall(ritual.group, 0, -45.0, 31.4, 1.0, 2.8, 21.2, "x", true, lib.stone);
  addPointedArchFrame(ritual.group, 0, -43.0, 5.2, 8.4, 11.0, 1.2, 2.6, 0, lib.trim);
  addPointedArchFrame(ritual.group, -10.7, -43.2, 5.2, 4.4, 7.0, 0.65, 1.6, 0, lib.stoneDark);
  addPointedArchFrame(ritual.group, 10.7, -43.2, 5.2, 4.4, 7.0, 0.65, 1.6, 0, lib.stoneDark);

  // The gate interior is a black void with a red rim.
  const gateVoid = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 10.4),
    new THREE.MeshBasicMaterial({ color: 0x050102, toneMapped: false }),
  );
  gateVoid.position.set(0, 10.1, -42.7);
  ritual.group.add(gateVoid);
  const gateGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 10.4),
    new THREE.MeshBasicMaterial({
      color: 0x5e0605,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  gateGlow.position.set(0, 10.1, -42.6);
  ritual.group.add(gateGlow);

  // Towering flanks and spires.
  for (const side of [-1, 1]) {
    addBattlementedTower(ritual.group, side * 14.8, -39.1, 5.2, 7.4, 7.0, 18.0, {
      roof: true,
      spires: true,
      windows: true,
    });
    addBattlementedTower(ritual.group, side * 21.5, -41.5, 5.2, 5.0, 5.0, 12.5, {
      roof: false,
      spires: true,
      windows: true,
    });
    for (let i = 0; i < 4; i += 1) {
      const pinnacle = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 4.5 + (i % 2) * 2.2, 4),
        lib.stoneDark,
      );
      pinnacle.position.set(side * (7.2 + i * 1.6), 12.5 + (i % 2) * 0.6, -42.5);
      pinnacle.rotation.y = Math.PI / 4;
      pinnacle.castShadow = true;
      ritual.group.add(pinnacle);
    }
  }

  // Pentagram inlay.
  const pentagram = new THREE.Mesh(new THREE.PlaneGeometry(17.6, 17.6), lib.rune);
  pentagram.rotation.x = -Math.PI / 2;
  pentagram.rotation.z = Math.PI / 5;
  pentagram.position.set(0, 6.58, -35.4);
  pentagram.renderOrder = 8;
  ritual.group.add(pentagram);

  const pentagramInner = new THREE.Mesh(new THREE.PlaneGeometry(12.0, 12.0), lib.runeDaisy);
  pentagramInner.rotation.x = -Math.PI / 2;
  pentagramInner.position.set(0, 6.59, -35.4);
  pentagramInner.material = lib.runeDaisy.clone();
  pentagramInner.material.opacity = 0.28;
  ritual.group.add(pentagramInner);

  // Ring of votive stones and braziers around the dais.
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 8.7;
    const z = -35.4 + Math.sin(a) * 6.7;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.52, 1.25, 6),
      lib.stoneDark,
    );
    post.position.set(x, 6.15, z);
    post.castShadow = true;
    ritual.group.add(post);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.25, 0.35, 10), lib.bronze);
    bowl.position.set(x, 6.9, z);
    ritual.group.add(bowl);
  }

  addBannerPost(ritual.group, -7.7, -30.1, 5.2, 0.05, "sigil", 1.25);
  addBannerPost(ritual.group, 7.7, -30.1, 5.2, -0.05, "cross", 1.25);

  // Two enormous cloth-of-blood banners flank the gate.
  for (const side of [-1, 1]) {
    const clothGeo = new THREE.PlaneGeometry(3.8, 9.4, 10, 18);
    const clothPos = clothGeo.attributes.position;
    for (let i = 0; i < clothPos.count; i += 1) {
      const px = clothPos.getX(i);
      const py = clothPos.getY(i);
      clothPos.setZ(i, Math.sin(px * 1.4 + py * 0.8) * 0.16 + Math.sin(py * 0.3) * 0.08);
    }
    clothGeo.computeVertexNormals();
    const cloth = new THREE.Mesh(clothGeo, lib.banner[side < 0 ? "sigil" : "cross"]);
    cloth.position.set(side * 9.5, 13.8, -42.65);
    cloth.castShadow = false;
    ritual.group.add(cloth);
    addCylinder(ritual.group, 0.1, 0.1, 4.8, 8, side * 9.5, 18.7, -42.6, lib.iron).rotation.z = Math.PI / 2;
    addBox(ritual.group, 0.18, 1.0, 0.18, side * 11.9, 18.2, -42.6, lib.bronze);
  }

  // Rune plaques on the façade.
  for (const [x, y] of [
    [-5.4, 18.8],
    [5.4, 18.8],
    [-11.2, 14.4],
    [11.2, 14.4],
  ]) {
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), lib.runeDaisy);
    plaque.position.set(x, y, -43.1);
    plaque.renderOrder = 6;
    ritual.group.add(plaque);
  }

  /* ================================================================ */
  /* 7. Foreground gatehouse and flanking ruins                       */
  /* ================================================================ */

  const gatehouse = makePart(
    "The Cinder Gate",
    "Foreground approach",
    "The viewer-side gatehouse: a broken barbican split by the descending processional stair, with paired guardians and a deep lava trench.",
    [0, 0, 4.5],
  );

  addPlatform(gatehouse.group, -15.8, 32.5, 18.0, 14.0, 1.3, {
    floorMaterial: lib.floor,
    depthBelow: 11.0,
    rim: false,
  });
  addPlatform(gatehouse.group, 16.4, 32.2, 18.0, 14.0, 1.3, {
    floorMaterial: lib.floor,
    depthBelow: 11.0,
    rim: false,
  });
  addWall(gatehouse.group, -15.8, 39.7, 18.2, 1.4, 3.2, 1.3, "x", true);
  addWall(gatehouse.group, 16.4, 39.2, 18.2, 1.4, 3.5, 1.3, "x", true);
  addWall(gatehouse.group, -6.5, 32.5, 14.2, 1.3, 2.8, 1.3, "z", true);
  addWall(gatehouse.group, 7.2, 32.2, 14.2, 1.3, 3.4, 1.3, "z", true);

  // Ruined gate arch spanning the central stair.
  addPointedArchFrame(gatehouse.group, 0, 28.8, 1.0, 8.2, 9.2, 0.7, 1.4, 0);
  addBox(gatehouse.group, 10.0, 0.65, 1.5, 0, 10.15, 28.8, lib.stoneAlt);
  addCrenellations(gatehouse.group, 0, 28.8, 10.0, 10.4, "x", 1.3, 0.6, 0.7, 0.6);

  addBattlementedTower(gatehouse.group, -13.4, 35.8, 1.3, 5.8, 5.8, 11.5, {
    roof: false,
    spires: true,
    windows: true,
  });
  addBattlementedTower(gatehouse.group, 15.2, 35.2, 1.3, 6.2, 6.2, 13.0, {
    roof: false,
    spires: true,
    windows: true,
  });

  for (const side of [-1, 1]) {
    addBox(gatehouse.group, 2.0, 2.0, 2.0, side * 7.6, 3.1, 23.2, lib.stoneAlt);
    addBox(gatehouse.group, 2.3, 0.25, 2.3, side * 7.6, 4.18, 23.2, lib.trim);
    addLancetWindow(gatehouse.group, side * 9.8, 4.2, 32.5, 0.95, 2.1, Math.PI / 2, true);
  }

  // Broken viaduct at the southwest edge — the signature ruined arch.
  const ruins = makePart(
    "The Sunken Arcade",
    "Ruined viaduct",
    "A shattered three-bay viaduct leaning over the lava fall, with a giant chain descending from the gargoyle perch.",
    [-3.0, 0, 1.5],
  );
  addPlatform(ruins.group, -30.5, 16.0, 8.4, 12.0, 1.7, {
    floorMaterial: lib.floor,
    depthBelow: 9.5,
    rim: false,
  });
  for (let i = 0; i < 3; i += 1) {
    addPointedArchFrame(ruins.group, -30.5, 12.0 + i * 3.4, 1.7, 2.8, 3.9, 0.42, 0.9, Math.PI / 2);
  }
  addBox(ruins.group, 2.2, 0.5, 9.4, -30.5, 5.9, 15.0, lib.stoneDark);
  addBox(ruins.group, 0.8, 2.2, 4.4, -31.6, 6.7, 19.4, lib.stoneDark);
  addBattlementedTower(ruins.group, -31.0, 27.6, 1.7, 4.6, 4.6, 15.6, {
    roof: false,
    spires: true,
    windows: false,
  });

  chasmAnchors.push(new THREE.Vector3(-14, -1, 28));
  chasmAnchors.push(new THREE.Vector3(14, -1, 26));
  chasmAnchors.push(new THREE.Vector3(-25, -2, 2));
  chasmAnchors.push(new THREE.Vector3(26, -2, -1));
  chasmAnchors.push(new THREE.Vector3(-30, 0, 10));

  /* ================================================================ */
  /* 7b. Outer curtain wall and enclosing ramparts                    */
  /* ================================================================ */

  const outer = makePart(
    "The Iron Curtain",
    "Outer ramparts and buttress wall",
    "The broken outer shell of the sanctum: high crenellated curtains, heavy buttresses and votive arches that hold the black mass of the citadel together.",
    [0, 0, 0],
  );

  for (const side of [-1, 1]) {
    const x = side * 35.4;
    // A continuous support ledge, deliberately broken at the chasm mouths.
    addPlatform(outer.group, x, 4.0, 8.5, 58, 0.6, {
      floorMaterial: lib.stoneDark,
      depthBelow: 12.0,
      rim: false,
    });

    const segments: Array<[number, number, number]> = [
      [-23.0, 14.0, 12.0],
      [-6.2, 12.0, 14.5],
      [12.0, 14.0, 10.0],
      [28.4, 9.0, 8.0],
    ];
    for (const [z, len, h] of segments) {
      addWall(outer.group, x, z, 3.0, len, h, 0.6, "z", true, lib.stone);
      // Inward buttresses give the wall a readable rhythm from above.
      for (let i = -1; i <= 1; i += 1) {
        const bz = z + i * (len * 0.3);
        addBox(outer.group, 1.8, h * 0.8, 1.7, x + side * -1.35, 0.6 + h * 0.4, bz, lib.stoneDark);
        addBox(outer.group, 2.1, 0.35, 2.0, x + side * -1.35, 0.6 + h * 0.8, bz, lib.trim);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.8, 4), lib.stoneDark);
        cap.position.set(x + side * -1.35, 0.6 + h * 0.8 + 1.4, bz);
        cap.rotation.y = Math.PI / 4;
        cap.castShadow = true;
        outer.group.add(cap);
      }
    }

    // Votive niches looking inward over the chasm.
    for (let i = 0; i < 4; i += 1) {
      const z = -20 + i * 12.5;
      addPointedArchFrame(
        outer.group,
        x + side * -1.6,
        z,
        0.7,
        3.4,
        4.4,
        0.4,
        0.8,
        Math.PI / 2,
        lib.stoneAlt,
      );
      const voidPanel = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 3.2),
        new THREE.MeshBasicMaterial({ color: 0x050102, toneMapped: false }),
      );
      voidPanel.position.set(x + side * -1.2, 2.1, z);
      voidPanel.rotation.y = Math.PI / 2;
      outer.group.add(voidPanel);
    }

    addBattlementedTower(outer.group, x, -31.5, 0.6, 8.8, 8.8, 20.0, {
      roof: false,
      spires: true,
      windows: true,
    });
    addBattlementedTower(outer.group, x, 35.0, 0.6, 7.4, 7.4, 16.0, {
      roof: true,
      spires: true,
      windows: true,
    });
    addBannerPost(
      outer.group,
      x + side * -2.2,
      side < 0 ? 1.2 : 6.0,
      0.65,
      side < 0 ? Math.PI / 2 : -Math.PI / 2,
      side < 0 ? "sigil" : "cross",
      1.3,
    );
    addBannerPost(
      outer.group,
      x + side * -2.2,
      side < 0 ? 21.0 : 24.0,
      0.65,
      side < 0 ? Math.PI / 2 : -Math.PI / 2,
      "cross",
      1.05,
    );
  }

  // Foreground cross-wall, deliberately cut by the processional descent.
  for (const side of [-1, 1]) {
    addWall(outer.group, side * 21.4, 39.8, 23.0, 2.6, 10.5, 0.8, "x", true, lib.stoneAlt);
    addBattlementedTower(outer.group, side * 31.0, 39.0, 0.8, 6.2, 6.2, 13.0, {
      roof: false,
      spires: true,
      windows: false,
    });
  }
  addPointedArchFrame(outer.group, 0, 39.8, 0.8, 10.2, 10.4, 0.85, 1.6, 0);

  // Fallen curtain fragments on the west edge.
  for (let i = 0; i < 5; i += 1) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(3.0 + rand() * 3.0, 2.0 + rand() * 4.5, 2.0 + rand() * 2.5),
      lib.stoneDark,
    );
    block.position.set(-36 - rand() * 3.5, -0.4 + rand() * 2.8, -10 + i * 9.2);
    block.rotation.set(rand() * 0.25, rand() * Math.PI, rand() * 0.16);
    block.castShadow = true;
    block.receiveShadow = true;
    outer.group.add(block);
  }

  // The gargoyle's high perch on the western curtain, the strongest silhouette
  // in the reference's upper-left corner.
  addBox(outer.group, 8.4, 1.1, 8.4, -32.4, 13.25, -17.2, lib.stoneAlt);
  addBox(outer.group, 9.0, 0.28, 9.0, -32.4, 13.85, -17.2, lib.trim);
  addCrenellations(outer.group, -32.4, -21.1, 8.4, 13.95, "x", 1.5, 0.62, 1.0, 0.58);
  addCrenellations(outer.group, -32.4, -13.3, 8.4, 13.95, "x", 1.5, 0.62, 1.0, 0.58);
  addBannerPost(outer.group, -30.5, -17.2, 13.8, Math.PI / 2, "sigil", 0.95);

  /* ================================================================ */
  /* 7c. Inner room subdivisions and colonnades                       */
  /* ================================================================ */

  const inner = makePart(
    "The Black Cells",
    "Interior chambers and colonnades",
    "Dividing walls, collapsed vaults and short colonnades that turn the broad wards into a labyrinth of cells and chapels.",
    [0, 0, 0],
  );

  const addColumn = (
    parent: THREE.Object3D,
    x: number,
    z: number,
    baseY: number,
    height: number,
    radius = 0.42,
    broken = false,
  ): void => {
    addBox(parent, radius * 2.7, 0.35, radius * 2.7, x, baseY + 0.18, z, lib.trim);
    addCylinder(parent, radius * 0.82, radius, height, 8, x, baseY + height / 2 + 0.2, z, lib.stoneAlt);
    if (!broken) {
      addBox(parent, radius * 3.0, 0.4, radius * 3.0, x, baseY + height + 0.4, z, lib.trim);
      const capital = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 1.3, radius * 0.9, 0.55, 8),
        lib.stoneDark,
      );
      capital.position.set(x, baseY + height + 0.82, z);
      capital.castShadow = true;
      parent.add(capital);
    } else {
      const jag = new THREE.Mesh(new THREE.ConeGeometry(radius, 1.4, 6), lib.stoneDark);
      jag.position.set(x, baseY + height + 0.45, z);
      parent.add(jag);
    }
  };

  // West cloister partition and colonnade.
  addWall(inner.group, -17.7, 14.9, 11.5, 1.0, 3.0, 1.05, "x", false, lib.stoneAlt);
  addPointedArchFrame(inner.group, -17.7, 14.9, 1.05, 3.2, 3.6, 0.35, 0.9, 0);
  addWall(inner.group, -23.2, 8.6, 1.0, 10.4, 2.6, 1.05, "z", false, lib.stoneDark);
  addPointedArchFrame(inner.group, -23.2, 8.6, 1.05, 2.5, 3.1, 0.3, 0.8, Math.PI / 2);
  for (let i = 0; i < 4; i += 1) {
    addColumn(inner.group, -21.0 + i * 2.1, 4.3, 1.15, 3.0, 0.33, i === 3);
  }
  addWall(inner.group, -17.6, 4.3, 8.5, 0.75, 0.85, 1.05, "x", false, lib.stoneAlt);
  // Low benches / sarcophagi read strongly from the top-down camera.
  for (let i = 0; i < 3; i += 1) {
    addBox(inner.group, 1.0, 0.8, 2.0, -25.8, 1.45, 4.4 + i * 2.5, lib.stoneAlt);
    addBox(inner.group, 1.2, 0.25, 2.2, -25.8, 1.9, 4.4 + i * 2.5, lib.trim);
  }

  // East reliquary room and broken vault ribs.
  addWall(inner.group, 20.2, 10.8, 10.8, 1.0, 3.1, 1.15, "x", false, lib.stoneAlt);
  addPointedArchFrame(inner.group, 20.2, 10.8, 1.15, 3.0, 3.6, 0.35, 0.9, 0);
  addWall(inner.group, 25.3, 6.3, 1.0, 8.6, 2.8, 1.15, "z", false, lib.stoneDark);
  for (let i = 0; i < 4; i += 1) {
    addColumn(inner.group, 20.1 + i * 2.2, 7.6, 1.25, 2.8, 0.31, i === 1);
  }
  addWall(inner.group, 21.0, 7.6, 9.0, 0.7, 0.85, 1.15, "x", false, lib.stoneAlt);
  // Reliquary table.
  addBox(inner.group, 2.4, 1.2, 1.2, 17.6, 1.85, 2.0, lib.stoneAlt);
  addBox(inner.group, 2.7, 0.2, 1.5, 17.6, 2.55, 2.0, lib.trim);

  // West high terrace above the outer ward.
  addPlatform(inner.group, -12.1, 16.6, 5.0, 12.0, 3.4, {
    floorMaterial: lib.floor,
    depthBelow: 4.2,
    rim: true,
  });
  for (let i = 0; i < 4; i += 1) {
    addBox(inner.group, 3.4, 0.28, 0.9, -12.1, 1.05 + i * 0.5, 10.6 + i * 0.9, lib.stoneAlt);
  }
  for (let i = 0; i < 4; i += 1) {
    addColumn(inner.group, -10.4, 12.4 + i * 2.4, 3.4, 2.5, 0.25, false);
  }
  addCrenellations(inner.group, -9.7, 16.6, 10.4, 5.9, "z", 1.3, 0.55, 0.7, 0.5);

  // East high terrace.
  addPlatform(inner.group, 12.2, 17.8, 4.6, 10.0, 3.0, {
    floorMaterial: lib.floor,
    depthBelow: 3.8,
    rim: true,
  });
  for (let i = 0; i < 4; i += 1) {
    addColumn(inner.group, 11.1, 14.4 + i * 2.0, 3.0, 2.4, 0.24, i === 0);
  }
  addCrenellations(inner.group, 10.1, 17.8, 9.6, 5.4, "z", 1.3, 0.55, 0.7, 0.5);

  // A collapsed vault spanning the west alley.
  for (let i = 0; i < 3; i += 1) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(2.4 + i * 0.3, 0.12, 5, 12, Math.PI),
      lib.stoneDark,
    );
    rib.position.set(-8.7, 1.4, 15.8 + i * 1.9);
    rib.rotation.x = Math.PI / 2;
    rib.rotation.z = Math.PI / 2;
    rib.castShadow = true;
    inner.group.add(rib);
  }

  /* ================================================================ */
  /* 8. Distant citadel silhouettes                                    */
  /* ================================================================ */

  const distance = makePart(
    "The Drowned City",
    "Background skyline",
    "Distant towers, a broken aqueduct and one floating fortress hanging in the red murk beyond the sanctum.",
    [0, 0, -8],
  );

  const cityMat = new THREE.MeshStandardMaterial({
    color: 0x0c080a,
    roughness: 1,
    metalness: 0,
  });

  const addDistantTower = (x: number, z: number, h: number, w: number): void => {
    const baseY = -5;
    addBox(distance.group, w, h, w, x, baseY + h / 2, z, cityMat);
    for (let i = 0; i < 3; i += 1) {
      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(w * (0.13 + i * 0.03), h * (0.16 + i * 0.035), 4),
        cityMat,
      );
      spire.position.set(x + (i - 1) * w * 0.3, baseY + h + h * 0.06, z + (i - 1) * w * 0.1);
      spire.rotation.y = Math.PI / 4;
      distance.group.add(spire);
    }
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: lib.glow.map,
        color: 0xff2b12,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    glow.position.set(x, baseY + h * 0.55, z + w * 0.6);
    glow.scale.set(w * 2.5, w * 2.5, 1);
    distance.group.add(glow);
  };

  addDistantTower(-48, -65, 19, 7);
  addDistantTower(-33, -72, 25, 8);
  addDistantTower(42, -68, 22, 8);
  addDistantTower(57, -58, 17, 6);
  addDistantTower(30, -78, 30, 9);
  addDistantTower(-58, -48, 14, 5);

  // Floating fortress, upper right.
  const float = new THREE.Group();
  float.position.set(42, 24, -54);
  distance.group.add(float);
  const island = new THREE.Mesh(roughRockGeometry(8181), cityMat);
  island.scale.set(9, 4.8, 8);
  island.rotation.y = 0.6;
  float.add(island);
  addBox(float, 3.2, 13, 3.2, -2.5, 8, 0, cityMat);
  addBox(float, 2.2, 9, 2.2, 2.0, 7, 1.5, cityMat);
  addBox(float, 4.2, 5.5, 3.4, 0, 6.0, -1.8, cityMat);
  for (let i = 0; i < 3; i += 1) {
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.55, 6.0 + i * 1.8, 4), cityMat);
    spire.position.set(-2.5 + i * 2.4, 15 + i * 0.8, 0);
    spire.rotation.y = Math.PI / 4;
    float.add(spire);
  }
  // Aqueduct arm.
  addBox(float, 15, 0.6, 1.1, -9.5, 2.0, 0.5, cityMat);
  for (let i = 0; i < 4; i += 1) {
    addBox(float, 0.7, 3.6, 0.9, -4 - i * 3.6, 0.3, 0.5, cityMat);
  }
  for (let i = 0; i < 4; i += 1) {
    const w = 1.8;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.18, w * 0.35), lib.runeDaisy);
    glow.position.set(-2.5 + i * 2.2, 9.5 + (i % 2) * 2.6, 1.64);
    glow.material = glow.material.clone();
    glow.material.opacity = 0.2;
    float.add(glow);
  }

  // Faint ruined cloister in the far haze.
  for (let i = 0; i < 7; i += 1) {
    addBox(distance.group, 2.2, 14 + (i % 3) * 3, 2.2, -26 + i * 9, 2, -54, cityMat);
  }

  /* ================================================================ */
  /* 9. Loose masonry, rubble and chains                              */
  /* ================================================================ */

  const rubble = makePart(
    "Ash and Ruin",
    "Debris system",
    "Scattered ashlar blocks, broken column drums and iron chains that break the geometry's regularity.",
    [0, 0, 0],
  );

  for (let i = 0; i < 48; i += 1) {
    const side = rand() > 0.5 ? 1 : -1;
    const x = side * (7 + rand() * 22);
    const z = -28 + rand() * 58;
    const y = rand() > 0.3 ? 1.4 : -0.4;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(0.5 + rand() * 1.5, 0.35 + rand() * 1.0, 0.5 + rand() * 1.3),
      rand() > 0.5 ? lib.stone : lib.stoneDark,
    );
    block.position.set(x, y + block.geometry.parameters.height / 2, z);
    block.rotation.set(rand() * 0.5, rand() * Math.PI, rand() * 0.5);
    block.castShadow = true;
    block.receiveShadow = true;
    rubble.group.add(block);
  }

  for (let i = 0; i < 8; i += 1) {
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55 + rand() * 0.5, 0.55 + rand() * 0.5, 1.4 + rand() * 2.1, 12),
      lib.stoneDark,
    );
    drum.rotation.z = Math.PI / 2 + (rand() - 0.5) * 0.7;
    drum.rotation.y = rand() * Math.PI;
    drum.position.set(-22 + rand() * 44, 1.5, -24 + rand() * 50);
    drum.castShadow = true;
    rubble.group.add(drum);
  }

  // The giant chains at the high western perch, hung in front of the curtain
  // so they read as a foreground silhouette from the reference camera.
  addChain(outer.group, new THREE.Vector3(-33.0, 14.0, -16.0), new THREE.Vector3(-36.4, -7.4, -12.4), 28, 1.7, 1.3);
  addChain(outer.group, new THREE.Vector3(-30.9, 14.0, -16.2), new THREE.Vector3(-27.4, -7.4, -12.0), 24, 1.5, 1.06);
  addBox(outer.group, 0.3, 0.3, 2.2, -33.0, 13.85, -15.5, lib.iron);
  addBox(outer.group, 0.25, 0.25, 2.1, -30.9, 13.85, -15.6, lib.iron);
  addChain(ruins.group, new THREE.Vector3(-33.6, 15.7, 28.0), new THREE.Vector3(-37, -7.4, 30.0), 25, 1.8, 1.25);
  addChain(distance.group, new THREE.Vector3(31.0, 13.8, -54), new THREE.Vector3(27.0, -6.8, -48), 18, 0.9, 0.9);

  // A small chain bridge at the east gap.
  for (let j = 0; j < 7; j += 1) {
    addBox(rubble.group, 3.0, 0.16, 0.5, 25.0, 2.6, -2.4 + j * 1.25, lib.stoneDark);
  }
  addChain(rubble.group, new THREE.Vector3(23.7, 4.2, -2.8), new THREE.Vector3(23.7, 4.2, 5.8), 10, 1.3, 0.5);
  addChain(rubble.group, new THREE.Vector3(26.3, 4.2, -2.8), new THREE.Vector3(26.3, 4.2, 5.8), 10, 1.3, 0.5);

  // Pull the two wards slightly away from the processional spine, exposing a
  // narrow strip of the abyss and making the nave read as a bridge.
  west.group.position.x -= 1.15;
  east.group.position.x += 1.15;
  west.group.userData.basePosition.copy(west.group.position);
  east.group.userData.basePosition.copy(east.group.position);

  setShadow(root, true, true);

  return {
    root,
    parts,
    ritualBeamAnchor: new THREE.Vector3(0, 6.7, -35.4),
    pentagramAnchor: new THREE.Vector3(0, 6.68, -35.4),
    lavaAnchors,
    gargoylePerch: new THREE.Vector3(-32.4, 14.25, -17.2),
    chasmAnchors,
  };
}
