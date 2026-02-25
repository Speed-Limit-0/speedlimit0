/**
 * StreetViewGodRaysEffect
 *
 * A screen-space volumetric light-ray (god-rays) post-processing effect
 * designed for use with equirectangular panorama imagery (e.g. Google Street View).
 *
 * Technique: radial blur / light scattering in screen space.
 * Since we have no depth buffer from the panorama, we use the scene's
 * luminance as an occlusion proxy — darker pixels block more light,
 * brighter pixels scatter more.
 *
 * Inspired by Maxime Heckel's "On Shaping Light" article and the classic
 * Crepuscular Rays / Volumetric Light Scattering GPU Gems technique.
 */
import * as THREE from 'three';
import { Effect, BlendFunction } from 'postprocessing';

// ─── GLSL Fragment Shader ─────────────────────────────────────────────────────
const fragmentShader = /* glsl */ `
  uniform vec2 lightScreenPos;
  uniform float exposure;
  uniform float decay;
  uniform float density;
  uniform float weight;
  uniform int maxSamples;
  uniform float time;
  uniform float luminanceThreshold;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // ITU-R BT.709 luminance weights
  float getLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  // Simple pseudo-random hash for per-pixel jitter to reduce banding
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // ── Main image function (postprocessing library convention) ─────────────────
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // The original scene colour at this pixel
    vec4 sceneColor = inputColor;

    // Direction vector from this pixel toward the light, scaled by density
    vec2 delta = (lightScreenPos - uv) * density / float(maxSamples);

    // Per-pixel blue-noise-style jitter using time to animate across frames
    float jitter = hash(uv * 1000.0 + time * 0.1);
    vec2 coord = uv + delta * jitter;

    float illumination = 0.0;
    float currentWeight = 1.0;

    // ── Radial sampling from pixel toward light source ──────────────────────
    for (int i = 0; i < 128; i++) {
      if (i >= maxSamples) break;

      coord += delta;

      // Clamp to valid texture range to avoid edge artifacts
      vec2 sampleCoord = clamp(coord, 0.001, 0.999);

      // Sample the original scene at this marched position
      vec4 sampleColor = texture2D(inputBuffer, sampleCoord);

      // Compute luminance of the sample
      float lum = getLuminance(sampleColor.rgb);

      // Bright areas scatter light; dark areas block it.
      // We use a soft threshold so only areas brighter than the threshold
      // contribute strongly to the rays.
      float scatter = smoothstep(luminanceThreshold, 1.0, lum);

      illumination += scatter * currentWeight;
      currentWeight *= decay;
    }

    // Final god-ray contribution
    float rayFactor = illumination * weight * exposure;

    // Add a warm, sun-like tint to the rays
    vec3 rayColor = vec3(1.0, 0.95, 0.85) * rayFactor;

    // Additive blend: original scene + god rays
    vec3 finalColor = sceneColor.rgb + rayColor;

    outputColor = vec4(finalColor, sceneColor.a);
  }
`;

// ─── Effect Implementation ────────────────────────────────────────────────────

export interface StreetViewGodRaysOptions {
    /** Light position in screen-space UV (0–1). Default: roughly upper-center. */
    lightScreenPos?: THREE.Vector2;
    /** Overall brightness multiplier for the rays. */
    exposure?: number;
    /** Intensity decay along each radial ray (0–1). Closer to 1 = longer rays. */
    decay?: number;
    /** Step density — higher = denser sampling. */
    density?: number;
    /** Weight of each individual sample. */
    weight?: number;
    /** Maximum number of samples per ray. Higher = better quality, slower. */
    maxSamples?: number;
    /** Luminance threshold below which pixels don't emit light. */
    luminanceThreshold?: number;
    /** Blend function for compositing. */
    blendFunction?: BlendFunction;
}

export class StreetViewGodRaysEffectImpl extends Effect {
    constructor({
        lightScreenPos = new THREE.Vector2(0.5, 0.3),
        exposure = 0.34,
        decay = 0.96,
        density = 0.8,
        weight = 0.6,
        maxSamples = 48,
        luminanceThreshold = 0.3,
        blendFunction = BlendFunction.NORMAL,
    }: StreetViewGodRaysOptions = {}) {
        const uniforms = new Map<string, THREE.IUniform>([
            ['lightScreenPos', new THREE.Uniform(lightScreenPos)],
            ['exposure', new THREE.Uniform(exposure)],
            ['decay', new THREE.Uniform(decay)],
            ['density', new THREE.Uniform(density)],
            ['weight', new THREE.Uniform(weight)],
            ['maxSamples', new THREE.Uniform(maxSamples)],
            ['luminanceThreshold', new THREE.Uniform(luminanceThreshold)],
            ['time', new THREE.Uniform(0.0)],
        ]);

        super('StreetViewGodRaysEffect', fragmentShader, {
            blendFunction,
            uniforms,
        });
    }

    /**
     * Called once per frame by the EffectComposer.
     * We use it to tick the `time` uniform for jitter animation.
     */
    update(
        _renderer: THREE.WebGLRenderer,
        _inputBuffer: THREE.WebGLRenderTarget,
        deltaTime?: number
    ) {
        const t = this.uniforms.get('time')!;
        t.value = (t.value as number) + (deltaTime ?? 0.016);
    }

    // ── Convenience setters ────────────────────────────────────────────────────

    set lightScreenPos(v: THREE.Vector2) {
        (this.uniforms.get('lightScreenPos')!.value as THREE.Vector2).copy(v);
    }

    set exposure(v: number) {
        this.uniforms.get('exposure')!.value = v;
    }

    set decay(v: number) {
        this.uniforms.get('decay')!.value = v;
    }

    set density(v: number) {
        this.uniforms.get('density')!.value = v;
    }

    set weight(v: number) {
        this.uniforms.get('weight')!.value = v;
    }

    set maxSamples(v: number) {
        this.uniforms.get('maxSamples')!.value = v;
    }

    set luminanceThreshold(v: number) {
        this.uniforms.get('luminanceThreshold')!.value = v;
    }
}
