/**
 * Water ripple post-processing Effect for Three.js / postprocessing.
 *
 * Distorts UV coordinates with layered sine/cosine waves animated over time,
 * simulating the look of viewing a scene through gently moving water.
 */
import { Uniform } from 'three';
import { Effect } from 'postprocessing';

const waterFragment = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uStrength;
  uniform float uFrequency;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float t = uTime * uSpeed;
    vec2 p = uv * uFrequency;

    // Two-layer wave distortion for organic feel
    float dx = sin(p.y * 2.0 + t)       * cos(p.x * 1.7 + t * 0.8)
             + sin(p.x * 3.0 + t * 1.3) * 0.4;
    float dy = cos(p.x * 2.0 + t * 1.1) * sin(p.y * 1.5 + t * 0.6)
             + cos(p.y * 2.7 + t * 0.7) * 0.4;

    vec2 offset = vec2(dx, dy) * uStrength / resolution;
    outputColor = texture2D(inputBuffer, clamp(uv + offset, 0.001, 0.999));
  }
`;

export interface WaterEffectOptions {
    speed?: number;
    strength?: number;
    frequency?: number;
}

export class WaterEffect extends Effect {
    constructor({
        speed = 0.6,
        strength = 4.0,
        frequency = 3.0,
    }: WaterEffectOptions = {}) {
        const uniforms = new Map([
            ['uTime',      new Uniform(0)],
            ['uSpeed',     new Uniform(speed)],
            ['uStrength',  new Uniform(strength)],
            ['uFrequency', new Uniform(frequency)],
        ]);

        super('WaterEffect', waterFragment, { uniforms });
    }

    update(_renderer: unknown, _inputBuffer: unknown, deltaTime: number) {
        this.uniforms.get('uTime')!.value += deltaTime;
    }

    set speed(v: number)     { this.uniforms.get('uSpeed')!.value = v; }
    set strength(v: number)  { this.uniforms.get('uStrength')!.value = v; }
    set frequency(v: number) { this.uniforms.get('uFrequency')!.value = v; }
}
