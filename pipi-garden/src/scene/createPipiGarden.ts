import * as THREE from "three";
import { PandaActor, type PandaAction } from "./character";
import { createAmbient, type Ambient } from "./ambient";
import { createProps, type ObstacleCircle, type Props } from "./props";
import { createTerrain, PLATFORM_TOP, type Terrain } from "./terrain";
export interface PreviewPandaSpec {
  u: number;
  v: number;
  scale: number;
  yaw: number;
  action: PandaAction;
}

export const PREVIEW_PANDAS: PreviewPandaSpec[] = [
  { u: 0.4596, v: 0.5924, scale: 1.9, yaw: 0.72, action: "eat" },
  { u: 0.5289, v: 0.5115, scale: 1.62, yaw: 1.15, action: "walk" },
  { u: 0.5982, v: 0.5577, scale: 1.94, yaw: 0.34, action: "sit" },
];

export interface GardenStats {
  meshes: number;
  triangles: number;
  drawCalls: number;
  pandas: number;
  lights: number;
  obstacles: number;
}

export interface PipiGarden {
  root: THREE.Group;
  environment: THREE.Group;
  lighting: THREE.Group;
  terrain: Terrain;
  props: Props;
  ambient: Ambient;
  pandas: PandaActor[];
  obstacles: ObstacleCircle[];
  bounds: THREE.Box3;
  framePoints: THREE.Vector3[];
  stats: GardenStats;
  addPanda: (spec: PreviewPandaSpec) => PandaActor;
  setPreviewPandas: (count: number) => void;
  setEnvironmentVisible: (visible: boolean) => void;
  update: (time: number, delta: number) => void;
}

export function createPipiGarden(): PipiGarden {
  const root = new THREE.Group();
  root.name = "PipiGardenRoot";

  const environment = new THREE.Group();
  environment.name = "PipiGardenEnvironment";
  root.add(environment);

  const terrain = createTerrain(8);
  const props = createProps();
  const ambient = createAmbient();
  environment.add(terrain.group, props.group, ambient.group);

  const lighting = new THREE.Group();
  lighting.name = "PipiLighting";
  root.add(lighting);

  const hemi = new THREE.HemisphereLight(0xfff3de, 0x78865b, 1.72);
  lighting.add(hemi);

  const ambientLight = new THREE.AmbientLight(0xffeed8, 0.32);
  lighting.add(ambientLight);

  const key = new THREE.DirectionalLight(0xffdfb2, 2.95);
  key.position.set(-8.5, 13.5, 8.5);
  key.target.position.set(0, 0.8, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 38;
  key.shadow.camera.left = -9.5;
  key.shadow.camera.right = 9.5;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.035;
  key.shadow.radius = 3;
  lighting.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xd4e7e7, 0.8);
  fill.position.set(8, 7.5, 6);
  fill.target.position.set(0, 0.8, 0);
  lighting.add(fill, fill.target);

  const rim = new THREE.DirectionalLight(0xffc887, 1.05);
  rim.position.set(-2, 6, -9);
  rim.target.position.set(0, 1.2, 0);
  lighting.add(rim, rim.target);

  const pandas: PandaActor[] = [];

  const addPanda = (spec: PreviewPandaSpec): PandaActor => {
    const uv = {
      x: (spec.u - 0.5) * 12,
      z: (spec.v - 0.5) * 12,
    };
    const actor = new PandaActor();
    actor.setScale(spec.scale);
    actor.setPosition(uv.x, uv.z);
    actor.group.position.y = PLATFORM_TOP;
    actor.shadow.position.y = PLATFORM_TOP + 0.008;
    actor.setYaw(spec.yaw);
    actor.setAction(spec.action);
    root.add(actor.group);
    root.add(actor.shadow);
    pandas.push(actor);
    return actor;
  };

  let previewCount = 0;
  const setPreviewPandas = (count: number): void => {
    const target = Math.max(0, Math.min(PREVIEW_PANDAS.length, Math.floor(count)));
    while (previewCount < target) {
      addPanda(PREVIEW_PANDAS[previewCount]!);
      previewCount += 1;
    }
  };

  const bounds = terrain.bounds.clone();
  const framePoints: THREE.Vector3[] = [];
  const half = 10.55;
  for (const x of [-half, half]) {
    for (const z of [-half, half]) {
      framePoints.push(new THREE.Vector3(x, PLATFORM_TOP, z));
      framePoints.push(new THREE.Vector3(x, -1.36, z));
    }
  }
  framePoints.push(...props.framePoints);

  let meshes = 0;
  let triangles = 0;
  let lights = 0;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object instanceof THREE.Light) lights += 1;
    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    const geometry = object.geometry;
    const count = geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
    triangles += (count / 3) * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });

  const update = (time: number, delta: number): void => {
    terrain.update(time, delta);
    props.update(time, delta);
    ambient.update(time, delta);
    for (const panda of pandas) panda.update(delta);
  };

  const stats: GardenStats = {
    meshes,
    triangles: Math.round(triangles),
    drawCalls: 0,
    pandas: pandas.length,
    lights,
    obstacles: props.obstacles.length,
  };

  return {
    root,
    environment,
    lighting,
    terrain,
    props,
    ambient,
    pandas,
    obstacles: props.obstacles,
    bounds,
    framePoints,
    stats,
    addPanda,
    setPreviewPandas,
    setEnvironmentVisible: (visible: boolean) => {
      environment.visible = visible;
      for (const panda of pandas) {
        panda.group.visible = visible;
        panda.shadow.visible = visible;
      }
    },
    update,
  };
}
