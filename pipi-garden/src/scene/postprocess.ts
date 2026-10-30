import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export interface PostPipeline {
  composer: EffectComposer;
  setSize: (width: number, height: number, pixelRatio: number) => void;
  render: (fullQuality?: boolean) => void;
  setQuality: (fullQuality: boolean) => void;
}

const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uFocus: { value: 0.5 },
    uBand: { value: 0.13 },
    uBlur: { value: 2.8 },
    uContrast: { value: 1.06 },
    uSaturation: { value: 1.14 },
    uWarm: { value: new THREE.Color(0xffdfb0) },
    uCool: { value: new THREE.Color(0xbfdbe2) },
    uGrain: { value: 0.012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uPixelRatio;
    uniform float uFocus;
    uniform float uBand;
    uniform float uBlur;
    uniform float uContrast;
    uniform float uSaturation;
    uniform vec3 uWarm;
    uniform vec3 uCool;
    uniform float uGrain;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    vec4 blurNine(vec2 uv, vec2 stepUv) {
      vec4 c = texture2D(tDiffuse, uv) * 0.24;
      c += texture2D(tDiffuse, uv + vec2(stepUv.x, 0.0)) * 0.14;
      c += texture2D(tDiffuse, uv - vec2(stepUv.x, 0.0)) * 0.14;
      c += texture2D(tDiffuse, uv + vec2(0.0, stepUv.y)) * 0.14;
      c += texture2D(tDiffuse, uv - vec2(0.0, stepUv.y)) * 0.14;
      c += texture2D(tDiffuse, uv + stepUv) * 0.05;
      c += texture2D(tDiffuse, uv - stepUv) * 0.05;
      c += texture2D(tDiffuse, uv + vec2(stepUv.x, -stepUv.y)) * 0.05;
      c += texture2D(tDiffuse, uv + vec2(-stepUv.x, stepUv.y)) * 0.05;
      return c;
    }

    void main() {
      vec2 uv = vUv;
      float distanceFromFocus = abs(uv.y - uFocus);
      float blurAmount = smoothstep(uBand, uBand + 0.3, distanceFromFocus);
      vec2 stepUv = vec2(uBlur * uPixelRatio) / uResolution;

      vec4 center = texture2D(tDiffuse, uv);
      vec4 color = center;
      if (blurAmount > 0.005) {
        color = mix(center, blurNine(uv, stepUv), blurAmount * 0.9);
      }

      float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      color.rgb = mix(vec3(luma), color.rgb, uSaturation);
      color.rgb = (color.rgb - 0.5) * uContrast + 0.5;

      vec3 lightGradient = mix(uCool, uWarm, smoothstep(0.0, 1.0, uv.y));
      color.rgb += lightGradient * 0.032;

      float edge = smoothstep(0.18, 0.78, length((uv - 0.5) * vec2(1.0, 0.92)));
      color.rgb *= 1.0 - edge * 0.045;
      color.rgb += (hash(uv * uResolution) - 0.5) * uGrain;

      gl_FragColor = color;
    }
  `,
};

export function createPostPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostPipeline {
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      samples: 2,
    }),
  );
  composer.addPass(new RenderPass(scene, camera));
  const tiltShift = new ShaderPass(TiltShiftShader);
  composer.addPass(tiltShift);
  composer.addPass(new OutputPass());

  const setSize = (width: number, height: number, pixelRatio: number): void => {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    tiltShift.uniforms.uResolution!.value.set(
      Math.max(1, Math.floor(width * pixelRatio)),
      Math.max(1, Math.floor(height * pixelRatio)),
    );
    tiltShift.uniforms.uPixelRatio!.value = pixelRatio;
    tiltShift.uniforms.uBlur!.value = 2.8 * THREE.MathUtils.clamp(
      Math.min(width, height) / 1000,
      0.35,
      1,
    );
  };

  let fullQuality = true;
  const setQuality = (value: boolean): void => {
    fullQuality = value;
    tiltShift.enabled = value;
  };

  return {
    composer,
    setSize,
    setQuality,
    render: (value = fullQuality) => {
      if (value) composer.render();
      else renderer.render(scene, camera);
    },
  };
}
