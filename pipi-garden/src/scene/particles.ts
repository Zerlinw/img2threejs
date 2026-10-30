import * as THREE from "three";
import { makeStarTexture, mulberry32 } from "./procedural";

interface StarSprite {
  sprite: THREE.Sprite;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  spin: number;
  baseScale: number;
}

interface SpawnRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

/**
 * A tiny pooled star burst used when a lasso spawns a new panda. The sprite
 * textures are shared; only the inexpensive material clones are disposed.
 */
export class StarBurstSystem {
  private readonly root: THREE.Group;
  private readonly texture: THREE.CanvasTexture;
  private readonly rand = mulberry32(0x5a17);
  private readonly stars: StarSprite[] = [];
  private readonly rings: SpawnRing[] = [];
  private readonly ringGeometry = new THREE.RingGeometry(0.9, 1, 40);

  constructor(parent: THREE.Object3D) {
    this.root = new THREE.Group();
    this.root.name = "SpawnParticles";
    this.root.renderOrder = 30;
    parent.add(this.root);
    this.texture = makeStarTexture();
  }

  spawn(x: number, y: number, z: number): void {
    const count = 20;
    for (let i = 0; i < count; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.texture,
        color: i % 4 === 0 ? 0xffb7c5 : i % 3 === 0 ? 0xfff6d8 : 0xffd27a,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      const angle = this.rand() * Math.PI * 2;
      const radius = 0.04 + this.rand() * 0.18;
      sprite.position.set(x + Math.cos(angle) * radius, y + this.rand() * 0.16, z + Math.sin(angle) * radius);
      const scale = 0.18 + this.rand() * 0.18;
      sprite.scale.setScalar(scale);
      sprite.renderOrder = 31;
      this.root.add(sprite);
      const speed = 0.55 + this.rand() * 0.9;
      const lift = 0.75 + this.rand() * 0.9;
      this.stars.push({
        sprite,
        vx: Math.cos(angle) * speed,
        vy: lift,
        vz: Math.sin(angle) * speed,
        life: 0,
        maxLife: 1.0 + this.rand() * 0.4,
        spin: (this.rand() - 0.5) * 2,
        baseScale: scale,
      });
    }

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc76f,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(this.ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y - 0.06, z);
    ring.scale.setScalar(0.1);
    ring.renderOrder = 30;
    this.root.add(ring);
    this.rings.push({ mesh: ring, life: 0, maxLife: 0.68 });
  }

  update(delta: number): void {
    for (let i = this.stars.length - 1; i >= 0; i -= 1) {
      const star = this.stars[i]!;
      star.life += delta;
      const t = star.life / star.maxLife;
      if (t >= 1) {
        this.root.remove(star.sprite);
        (star.sprite.material as THREE.SpriteMaterial).dispose();
        this.stars.splice(i, 1);
        continue;
      }
      star.vy -= 1.4 * delta;
      star.sprite.position.x += star.vx * delta;
      star.sprite.position.y += star.vy * delta;
      star.sprite.position.z += star.vz * delta;
      star.sprite.material.rotation += star.spin * delta;
      star.sprite.material.opacity = 1 - t * t;
      const scale = star.baseScale * (0.7 + t * 0.8);
      star.sprite.scale.setScalar(scale);
    }

    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const ring = this.rings[i]!;
      ring.life += delta;
      const t = ring.life / ring.maxLife;
      if (t >= 1) {
        this.root.remove(ring.mesh);
        (ring.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
        continue;
      }
      ring.mesh.scale.setScalar(0.1 + t * 1.35);
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.55;
    }
  }
}
