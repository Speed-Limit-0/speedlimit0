/**
 * Oil Painting Effect — Fast 4-Quadrant Kuwahara Filter.
 *
 * Optional post-painting filters: saturation, contrast, brightness, vignette, temperature.
 * Palette / gradient-map presets (LUT-style) remap colors by luminance to a themed palette.
 */
import { Uniform } from 'three';
import { Effect } from 'postprocessing';

const paintingFragment = /* glsl */ `
  uniform float uScale;
  uniform float uSharpness;
  uniform float uSaturation;
  uniform float uContrast;
  uniform float uBrightness;
  uniform float uVignetteStrength;
  uniform float uVignetteFeather;
  uniform float uTemperature;
  uniform float uPalette;
  uniform float uPaletteAmount;

  // Gradient map: map luminance to a 2- or 3-stop palette. Returns color for given luma and preset index.
  vec3 gradientMap(float luma, int preset) {
    // Shadow, mid, highlight colors per preset (approximate)
    if (preset == 1) { // Sepia
      vec3 shadow = vec3(0.12, 0.08, 0.05);
      vec3 mid    = vec3(0.5, 0.42, 0.32);
      vec3 high   = vec3(0.92, 0.82, 0.65);
      if (luma < 0.5) return mix(shadow, mid, luma * 2.0);
      return mix(mid, high, (luma - 0.5) * 2.0);
    }
    if (preset == 2) { // Noir (B&W)
      return vec3(luma, luma, luma);
    }
    if (preset == 3) { // Teal & Orange
      vec3 shadow = vec3(0.02, 0.12, 0.2);
      vec3 high   = vec3(0.98, 0.62, 0.22);
      return mix(shadow, high, luma);
    }
    if (preset == 4) { // Golden hour
      vec3 shadow = vec3(0.1, 0.06, 0.02);
      vec3 high   = vec3(0.98, 0.88, 0.5);
      return mix(shadow, high, luma);
    }
    if (preset == 5) { // Cool film
      vec3 shadow = vec3(0.06, 0.1, 0.22);
      vec3 high   = vec3(0.7, 0.88, 1.0);
      return mix(shadow, high, luma);
    }
    if (preset == 6) { // Vintage
      vec3 shadow = vec3(0.18, 0.14, 0.1);
      vec3 high   = vec3(0.9, 0.78, 0.6);
      return mix(shadow, high, luma);
    }
    if (preset == 7) { // Muted
      vec3 shadow = vec3(0.22, 0.26, 0.3);
      vec3 high   = vec3(0.78, 0.82, 0.86);
      return mix(shadow, high, luma);
    }
    if (preset == 8) { // Warm film
      vec3 shadow = vec3(0.18, 0.12, 0.08);
      vec3 high   = vec3(0.96, 0.86, 0.68);
      return mix(shadow, high, luma);
    }
    return vec3(luma); // fallback / none
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2  texel   = uScale / resolution;
    vec3  best    = inputColor.rgb;
    float bestVar = 1e9;

    for (int q = 0; q < 4; q++) {
      float sx = (q == 0 || q == 2) ? -1.0 : 1.0;
      float sy = (q == 0 || q == 1) ? -1.0 : 1.0;
      vec3  sum  = vec3(0.0);
      vec3  sum2 = vec3(0.0);
      for (float j = 0.0; j <= 2.0; j += 1.0) {
        for (float i = 0.0; i <= 2.0; i += 1.0) {
          vec3 c = texture2D(inputBuffer, uv + vec2(sx * i, sy * j) * texel).rgb;
          sum  += c;
          sum2 += c * c;
        }
      }
      vec3  mean     = sum  / 9.0;
      vec3  varVec   = sum2 / 9.0 - mean * mean;
      float variance = dot(varVec, vec3(0.299, 0.587, 0.114));
      if (variance < bestVar) {
        bestVar = variance;
        best    = mean;
      }
    }

    vec3 result = mix(best, inputColor.rgb + (inputColor.rgb - best) * uSharpness, uSharpness * 0.4);

    result *= uBrightness;
    result = (result - 0.5) * uContrast + 0.5;
    float luma = dot(result, vec3(0.299, 0.587, 0.114));
    result = mix(vec3(luma), result, uSaturation);
    result.r += uTemperature * 0.15;
    result.b -= uTemperature * 0.15;

    vec2 vUv = uv * (1.0 - uv.yx);
    float vignette = pow(vUv.x * vUv.y * 16.0, uVignetteFeather);
    result *= mix(1.0 - uVignetteStrength, 1.0, vignette);

    // Palette / gradient map (LUT-style)
    int p = int(uPalette);
    if (p >= 1 && uPaletteAmount > 0.0) {
      float l = dot(clamp(result, 0.0, 1.0), vec3(0.299, 0.587, 0.114));
      vec3 paletteColor = gradientMap(l, p);
      result = mix(result, paletteColor, uPaletteAmount);
    }

    outputColor = vec4(clamp(result, 0.0, 1.0), inputColor.a);
  }
`;

export interface PaintingEffectOptions {
    scale?: number;
    sharpness?: number;
    saturation?: number;
    contrast?: number;
    brightness?: number;
    vignetteStrength?: number;
    vignetteFeather?: number;
    temperature?: number;
    palette?: number;
    paletteAmount?: number;
}

export class PaintingEffect extends Effect {
    constructor({
        scale = 3.0,
        sharpness = 0.0,
        saturation = 1.0,
        contrast = 1.0,
        brightness = 1.0,
        vignetteStrength = 0.0,
        vignetteFeather = 0.5,
        temperature = 0.0,
        palette = 0,
        paletteAmount = 1.0,
    }: PaintingEffectOptions = {}) {
        const uniforms = new Map([
            ['uScale', new Uniform(scale)],
            ['uSharpness', new Uniform(sharpness)],
            ['uSaturation', new Uniform(saturation)],
            ['uContrast', new Uniform(contrast)],
            ['uBrightness', new Uniform(brightness)],
            ['uVignetteStrength', new Uniform(vignetteStrength)],
            ['uVignetteFeather', new Uniform(vignetteFeather)],
            ['uTemperature', new Uniform(temperature)],
            ['uPalette', new Uniform(palette)],
            ['uPaletteAmount', new Uniform(paletteAmount)],
        ]);

        super('PaintingEffect', paintingFragment, { uniforms });
    }

    set scale(v: number) {
        this.uniforms.get('uScale')!.value = v;
    }
    set sharpness(v: number) {
        this.uniforms.get('uSharpness')!.value = v;
    }
    set saturation(v: number) {
        this.uniforms.get('uSaturation')!.value = v;
    }
    set contrast(v: number) {
        this.uniforms.get('uContrast')!.value = v;
    }
    set brightness(v: number) {
        this.uniforms.get('uBrightness')!.value = v;
    }
    set vignetteStrength(v: number) {
        this.uniforms.get('uVignetteStrength')!.value = v;
    }
    set vignetteFeather(v: number) {
        this.uniforms.get('uVignetteFeather')!.value = v;
    }
    set temperature(v: number) {
        this.uniforms.get('uTemperature')!.value = v;
    }
    set palette(v: number) {
        this.uniforms.get('uPalette')!.value = v;
    }
    set paletteAmount(v: number) {
        this.uniforms.get('uPaletteAmount')!.value = v;
    }
}
