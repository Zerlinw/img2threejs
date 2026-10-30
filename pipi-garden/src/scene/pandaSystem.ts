import * as THREE from "three";
import { PandaActor, type PandaAction } from "./character";
import {
  PLATFORM_RADIUS,
  PLATFORM_SIZE,
  PLATFORM_TOP,
  uvToWorld,
  worldToUv,
} from "./terrain";
import type { ObstacleCircle } from "./props";

const NAMES = [
  "栗子",
  "团团",
  "竹笋",
  "糯米",
  "芝麻",
  "布丁",
  "小满",
  "豆沙",
  "年糕",
  "桃桃",
  "米粒",
  "山竹",
  "山楂",
  "汤圆",
  "团子",
  "小鹿",
];

const WALKABLE_ACTIONS: Array<{ action: PandaAction; weight: number }> = [
  { action: "idle", weight: 0.24 },
  { action: "walk", weight: 0.42 },
  { action: "sit", weight: 0.13 },
  { action: "eat", weight: 0.13 },
  { action: "wag", weight: 0.08 },
];

export interface PandaAgent {
  id: number;
  name: string;
  actor: PandaActor;
  u: number;
  v: number;
  x: number;
  z: number;
  scale: number;
  homeU: number;
  homeV: number;
  homeRadius: number;
  radius: number;
  action: PandaAction;
  actionTimer: number;
  targetX: number | null;
  targetZ: number | null;
  leaderId: number | null;
  nextLeaderCheck: number;
  dragging: boolean;
  spawnT: number;
  spawnDuration: number;
  facing: number;
}

export interface SpawnOptions {
  action?: PandaAction;
  yaw?: number;
  homeRadius?: number;
  silent?: boolean;
}

export interface PandaSystemOptions {
  onChange?: (agents: PandaAgent[]) => void;
  onBurst?: (x: number, y: number, z: number) => void;
}

export interface DropResult {
  snapped: boolean;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
}

export class PandaSystem {
  readonly root = new THREE.Group();
  readonly agents: PandaAgent[] = [];
  readonly selectionRing: THREE.Mesh;
  readonly maxPandas = 30;

  private nextId = 1;
  private selectedId: number | null = null;
  private frozen = false;
  private readonly obstacles: ObstacleCircle[];
  private readonly onChange: (agents: PandaAgent[]) => void;
  private readonly onBurst: (x: number, y: number, z: number) => void;
  private readonly accumulator = new THREE.Vector3();
  private readonly ringMaterial: THREE.MeshBasicMaterial;

