import * as THREE from "three";

export interface CameraRigOptions {
  yaw?: number;
  pitch?: number;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3(0, 1.2, 0);
  yaw: number;
  pitch: number;
  distance = 20;
  readonly defaultYaw = 0.52;
  readonly defaultPitch = 0.84;
  private framePoints: THREE.Vector3[];
  private readonly projected = new THREE.Vector3();

  constructor(
    framePoints: THREE.Vector3[],
    aspect: number,
    options: CameraRigOptions = {},
  ) {
    this.framePoints = framePoints;
    this.yaw = options.yaw ?? this.defaultYaw;
    this.pitch = options.pitch ?? this.defaultPitch;
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 200);
    this.fit();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.fit();
  }

  setOrientation(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = THREE.MathUtils.clamp(pitch, THREE.MathUtils.degToRad(20), THREE.MathUtils.degToRad(65));
    this.fit();
  }

  reset(): void {
    this.yaw = this.defaultYaw;
    this.pitch = this.defaultPitch;
    this.fit();
  }

  private applyAt(distance: number): void {
    const cosPitch = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cosPitch * distance,
      this.target.y + Math.sin(this.pitch) * distance,
      this.target.z + Math.cos(this.yaw) * cosPitch * distance,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  private measure(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const point of this.framePoints) {
      this.projected.copy(point).project(this.camera);
      x = Math.max(x, Math.abs(this.projected.x));
      y = Math.max(y, Math.abs(this.projected.y));
    }
    return { x, y };
  }

  fit(): void {
    const targetX = 0.94;
    const targetY = 0.9;
    let low = 8;
    let high = 150;
    for (let i = 0; i < 32; i += 1) {
      const mid = (low + high) / 2;
      this.applyAt(mid);
      const measured = this.measure();
      if (measured.x <= targetX && measured.y <= targetY) high = mid;
      else low = mid;
    }
    this.distance = high;
    this.applyAt(this.distance);
  }

  project(point: THREE.Vector3): THREE.Vector3 {
    return point.clone().project(this.camera);
  }
}
