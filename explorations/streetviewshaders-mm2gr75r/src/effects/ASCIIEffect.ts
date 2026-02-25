/**
 * ASCII post-processing Effect for Three.js / postprocessing.
 * Based on isladjan/ascii (MIT licensed).
 *
 * Renders the scene as ASCII art by:
 *  1. Pixelating the input into cells
 *  2. Computing luminance per cell
 *  3. Mapping luminance → character index
 *  4. Sampling a pre-rendered glyph atlas texture
 */
import {
    CanvasTexture,
    Color,
    NearestFilter,
    RepeatWrapping,
    Texture,
    Uniform,
} from 'three';
import { Effect } from 'postprocessing';

const asciiFragment = /* glsl */ `
  uniform sampler2D uCharacters;
  uniform float uCharactersCount;
  uniform float uCellSize;
  uniform bool uInvert;
  uniform vec3 uColor;
  uniform vec3 uBgColor;
  uniform bool uUseOriginalColor;

  const vec2 ATLAS_SIZE = vec2(16.0);

  float luminance(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Pixelate: snap UV to cell grid
    vec2 cell = resolution / uCellSize;
    vec2 grid = 1.0 / cell;
    vec2 pixelUV = grid * (0.5 + floor(uv / grid));
    vec4 pixelized = texture2D(inputBuffer, pixelUV);

    // Get brightness
    float bright = luminance(pixelized.rgb);
    if (uInvert) bright = 1.0 - bright;

    // Map brightness to character index
    float idx = floor((uCharactersCount - 1.0) * bright);
    vec2 charPos = vec2(mod(idx, ATLAS_SIZE.x), floor(idx / ATLAS_SIZE.y));
    vec2 offset = vec2(charPos.x, -charPos.y) / ATLAS_SIZE;
    vec2 charUV = mod(uv * (cell / ATLAS_SIZE), 1.0 / ATLAS_SIZE)
                  - vec2(0.0, 1.0 / ATLAS_SIZE) + offset;

    vec4 charSample = texture2D(uCharacters, charUV);

    // Color the character
    vec3 charColor = uUseOriginalColor ? pixelized.rgb : uColor;
    vec3 finalColor = mix(uBgColor, charColor, charSample.r);
    outputColor = vec4(finalColor, pixelized.a);
  }
`;

export interface ASCIIEffectOptions {
    characters?: string;
    font?: string;
    fontSize?: number;
    cellSize?: number;
    color?: string;
    bgColor?: string;
    invert?: boolean;
    useOriginalColor?: boolean;
}

export class ASCIIEffect extends Effect {
    constructor({
        characters = ` .:,'-^=*+?!|0#X%WM@`,
        font = 'arial',
        fontSize = 54,
        cellSize = 16,
        color = '#ffffff',
        bgColor = '#000000',
        invert = false,
        useOriginalColor = false,
    }: ASCIIEffectOptions = {}) {
        const uniforms = new Map([
            ['uCharacters', new Uniform(new Texture())],
            ['uCellSize', new Uniform(cellSize)],
            ['uCharactersCount', new Uniform(characters.length)],
            ['uColor', new Uniform(new Color(color))],
            ['uBgColor', new Uniform(new Color(bgColor))],
            ['uInvert', new Uniform(invert)],
            ['uUseOriginalColor', new Uniform(useOriginalColor)],
        ]);

        super('ASCIIEffect', asciiFragment, { uniforms });

        // Generate the glyph atlas texture
        const charUniform = this.uniforms.get('uCharacters');
        if (charUniform) {
            charUniform.value = this._createAtlas(characters, font, fontSize);
        }
    }

    /** Render all characters to a 1024×1024 atlas (16×16 grid). */
    private _createAtlas(characters: string, font: string, fontSize: number) {
        const SIZE = 1024;
        const MAX_PER_ROW = 16;
        const CELL = SIZE / MAX_PER_ROW;

        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = SIZE;

        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.font = `${fontSize}px ${font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';

        for (let i = 0; i < characters.length; i++) {
            const x = i % MAX_PER_ROW;
            const y = Math.floor(i / MAX_PER_ROW);
            ctx.fillText(characters[i], x * CELL + CELL / 2, y * CELL + CELL / 2);
        }

        const tex = new CanvasTexture(
            canvas,
            undefined,
            RepeatWrapping,
            RepeatWrapping,
            NearestFilter,
            NearestFilter
        );
        tex.needsUpdate = true;
        return tex;
    }

    set cellSize(v: number) {
        this.uniforms.get('uCellSize')!.value = v;
    }

    set color(v: string) {
        (this.uniforms.get('uColor')!.value as Color).set(v);
    }

    set bgColor(v: string) {
        (this.uniforms.get('uBgColor')!.value as Color).set(v);
    }

    set invert(v: boolean) {
        this.uniforms.get('uInvert')!.value = v;
    }

    set useOriginalColor(v: boolean) {
        this.uniforms.get('uUseOriginalColor')!.value = v;
    }
}
