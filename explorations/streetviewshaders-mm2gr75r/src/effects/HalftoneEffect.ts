/**
 * Halftone / Screen-Print Effect for Three.js / postprocessing.
 *
 * Renders the scene as a classic halftone dot grid:
 *  1. Rotates pixel coordinates by the screen angle
 *  2. Snaps to a dot-cell grid
 *  3. Samples scene luminance at each cell centre
 *  4. Draws a circular dot whose radius scales with darkness
 */
import { Color, Uniform } from 'three';
import { Effect } from 'postprocessing';

const halftoneFragment = /* glsl */ `
  uniform float uDotSize;
  uniform float uAngle;
  uniform float uSoftness;
  uniform vec3  uDotColor;
  uniform vec3  uBgColor;

  float luminance(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float cosA = cos(uAngle);
    float sinA = sin(uAngle);

    // Work in pixel coordinates, rotated by screen angle
    vec2 pix     = uv * resolution;
    vec2 rotPix  = vec2(cosA * pix.x - sinA * pix.y,
                        sinA * pix.x + cosA * pix.y);

    // Cell grid in rotated space
    vec2 cellID = floor(rotPix / uDotSize);
    vec2 localP = mod(rotPix, uDotSize) - uDotSize * 0.5; // centred in cell

    // Un-rotate cell centre to sample scene luminance
    vec2 cellCentreRot = (cellID + 0.5) * uDotSize;
    vec2 cellCentreW   = vec2(cosA * cellCentreRot.x + sinA * cellCentreRot.y,
                              -sinA * cellCentreRot.x + cosA * cellCentreRot.y);
    vec2 cellUV = clamp(cellCentreW / resolution, 0.001, 0.999);
    float lum   = luminance(texture2D(inputBuffer, cellUV).rgb);

    // Dot radius proportional to darkness; bright → small dot, dark → big dot
    float radius = (1.0 - lum) * uDotSize * 0.58;
    float dist   = length(localP);
    float edge   = max(uSoftness, 0.5);
    float dot    = smoothstep(radius + edge, radius - edge, dist);

    outputColor = vec4(mix(uBgColor, uDotColor, dot), inputColor.a);
  }
`;

export interface HalftoneEffectOptions {
    dotSize?: number;
    angle?: number;
    softness?: number;
    dotColor?: string;
    bgColor?: string;
}

export class HalftoneEffect extends Effect {
    constructor({
        dotSize = 6.0,
        angle = 0.26,   // ~15°
        softness = 1.0,
        dotColor = '#000000',
        bgColor = '#ffffff',
    }: HalftoneEffectOptions = {}) {
        const uniforms = new Map([
            ['uDotSize',  new Uniform(dotSize)],
            ['uAngle',    new Uniform(angle)],
            ['uSoftness', new Uniform(softness)],
            ['uDotColor', new Uniform(new Color(dotColor))],
            ['uBgColor',  new Uniform(new Color(bgColor))],
        ]);

        super('HalftoneEffect', halftoneFragment, { uniforms });
    }

    set dotSize(v: number)  { this.uniforms.get('uDotSize')!.value = v; }
    set angle(v: number)    { this.uniforms.get('uAngle')!.value = v; }
    set softness(v: number) { this.uniforms.get('uSoftness')!.value = v; }
    set dotColor(v: string) { (this.uniforms.get('uDotColor')!.value as Color).set(v); }
    set bgColor(v: string)  { (this.uniforms.get('uBgColor')!.value as Color).set(v); }
}