  constructor(obstacles: ObstacleCircle[], options: PandaSystemOptions = {}) {
    this.root.name = "PandaResidents";
    this.obstacles = obstacles;
    this.onChange = options.onChange ?? (() => {});
    this.onBurst = options.onBurst ?? (() => {});

    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xe17758,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.selectionRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.025, 8, 48),
      this.ringMaterial,
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = PLATFORM_TOP + 0.018;
    this.selectionRing.visible = false;
    this.selectionRing.renderOrder = 4;
    this.root.add(this.selectionRing);
  }

  setFrozen(value: boolean): void {
    this.frozen = value;
    for (const agent of this.agents) {
      agent.actor.frozen = value;
      if (value) agent.actor.update(0);
    }
  }

  spawn(u: number, v: number, scale: number, options: SpawnOptions = {}): PandaAgent | null {
    if (this.agents.length >= this.maxPandas) return null;
    const resolvedScale = THREE.MathUtils.clamp(scale, 0.9, 2.05);
    const radius = 0.4 * resolvedScale + 0.05;
    const start = uvToWorld(u, v);
    const startFree =
      this.isWalkableWorld(start.x, start.z, radius) &&
      this.isFreeOfOthersWorld(start.x, start.z, radius);
    const point = startFree
      ? { u, v }
      : this.nearestFreeUv(u, v, radius);

    const name = NAMES[(this.nextId - 1) % NAMES.length]!;
    const actor = new PandaActor(name);
    actor.setScale(resolvedScale);
    actor.setPosition(uvToWorld(point.u, point.v).x, uvToWorld(point.u, point.v).z);
    actor.group.position.y = PLATFORM_TOP;
    actor.shadow.position.y = PLATFORM_TOP + 0.008;
    actor.setYaw(options.yaw ?? this.random(0, Math.PI * 2));
    const action = options.action ?? "idle";
    actor.setAction(action);
    if (this.frozen) {
      actor.forcePose(action, 1.5);
    }

    const world = uvToWorld(point.u, point.v);
    const agent: PandaAgent = {
      id: this.nextId,
      name,
      actor,
      u: point.u,
      v: point.v,
      x: world.x,
      z: world.z,
      scale: resolvedScale,
      homeU: point.u,
      homeV: point.v,
      homeRadius: options.homeRadius ?? 1.25,
      radius,
      action,
      actionTimer: this.random(2.4, 4.8),
      targetX: null,
      targetZ: null,
      leaderId: null,
      nextLeaderCheck: this.random(1.1, 2.3),
      dragging: false,
      spawnT: options.silent ? 1 : 0,
      spawnDuration: 0.62,
      facing: options.yaw ?? 0,
    };
    this.nextId += 1;

    this.root.add(actor.group, actor.shadow);
    actor.group.userData.agentId = agent.id;
    actor.shadow.userData.agentId = agent.id;

    if (!options.silent) {
      actor.group.scale.setScalar(resolvedScale * 0.01);
      actor.shadow.scale.setScalar(resolvedScale * 0.35);
      this.onBurst(world.x, PLATFORM_TOP + 0.2, world.z);
    }

    this.agents.push(agent);
    this.onChange(this.agents);
    return agent;
  }

  spawnAtScreenHint(u: number, v: number): { x: number; y: number; z: number } {
    const world = uvToWorld(u, v);
    return { x: world.x, y: PLATFORM_TOP, z: world.z };
  }

  clear(): void {
    for (const agent of [...this.agents]) this.remove(agent);
    this.select(null);
    this.onChange(this.agents);
  }

  remove(agent: PandaAgent): void {
    const index = this.agents.indexOf(agent);
    if (index === -1) return;
    this.agents.splice(index, 1);
    this.root.remove(agent.actor.group, agent.actor.shadow);
    if (this.selectedId === agent.id) this.select(null);
    this.onChange(this.agents);
  }

  removeById(id: number): boolean {
    const agent = this.get(id);
    if (!agent) return false;
    this.remove(agent);
    return true;
  }

  get(id: number): PandaAgent | undefined {
    return this.agents.find((agent) => agent.id === id);
  }

  get selected(): PandaAgent | null {
    return this.selectedId === null ? null : this.get(this.selectedId) ?? null;
  }

  select(agent: PandaAgent | null): void {
    this.selectedId = agent?.id ?? null;
    this.selectionRing.visible = Boolean(agent);
    if (agent) {
      this.selectionRing.scale.setScalar(agent.scale);
      this.selectionRing.position.set(agent.x, PLATFORM_TOP + 0.018, agent.z);
    }
    this.onChange(this.agents);
  }

  hitTest(raycaster: THREE.Raycaster): PandaAgent | null {
    let best: PandaAgent | null = null;
    let bestDistance = Infinity;
    for (const agent of this.agents) {
      const center = this.accumulator.set(
        agent.x,
        PLATFORM_TOP + 0.43 * agent.scale,
        agent.z,
      );
      const distance = raycaster.ray.distanceSqToPoint(center);
      const hitRadius = 0.42 * agent.scale;
      if (distance > hitRadius * hitRadius) continue;
      const along = raycaster.ray.origin.distanceTo(center);
      if (along < bestDistance) {
        bestDistance = along;
        best = agent;
      }
    }
    return best;
  }

  beginDrag(agent: PandaAgent): void {
    agent.dragging = true;
    agent.targetX = null;
    agent.targetZ = null;
    agent.actor.setAction("idle");
    agent.actor.group.position.y = PLATFORM_TOP + 0.22;
    agent.actor.shadow.position.y = PLATFORM_TOP + 0.008;
    agent.actor.shadow.scale.setScalar(agent.scale * 0.86);
    (agent.actor.shadow.material as THREE.MeshBasicMaterial).opacity = 0.13;
    this.select(agent);
  }

  dragToWorld(x: number, z: number): void {
    const agent = this.selected;
    if (!agent || !agent.dragging) return;
    const uv = worldToUv(x, z);
    const clampedU = THREE.MathUtils.clamp(uv.u, 0.035, 0.965);
    const clampedV = THREE.MathUtils.clamp(uv.v, 0.035, 0.965);
    const world = uvToWorld(clampedU, clampedV);
    agent.u = clampedU;
    agent.v = clampedV;
    agent.x = world.x;
    agent.z = world.z;
    agent.actor.group.position.set(world.x, PLATFORM_TOP + 0.22, world.z);
    agent.actor.shadow.position.set(world.x, PLATFORM_TOP + 0.008, world.z);
  }

  endDrag(): DropResult | null {
    const agent = this.selected;
    if (!agent || !agent.dragging) return null;
    const fromX = agent.x;
    const fromZ = agent.z;
    const walkable = this.isWalkableWorld(fromX, fromZ, agent.radius);
    const free = this.isFreeOfOthersWorld(fromX, fromZ, agent.radius, agent);
    const target = walkable && free
      ? { x: fromX, z: fromZ }
      : this.nearestFreeWorld(fromX, fromZ, agent);
    const uv = worldToUv(target.x, target.z);
    agent.u = uv.u;
    agent.v = uv.v;
    agent.x = target.x;
    agent.z = target.z;
    agent.homeU = uv.u;
    agent.homeV = uv.v;
    agent.dragging = false;
    agent.actor.group.position.set(target.x, PLATFORM_TOP, target.z);
    agent.actor.shadow.position.set(target.x, PLATFORM_TOP + 0.008, target.z);
    agent.actor.setScale(agent.scale);
    (agent.actor.shadow.material as THREE.MeshBasicMaterial).opacity = 0.34;
    agent.actor.setAction("idle");
    agent.action = "idle";
    agent.actionTimer = 1.2;
    this.selectionRing.position.set(target.x, PLATFORM_TOP + 0.018, target.z);
    this.onChange(this.agents);
    return { snapped: !(walkable && free), fromX, fromZ, toX: target.x, toZ: target.z };
  }

  cancelDrag(): void {
    const agent = this.selected;
    if (!agent || !agent.dragging) return;
    agent.dragging = false;
    const world = uvToWorld(agent.u, agent.v);
    agent.x = world.x;
    agent.z = world.z;
    agent.actor.group.position.set(agent.x, PLATFORM_TOP, agent.z);
    agent.actor.shadow.position.set(agent.x, PLATFORM_TOP + 0.008, agent.z);
    agent.actor.setScale(agent.scale);
    (agent.actor.shadow.material as THREE.MeshBasicMaterial).opacity = 0.34;
  }

  update(time: number, delta: number): void {
    if (this.frozen) {
      for (const agent of this.agents) agent.actor.update(0);
      return;
    }

    for (const agent of this.agents) {
      if (agent.spawnT < agent.spawnDuration) {
        agent.spawnT = Math.min(agent.spawnDuration, agent.spawnT + delta);
        const t = agent.spawnT / agent.spawnDuration;
        const eased = easeOutBack(t);
        agent.actor.group.scale.setScalar(agent.scale * eased);
        agent.actor.shadow.scale.setScalar(agent.scale * (0.35 + 0.65 * t));
        agent.actor.group.position.y = PLATFORM_TOP + (1 - t) * 0.08;
        agent.actor.update(delta);
        continue;
      }

      if (agent.dragging) {
        agent.actor.update(delta);
        continue;
      }

      agent.actionTimer -= delta;
      agent.nextLeaderCheck -= delta;

      if (agent.nextLeaderCheck <= 0) {
        this.updateLeader(agent);
        agent.nextLeaderCheck = this.random(1.1, 2.2);
      }

      if (agent.leaderId !== null) {
        const leader = this.get(agent.leaderId);
        if (!leader || leader.dragging) {
          agent.leaderId = null;
        } else {
          const dx = leader.x - agent.x;
          const dz = leader.z - agent.z;
          const distance = Math.hypot(dx, dz);
          if (distance > 0.95) {
            const angle = agent.id * 2.399 + 0.7;
            const offset = 0.88;
            agent.action = "walk";
            agent.targetX = leader.x + Math.cos(angle) * offset;
            agent.targetZ = leader.z + Math.sin(angle) * offset;
          } else if (agent.action === "walk") {
            agent.action = "idle";
            agent.targetX = null;
            agent.targetZ = null;
            agent.actor.setAction("idle");
          }
        }
      }

      if (agent.actionTimer <= 0 && agent.leaderId === null) {
        this.chooseAction(agent);
      }

      if (agent.action === "walk") {
        this.stepTowardTarget(agent, delta);
      }

      if (agent.actor.action !== agent.action) {
        agent.actor.setAction(agent.action);
        this.onChange(this.agents);
      }

      agent.actor.group.position.x = agent.x;
      agent.actor.group.position.z = agent.z;
      agent.actor.group.position.y = PLATFORM_TOP;
      agent.actor.shadow.position.x = agent.x;
      agent.actor.shadow.position.z = agent.z;
      agent.actor.setYaw(agent.facing);
      agent.actor.update(delta);
    }

    this.separate(delta);
    if (this.selected) {
      this.selectionRing.position.set(
        this.selected.x,
        PLATFORM_TOP + 0.018,
        this.selected.z,
      );
      this.selectionRing.scale.setScalar(this.selected.scale);
    }
  }

  isWalkableUv(u: number, v: number, radius = 0.2): boolean {
    const world = uvToWorld(u, v);
    return this.isWalkableWorld(world.x, world.z, radius);
  }

  isFreeOfOthersWorld(
    x: number,
    z: number,
    radius: number,
    ignore: PandaAgent | null = null,
    margin = 0.06,
  ): boolean {
    for (const other of this.agents) {
      if (other === ignore) continue;
      const min = radius + other.radius + margin;
      const dx = x - other.x;
      const dz = z - other.z;
      if (dx * dx + dz * dz < min * min) return false;
    }
    return true;
  }

  nearestFreeUv(u: number, v: number, radius: number): { u: number; v: number } {
    const world = uvToWorld(u, v);
    for (let r = 0.12; r <= 3.8; r += 0.12) {
      for (let i = 0; i < 28; i += 1) {
        const angle = (i / 28) * Math.PI * 2 + r * 0.43;
        const x = world.x + Math.cos(angle) * r;
        const z = world.z + Math.sin(angle) * r;
        if (
          this.isWalkableWorld(x, z, radius) &&
          this.isFreeOfOthersWorld(x, z, radius)
        ) {
          return worldToUv(x, z);
        }
      }
    }
    return this.nearestWalkableUv(u, v, radius);
  }

  isWalkableWorld(x: number, z: number, radius = 0.2): boolean {
    const sdf = roundedRectSdf(x, z, PLATFORM_SIZE * 0.5, PLATFORM_RADIUS);
    if (sdf > -(radius + 0.08)) return false;
    for (const obstacle of this.obstacles) {
      const dx = x - obstacle.x;
      const dz = z - obstacle.z;
      const min = obstacle.r + radius + 0.035;
      if (dx * dx + dz * dz < min * min) return false;
    }
    return true;
  }

  nearestWalkableUv(u: number, v: number, radius = 0.2): { u: number; v: number } {
    const world = uvToWorld(u, v);
    const nearest = this.nearestWalkableWorld(world.x, world.z, radius);
    return worldToUv(nearest.x, nearest.z);
  }

  nearestWalkableWorld(x: number, z: number, radius = 0.2): { x: number; z: number } {
    if (this.isWalkableWorld(x, z, radius)) return { x, z };
    for (let r = 0.12; r <= 4.2; r += 0.12) {
      for (let i = 0; i < 24; i += 1) {
        const angle = (i / 24) * Math.PI * 2 + r * 0.7;
        const nx = x + Math.cos(angle) * r;
        const nz = z + Math.sin(angle) * r;
        if (this.isWalkableWorld(nx, nz, radius)) return { x: nx, z: nz };
      }
    }
    return { x: 0, z: 0 };
  }

  private nearestFreeWorld(
    x: number,
    z: number,
    agent: PandaAgent,
  ): { x: number; z: number } {
    for (let r = 0.12; r <= 4.2; r += 0.12) {
      for (let i = 0; i < 24; i += 1) {
        const angle = (i / 24) * Math.PI * 2 + r * 0.7;
        const nx = x + Math.cos(angle) * r;
        const nz = z + Math.sin(angle) * r;
        if (
          this.isWalkableWorld(nx, nz, agent.radius) &&
          this.isFreeOfOthersWorld(nx, nz, agent.radius, agent)
        ) {
          return { x: nx, z: nz };
        }
      }
    }
    return this.nearestWalkableWorld(x, z, agent.radius);
  }

  private updateLeader(agent: PandaAgent): void {
    if (agent.scale >= 1.16) {
      agent.leaderId = null;
      return;
    }
    let best: PandaAgent | null = null;
    let bestScore = Infinity;
    for (const other of this.agents) {
      if (other === agent || other.dragging) continue;
      if (other.scale < agent.scale * 1.12) continue;
      const distance = Math.hypot(other.x - agent.x, other.z - agent.z);
      if (distance > 3.4) continue;
      const score = distance + other.scale * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }
    agent.leaderId = best?.id ?? null;
  }

  private chooseAction(agent: PandaAgent): void {
    let action: PandaAction = "idle";
    let total = 0;
    for (const entry of WALKABLE_ACTIONS) total += entry.weight;
    let roll = this.random(0, total);
    for (const entry of WALKABLE_ACTIONS) {
      roll -= entry.weight;
      if (roll <= 0) {
        action = entry.action;
        break;
      }
    }

    agent.action = action;
    agent.actionTimer = this.random(2.4, 4.9);
    agent.actor.setAction(action);
    if (action !== "walk") {
      agent.targetX = null;
      agent.targetZ = null;
      return;
    }

    const target = this.randomWanderPoint(agent);
    if (target) {
      agent.targetX = target.x;
      agent.targetZ = target.z;
    } else {
      agent.action = "idle";
      agent.actor.setAction("idle");
    }
  }

  private randomWanderPoint(agent: PandaAgent): { x: number; z: number } | null {
    const home = uvToWorld(agent.homeU, agent.homeV);
    for (let i = 0; i < 18; i += 1) {
      const angle = this.random(0, Math.PI * 2);
      const radius = Math.sqrt(this.random(0, 1)) * agent.homeRadius;
      const x = home.x + Math.cos(angle) * radius;
      const z = home.z + Math.sin(angle) * radius;
      if (this.isWalkableWorld(x, z, agent.radius)) return { x, z };
    }
    return null;
  }

  private stepTowardTarget(agent: PandaAgent, delta: number): void {
    if (agent.targetX === null || agent.targetZ === null) return;
    let dx = agent.targetX - agent.x;
    let dz = agent.targetZ - agent.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.1) {
      agent.targetX = null;
      agent.targetZ = null;
      agent.action = "idle";
      agent.actor.setAction("idle");
      agent.actionTimer = this.random(1.2, 2.8);
      return;
    }

    const speed = 0.58 + agent.scale * 0.12;
    const step = Math.min(distance, speed * delta);
    const nx = agent.x + (dx / distance) * step;
    const nz = agent.z + (dz / distance) * step;
    let moved = false;

    if (
      this.isWalkableWorld(nx, nz, agent.radius) &&
      this.isFreeOfOthersWorld(nx, nz, agent.radius, agent)
    ) {
      agent.x = nx;
      agent.z = nz;
      moved = true;
    } else if (
      this.isWalkableWorld(nx, agent.z, agent.radius) &&
      this.isFreeOfOthersWorld(nx, agent.z, agent.radius, agent)
    ) {
      agent.x = nx;
      moved = true;
    } else if (
      this.isWalkableWorld(agent.x, nz, agent.radius) &&
      this.isFreeOfOthersWorld(agent.x, nz, agent.radius, agent)
    ) {
      agent.z = nz;
      moved = true;
    }

    if (!moved) {
      agent.targetX = null;
      agent.targetZ = null;
      agent.action = "idle";
      agent.actor.setAction("idle");
      agent.actionTimer = this.random(0.8, 1.8);
      return;
    }

    const uv = worldToUv(agent.x, agent.z);
    agent.u = uv.u;
    agent.v = uv.v;
    const targetFacing = Math.atan2(dx, dz);
    agent.facing = this.dampAngle(agent.facing, targetFacing, 10 * delta);
  }

  private separate(delta: number): void {
    for (let i = 0; i < this.agents.length; i += 1) {
      const a = this.agents[i]!;
      if (a.dragging) continue;
      for (let j = i + 1; j < this.agents.length; j += 1) {
        const b = this.agents[j]!;
        if (b.dragging) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distance = Math.hypot(dx, dz);
        const minimum = a.radius + b.radius + 0.12;
        if (distance >= minimum || distance < 0.0001) continue;
        const overlap = minimum - distance;
        const nx = dx / distance;
        const nz = dz / distance;
        const aShare = a.scale < b.scale ? 0.68 : 0.32;
        const bShare = 1 - aShare;
        const ax = a.x - nx * overlap * aShare;
        const az = a.z - nz * overlap * aShare;
        const bx = b.x + nx * overlap * bShare;
        const bz = b.z + nz * overlap * bShare;
        if (this.isWalkableWorld(ax, az, a.radius)) {
          a.x = ax;
          a.z = az;
          const uv = worldToUv(a.x, a.z);
          a.u = uv.u;
          a.v = uv.v;
        }
        if (this.isWalkableWorld(bx, bz, b.radius)) {
          b.x = bx;
          b.z = bz;
          const uv = worldToUv(b.x, b.z);
          b.u = uv.u;
          b.v = uv.v;
        }
      }
    }
  }

  private random(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private dampAngle(current: number, target: number, lambda: number): number {
    let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return current + delta * Math.min(1, lambda);
  }
}

function roundedRectSdf(x: number, z: number, half: number, radius: number): number {
  const qx = Math.abs(x) - half + radius;
  const qz = Math.abs(z) - half + radius;
  return (
    Math.min(Math.max(qx, qz), 0) +
    Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) -
    radius
  );
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const p = t - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}
