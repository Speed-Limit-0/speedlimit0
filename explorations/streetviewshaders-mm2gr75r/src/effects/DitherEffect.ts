/**
 * Ordered Dither post-processing Effect for Three.js / postprocessing.
 *
 * Implements real ordered (Bayer) dithering in a GLSL fragment shader:
 *  1. Quantize the image to N color levels
 *  2. Add a Bayer matrix threshold per-pixel before quantization
 *  3. The threshold offsets boundary pixels into the correct bin,
 *     producing the classic dithered pattern.
 */
import { Color, Uniform } from 'three';
import { Effect } from 'postprocessing';

const ditherFragment = /* glsl */ `
  uniform float uLevels;
  uniform float uBayerSize;
  uniform float uStrength;
  uniform vec3 uForegroundColor;
  uniform vec3 uBackgroundColor;

  // 8x8 Bayer matrix (normalized 0..1)
  float bayer8(vec2 p) {
    // 2x2 base
    float b2 = mod(floor(p.x) + 2.0 * mod(floor(p.y), 2.0), 4.0);
    // 4x4
    vec2 p2 = floor(p * 0.5);
    float b4 = b2 * 4.0 + mod(floor(p2.x) + 2.0 * mod(floor(p2.y), 2.0), 4.0);
    // 8x8
    vec2 p3 = floor(p2 * 0.5);
    float b8 = b4 * 4.0 + mod(floor(p3.x) + 2.0 * mod(floor(p3.y), 2.0), 4.0);
    return b8 / 64.0;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4 color = texture2D(inputBuffer, uv);

    // Pixel position scaled by Bayer pattern size
    vec2 bayerCoord = gl_FragCoord.xy / uBayerSize;

    // Bayer threshold (0..1)
    float threshold = bayer8(mod(bayerCoord, 8.0)) - 0.5;

    // Quantize each channel: add threshold offset, then snap to level
    float levels = max(uLevels, 2.0);
    vec3 dithered = floor((color.rgb + threshold * uStrength / levels) * levels + 0.5) / levels;

    float gray = dot(dithered, vec3(0.299, 0.587, 0.114));
    vec3 finalColor = mix(uBackgroundColor, uForegroundColor, gray);

    outputColor = vec4(finalColor, color.a);
  }
`;

export interface DitherEffectOptions {
    levels?: number;
    bayerSize?: number;
    strength?: number;
    foregroundColor?: string;
    backgroundColor?: string;
}

export class DitherEffect extends Effect {
    constructor({
        levels = 8,
        bayerSize = 1.0,
        strength = 1.0,
        foregroundColor = '#ffffff',
        backgroundColor = '#000000',
    }: DitherEffectOptions = {}) {
        const uniforms = new Map([
            ['uLevels', new Uniform(levels)],
            ['uBayerSize', new Uniform(bayerSize)],
            ['uStrength', new Uniform(strength)],
            ['uForegroundColor', new Uniform(new Color(foregroundColor))],
            ['uBackgroundColor', new Uniform(new Color(backgroundColor))],
        ]);

        super('DitherEffect', ditherFragment, { uniforms });
    }

    set levels(v: number) {
        this.uniforms.get('uLevels')!.value = v;
    }

    set bayerSize(v: number) {
        this.uniforms.get('uBayerSize')!.value = v;
    }

    set strength(v: number) {
        this.uniforms.get('uStrength')!.value = v;
    }

    set foregroundColor(v: string) {
        (this.uniforms.get('uForegroundColor')!.value as Color).set(v);
    }

    set backgroundColor(v: string) {
        (this.uniforms.get('uBackgroundColor')!.value as Color).set(v);
    }
}
