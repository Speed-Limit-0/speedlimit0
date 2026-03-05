import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';

// --- CONFIGURATION PARAMS ---
const params = {
    // Camera settings
    frustumSize: 4.901,
    cameraX: 21.213203435596434,
    cameraY: 10,
    cameraZ: 21.213203435596416,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    cameraRadius: 30,
    cameraAngle: 0.785398163397448, // radians, ~45 degrees
    // Content (world) transform
    contentOffsetX: 0,
    contentOffsetZ: 0,
    contentRotationY: 0,
    
    // Grass geometry & density
    bladeWidth: 0.12,
    bladeHeight: 1.9,
    instanceCount: 22000,
    fieldSize: 35,
    groundColor: '#24755a',
    
    // Dandelion settings
    dandelionCount: 120,
    dandelionStemColor: '#649673',
    dandelionFlowerColor: '#ffde21',
    dandelionWhiteColor: '#f0f0f0',
    
    // Wind settings
    macroScale: 0.05096,
    macroSpeed: 1.206,
    midScale: 0.09,
    midSpeed: 1.092,
    detailScale: 0.15729,
    detailSpeed: 1.398,
    windBend: 1.505,
    gentleBreeze: 0.15,
    
    // Grass lighting gradient (colors)
    baseColor: '#086852',
    tipColor: '#0c8814',
    windHighlightColor: '#e9ff99',
    greenVariationStrength: 0.27,
    warmTint: '#f3ffa3',
    coolTint: '#073122',
    
    // Debug lighting gradient map (post-process)
    gradientMapEnabled: true,
    gradientStrength: 0,
    gradientShadowColor: '#005470',
    gradientMidColor: '#ffd1d1',
    gradientHighlightColor: '#ffe8a8',
    
    // Kuwahara final pass (painterly / edge-preserving blur)
    kuwaharaEnabled: true,
    kuwaharaRadius: 4,
    kuwaharaRadiusY: 8,
    
    // Performance
    targetFPS: 24,
    
    // Actions
    regenerateGrass: () => setupGrass(),
    savePreset: () => exportCurrentParams()
};

function exportCurrentParams() {
    const snapshot = {
        frustumSize: params.frustumSize,
        cameraX: params.cameraX,
        cameraY: params.cameraY,
        cameraZ: params.cameraZ,
        targetX: params.targetX,
        targetY: params.targetY,
        targetZ: params.targetZ,
        cameraRadius: params.cameraRadius,
        cameraAngle: params.cameraAngle,
        contentOffsetX: params.contentOffsetX,
        contentOffsetZ: params.contentOffsetZ,
        contentRotationY: params.contentRotationY,
        bladeWidth: params.bladeWidth,
        bladeHeight: params.bladeHeight,
        instanceCount: params.instanceCount,
        fieldSize: params.fieldSize,
        groundColor: params.groundColor,
        dandelionCount: params.dandelionCount,
        dandelionStemColor: params.dandelionStemColor,
        dandelionFlowerColor: params.dandelionFlowerColor,
        dandelionWhiteColor: params.dandelionWhiteColor,
        macroScale: params.macroScale,
        macroSpeed: params.macroSpeed,
        midScale: params.midScale,
        midSpeed: params.midSpeed,
        detailScale: params.detailScale,
        detailSpeed: params.detailSpeed,
        windBend: params.windBend,
        gentleBreeze: params.gentleBreeze,
        baseColor: params.baseColor,
        tipColor: params.tipColor,
        windHighlightColor: params.windHighlightColor,
        greenVariationStrength: params.greenVariationStrength,
        warmTint: params.warmTint,
        coolTint: params.coolTint,
        gradientMapEnabled: params.gradientMapEnabled,
        gradientStrength: params.gradientStrength,
        gradientShadowColor: params.gradientShadowColor,
        gradientMidColor: params.gradientMidColor,
        gradientHighlightColor: params.gradientHighlightColor,
        kuwaharaEnabled: params.kuwaharaEnabled,
        kuwaharaRadius: params.kuwaharaRadius,
        kuwaharaRadiusY: params.kuwaharaRadiusY,
        targetFPS: params.targetFPS
    };

    const codeSnippet =
`// Saved grass shader preset
const grassPreset = ${JSON.stringify(snapshot, null, 2)};

// To apply, replace the defaults in params with these values.`;

    console.log(codeSnippet);

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeSnippet).then(() => {
            console.log('Grass preset copied to clipboard.');
        }).catch((err) => {
            console.warn('Failed to copy grass preset to clipboard:', err);
        });
    }
}

// 1. Scene, Camera, Renderer
const canvas = document.getElementById('c');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa7d8ff); // Stylized painted sky blue

// Group to hold ground and grass so we can move/rotate the whole field
const worldGroup = new THREE.Group();
scene.add(worldGroup);

const BASE_WIDTH = 1200;
const BASE_HEIGHT = 800;

const aspect = BASE_WIDTH / BASE_HEIGHT;
const camera = new THREE.OrthographicCamera(
    -params.frustumSize * aspect, 
    params.frustumSize * aspect, 
    params.frustumSize, 
    -params.frustumSize, 
    1, 100
);
camera.position.set(params.cameraX, params.cameraY, params.cameraZ);
camera.lookAt(params.targetX, params.targetY, params.targetZ);

function updateCameraFrustum() {
    const aspect = BASE_WIDTH / BASE_HEIGHT;
    camera.left = -params.frustumSize * aspect;
    camera.right = params.frustumSize * aspect;
    camera.top = params.frustumSize;
    camera.bottom = -params.frustumSize;
    camera.updateProjectionMatrix();
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(BASE_WIDTH, BASE_HEIGHT, false);
renderer.setPixelRatio(1);

function getPixelSize() {
    return { width: BASE_WIDTH, height: BASE_HEIGHT };
}

const pixelSize = getPixelSize();
// Render-to-texture target for full-screen post-processing (match canvas resolution)
const renderTarget = new THREE.WebGLRenderTarget(pixelSize.width, pixelSize.height, {
    depthBuffer: true,
    stencilBuffer: false
});

// Second RT: output of gradient pass, input to Kuwahara
const postTarget = new THREE.WebGLRenderTarget(pixelSize.width, pixelSize.height, {
    depthBuffer: false,
    stencilBuffer: false
});

// Post pass: gradient map only (no grain)
const postUniforms = {
    tScene: { value: null },
    uResolution: { value: new THREE.Vector2(pixelSize.width, pixelSize.height) },
    uGradientEnabled: { value: params.gradientMapEnabled },
    uGradientStrength: { value: params.gradientStrength },
    uShadowColor: { value: new THREE.Color(params.gradientShadowColor) },
    uMidColor: { value: new THREE.Color(params.gradientMidColor) },
    uHighlightColor: { value: new THREE.Color(params.gradientHighlightColor) }
};

const postVertexShader = `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const postFragmentShader = `
uniform sampler2D tScene;
uniform vec2 uResolution;
uniform bool uGradientEnabled;
uniform float uGradientStrength;
uniform vec3 uShadowColor;
uniform vec3 uMidColor;
uniform vec3 uHighlightColor;

varying vec2 vUv;

void main() {
    vec4 sceneColor = texture2D(tScene, vUv);

    if (uGradientEnabled) {
        float luma = dot(sceneColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        luma = clamp(luma, 0.0, 1.0);
        vec3 shadowToMid = mix(uShadowColor, uMidColor, smoothstep(0.0, 0.55, luma));
        vec3 midToHighlight = mix(uMidColor, uHighlightColor, smoothstep(0.45, 1.0, luma));
        float crossfade = smoothstep(0.25, 0.75, luma);
        vec3 gradientColor = mix(shadowToMid, midToHighlight, crossfade);
        sceneColor.rgb = mix(sceneColor.rgb, gradientColor, clamp(uGradientStrength, 0.0, 1.0));
    }

    gl_FragColor = sceneColor;
}
`;

const postScene = new THREE.Scene();
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
        vertexShader: postVertexShader,
        fragmentShader: postFragmentShader,
        uniforms: postUniforms,
        depthTest: false,
        depthWrite: false
    })
);
postQuad.frustumCulled = false;
postScene.add(postQuad);

// --- Kuwahara final pass (optimized: subsampled, elongated quadrants for longer strokes) ---
const kuwaharaUniforms = {
    tInput: { value: null },
    uResolution: { value: new THREE.Vector2(pixelSize.width, pixelSize.height) },
    uRadiusX: { value: params.kuwaharaRadius },
    uRadiusY: { value: params.kuwaharaRadiusY },
    uEnabled: { value: params.kuwaharaEnabled ? 1.0 : 0.0 }
};

const kuwaharaVertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Optimized: sample every 2 pixels (step=2), elongated quadrants (radiusY > radiusX = longer vertical strokes)
const kuwaharaFragmentShader = `
uniform sampler2D tInput;
uniform vec2 uResolution;
uniform float uRadiusX;
uniform float uRadiusY;
uniform float uEnabled;

varying vec2 vUv;

float luma(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec2 pixelSize = 1.0 / uResolution;
    vec4 orig = texture2D(tInput, vUv);

    if (uEnabled < 0.5 || uRadiusX < 0.5) {
        gl_FragColor = orig;
        return;
    }

    float rx = min(floor(uRadiusX + 0.5), 6.0);
    float ry = min(floor(uRadiusY + 0.5), 12.0);

    vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
    float s0 = 0.0, s1 = 0.0, s2 = 0.0, s3 = 0.0;
    float n0 = 0.0, n1 = 0.0, n2 = 0.0, n3 = 0.0;

    for (int dy = -12; dy <= 0; dy += 2) {
        for (int dx = -6; dx <= 0; dx += 2) {
            if (float(-dx) <= rx && float(-dy) <= ry) {
                vec2 uv = vUv + vec2(float(dx), float(dy)) * pixelSize;
                vec3 c = texture2D(tInput, uv).rgb;
                float L = luma(c);
                m0 += c;
                s0 += L * L;
                n0 += 1.0;
            }
        }
    }
    for (int dy = -12; dy <= 0; dy += 2) {
        for (int dx = 0; dx <= 6; dx += 2) {
            if (float(dx) <= rx && float(-dy) <= ry) {
                vec2 uv = vUv + vec2(float(dx), float(dy)) * pixelSize;
                vec3 c = texture2D(tInput, uv).rgb;
                float L = luma(c);
                m1 += c;
                s1 += L * L;
                n1 += 1.0;
            }
        }
    }
    for (int dy = 0; dy <= 12; dy += 2) {
        for (int dx = -6; dx <= 0; dx += 2) {
            if (float(-dx) <= rx && float(dy) <= ry) {
                vec2 uv = vUv + vec2(float(dx), float(dy)) * pixelSize;
                vec3 c = texture2D(tInput, uv).rgb;
                float L = luma(c);
                m2 += c;
                s2 += L * L;
                n2 += 1.0;
            }
        }
    }
    for (int dy = 0; dy <= 12; dy += 2) {
        for (int dx = 0; dx <= 6; dx += 2) {
            if (float(dx) <= rx && float(dy) <= ry) {
                vec2 uv = vUv + vec2(float(dx), float(dy)) * pixelSize;
                vec3 c = texture2D(tInput, uv).rgb;
                float L = luma(c);
                m3 += c;
                s3 += L * L;
                n3 += 1.0;
            }
        }
    }

    vec3 mean0 = n0 > 0.0 ? m0 / n0 : orig.rgb;
    vec3 mean1 = n1 > 0.0 ? m1 / n1 : orig.rgb;
    vec3 mean2 = n2 > 0.0 ? m2 / n2 : orig.rgb;
    vec3 mean3 = n3 > 0.0 ? m3 / n3 : orig.rgb;

    float var0 = n0 > 0.0 ? abs(s0 / n0 - luma(mean0) * luma(mean0)) : 1e10;
    float var1 = n1 > 0.0 ? abs(s1 / n1 - luma(mean1) * luma(mean1)) : 1e10;
    float var2 = n2 > 0.0 ? abs(s2 / n2 - luma(mean2) * luma(mean2)) : 1e10;
    float var3 = n3 > 0.0 ? abs(s3 / n3 - luma(mean3) * luma(mean3)) : 1e10;

    float vmin = min(min(var0, var1), min(var2, var3));
    vec3 result = orig.rgb;
    if (var0 <= vmin) result = mean0;
    else if (var1 <= vmin) result = mean1;
    else if (var2 <= vmin) result = mean2;
    else result = mean3;

    gl_FragColor = vec4(result, orig.a);
}
`;

const kuwaharaScene = new THREE.Scene();
const kuwaharaCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const kuwaharaQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
        vertexShader: kuwaharaVertexShader,
        fragmentShader: kuwaharaFragmentShader,
        uniforms: kuwaharaUniforms,
        depthTest: false,
        depthWrite: false
    })
);
kuwaharaQuad.frustumCulled = false;
kuwaharaScene.add(kuwaharaQuad);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(params.targetX, params.targetY, params.targetZ);
controls.update();

function syncCameraFromParams() {
    camera.position.set(params.cameraX, params.cameraY, params.cameraZ);
    camera.lookAt(params.targetX, params.targetY, params.targetZ);
    controls.target.set(params.targetX, params.targetY, params.targetZ);
    controls.update();
}

window.addEventListener('resize', () => {
    // Canvas resolution is fixed; CSS handles physical scaling.
});

// 2. Ground Plane
let ground;
function setupGround() {
    if (ground) {
        worldGroup.remove(ground);
        ground.geometry.dispose();
        ground.material.dispose();
    }
    const groundGeo = new THREE.PlaneGeometry(params.fieldSize * 1.5, params.fieldSize * 1.5);
    const groundMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(params.groundColor) }); 
    ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    worldGroup.add(ground);
}

// 3. Shared Uniforms & Shaders
const uniforms = {
    uTime: { value: 0.0 },
    
    // Wind parameters (bound to GUI)
    uMacroScale: { value: params.macroScale },
    uMacroOffset: { value: 0.0 },
    uMidScale: { value: params.midScale },
    uMidOffset: { value: 0.0 },
    uDetailScale: { value: params.detailScale },
    uDetailOffset: { value: 0.0 },
    uWindBend: { value: params.windBend },
    uGentleBreeze: { value: params.gentleBreeze },

    // Cursor interactions
    uCursorPos: { value: new THREE.Vector2(0, 0) },
    uCursorVelocity: { value: new THREE.Vector2(0, 1) },
    uCursorIntensity: { value: 0.0 },
    
    // Stylized flat colors (Impressionist / painted aesthetic)
    uBaseColor: { value: new THREE.Color(params.baseColor) },
    uTipColor: { value: new THREE.Color(params.tipColor) },
    uWindHighlightColor: { value: new THREE.Color(params.windHighlightColor) },
    uGreenVariationStrength: { value: params.greenVariationStrength },
    uWarmTint: { value: new THREE.Color(params.warmTint) },
    uCoolTint: { value: new THREE.Color(params.coolTint) }
};

const vertexShader = `
uniform float uTime;
uniform float uMacroScale;
uniform float uMacroOffset;
uniform float uMidScale;
uniform float uMidOffset;
uniform float uDetailScale;
uniform float uDetailOffset;
uniform float uWindBend;
uniform float uGentleBreeze;

uniform vec2 uCursorPos;
uniform vec2 uCursorVelocity;
uniform float uCursorIntensity;

attribute vec2 offset;
attribute float bladeRotation;
attribute float bladeScale;
attribute float vHeight;
attribute float greenVariation;

varying float v_Height;
varying float v_WindStrength;
varying float v_GreenVariation;

// 2D Simplex Noise function (Ashima Arts)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  float n = 0.0;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
    v_Height = vHeight;
    v_GreenVariation = greenVariation;
    
    vec3 localPos = position;
    
    // Shape the blade: smooth continuous taper to a rounded tip
    float widthMultiplier = pow(1.0 - vHeight, 0.5);
    localPos.x *= widthMultiplier;
    
    // Apply initial random rotation around Y axis
    float c = cos(bladeRotation);
    float s = sin(bladeRotation);
    mat2 rotY = mat2(c, s, -s, c);
    localPos.xz = rotY * localPos.xz;
    
    // Scale blade height individually
    localPos.y *= bladeScale;
    
    // Determine world coordinates for noise sampling
    vec2 worldPosXZ = offset + localPos.xz;
    
    // ----------------------
    // MULTI-LAYERED COMPLEX WIND
    // ----------------------
    
    // Base directions for different layers
    vec2 dir1 = normalize(vec2(1.0, 0.4));   // Main sweeping direction
    vec2 dir2 = normalize(vec2(-0.2, 1.0));  // Cross wind, perpendicular
    vec2 dir3 = normalize(vec2(0.5, -0.6));  // Swirling/breaking wind
    
    // 1. Macro-wave (Massive, slow rolling gusts)
    float n1 = snoise((worldPosXZ * uMacroScale) - (dir1 * uMacroOffset));
    n1 = (n1 + 1.0) * 0.5;
    
    // 2. Mid-wave (Breaks up the uniform bands)
    float n2 = snoise((worldPosXZ * uMidScale) - (dir2 * uMidOffset));
    n2 = (n2 + 1.0) * 0.5;
    
    // 3. Detail-wave (Adds organic chaos and swirling)
    float n3 = snoise((worldPosXZ * uDetailScale) - (dir3 * uDetailOffset));
    n3 = (n3 + 1.0) * 0.5;
    
    // Original noise force
    vec2 noiseForce = (dir1 * n1 * 1.2) + (dir2 * n2 * 0.7) + (dir3 * n3 * 0.5);
    
    // Cursor Interaction: radial spread away from cursor
    float distToCursor = distance(worldPosXZ, uCursorPos);
    // Falloff radius: 3.0 units
    float cursorInfluence = smoothstep(3.0, 0.0, distToCursor);
    float activeWind = uCursorIntensity * cursorInfluence * 0.65;
    
    // Push grass radially away from cursor
    vec2 fromCursor = worldPosXZ - uCursorPos;
    vec2 pushDir = length(fromCursor) > 0.0001 ? normalize(fromCursor) : vec2(0.0, 1.0);
    vec2 cursorForce = pushDir * activeWind;
    
    // Combine base wind and cursor wind
    vec2 windForce = noiseForce + cursorForce;
    
    // Extract strength and normalized direction from the combined force
    float totalWind = length(windForce);
    vec2 finalDir = normalize(windForce + vec2(0.0001)); // prevent zero vector
    
    // We want the visual highlight (bright color patches) to follow the macro waves
    // so the field still has unified patches of light, even if the physics are swirling.
    float highlightStrength = smoothstep(0.3, 0.9, (n1 * 0.75) + (n2 * 0.25));
    // Subtly boost highlight where cursor touches
    highlightStrength = clamp(highlightStrength + activeWind * 0.5, 0.0, 1.0);
    v_WindStrength = highlightStrength; 
    
    // Apply displacement
    // Distribute bend down the blade, scale up for wide sweeping motion
    float bendAmount = totalWind * pow(vHeight, 1.2) * uWindBend;
    
    // Base gentle breeze so it's never completely still (uses instance position for randomness)
    float breeze = sin(uTime * 1.2 + worldPosXZ.x * 0.8 + worldPosXZ.y * 0.8) * uGentleBreeze * pow(vHeight, 1.2);
    bendAmount += breeze;
    
    // Move vertices horizontally based on the COMPLEX wind direction
    vec2 windVector = finalDir * bendAmount;
    localPos.x += windVector.x;
    localPos.z += windVector.y; // z in 3D maps to y in 2D noise
    
    // Minimal Y drop to keep blades upright
    float dispDist = length(windVector);
    localPos.y -= dispDist * 0.004;
    
    // Finalize position by adding the instance's world offset
    vec3 finalPos = localPos;
    finalPos.x += offset.x;
    finalPos.z += offset.y;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
}
`;

const fragmentShader = `
uniform vec3 uBaseColor;
uniform vec3 uTipColor;
uniform vec3 uWindHighlightColor;
uniform float uGreenVariationStrength;
uniform vec3 uWarmTint;
uniform vec3 uCoolTint;

varying float v_Height;
varying float v_WindStrength;
varying float v_GreenVariation;

void main() {
    // ----------------------
    // FLAT, STYLIZED SHADING
    // ----------------------
    // Vertical gradient from dark roots to bright tips
    vec3 color = mix(uBaseColor, uTipColor, v_Height);
    
    // Wind highlight: When grass is pushed down by macro gusts, it catches the "light"
    // We smoothstep the height so the root stays dark, and the highlight is strongest at the tips
    float highlightFactor = smoothstep(0.5, 1.0, v_Height) * v_WindStrength;
    
    // Add the stylized wind highlight color
    color = mix(color, uWindHighlightColor, highlightFactor * 0.9);
    
    // Green variation: per-blade warm (yellower) vs cool (teal) tint
    vec3 tint = mix(uCoolTint, uWarmTint, v_GreenVariation);
    color = mix(color, tint, uGreenVariationStrength);
    
    gl_FragColor = vec4(color, 1.0);
}
`;

// ----------------------
// DANDELION SHADERS & GEOMETRY
// ----------------------

const dandelionUniforms = {
    uTime: uniforms.uTime,
    uMacroScale: uniforms.uMacroScale,
    uMacroOffset: uniforms.uMacroOffset,
    uMidScale: uniforms.uMidScale,
    uMidOffset: uniforms.uMidOffset,
    uDetailScale: uniforms.uDetailScale,
    uDetailOffset: uniforms.uDetailOffset,
    uWindBend: uniforms.uWindBend,
    uGentleBreeze: uniforms.uGentleBreeze,
    uCursorPos: uniforms.uCursorPos,
    uCursorVelocity: uniforms.uCursorVelocity,
    uCursorIntensity: uniforms.uCursorIntensity,
    uStemColor: { value: new THREE.Color(params.dandelionStemColor) },
    uFlowerColor: { value: new THREE.Color(params.dandelionFlowerColor) },
    uWhiteColor: { value: new THREE.Color(params.dandelionWhiteColor) }
};

const dandelionVertexShader = `
uniform float uTime;
uniform float uMacroScale;
uniform float uMacroOffset;
uniform float uMidScale;
uniform float uMidOffset;
uniform float uDetailScale;
uniform float uDetailOffset;
uniform float uWindBend;
uniform float uGentleBreeze;

uniform vec2 uCursorPos;
uniform vec2 uCursorVelocity;
uniform float uCursorIntensity;

attribute vec2 offset;
attribute float bladeRotation;
attribute float bladeScale;
attribute float vHeight;
attribute float flowerPart;
attribute float seedVariation;

varying float v_Height;
varying float v_WindStrength;
varying float v_FlowerPart;
varying float v_SeedVariation;

// 2D Simplex Noise function
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  float n = 0.0;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
    v_Height = vHeight;
    v_FlowerPart = flowerPart;
    v_SeedVariation = seedVariation;
    
    vec3 localPos = position;
    
    // Apply initial random rotation around Y axis
    float c = cos(bladeRotation);
    float s = sin(bladeRotation);
    mat2 rotY = mat2(c, s, -s, c);
    localPos.xz = rotY * localPos.xz;
    
    // Scale size individually
    localPos *= bladeScale;

    // Push dandelions up slightly to ensure they stand above grass
    localPos.y += 0.2;
    
    // Determine world coordinates for noise sampling
    vec2 worldPosXZ = offset + localPos.xz;
    
    // ----------------------
    // MULTI-LAYERED COMPLEX WIND
    // ----------------------
    vec2 dir1 = normalize(vec2(1.0, 0.4));
    vec2 dir2 = normalize(vec2(-0.2, 1.0));
    vec2 dir3 = normalize(vec2(0.5, -0.6));
    
    float n1 = snoise((worldPosXZ * uMacroScale) - (dir1 * uMacroOffset));
    n1 = (n1 + 1.0) * 0.5;
    float n2 = snoise((worldPosXZ * uMidScale) - (dir2 * uMidOffset));
    n2 = (n2 + 1.0) * 0.5;
    float n3 = snoise((worldPosXZ * uDetailScale) - (dir3 * uDetailOffset));
    n3 = (n3 + 1.0) * 0.5;
    
    vec2 noiseForce = (dir1 * n1 * 1.2) + (dir2 * n2 * 0.7) + (dir3 * n3 * 0.5);
    
    float distToCursor = distance(worldPosXZ, uCursorPos);
    float cursorInfluence = smoothstep(3.0, 0.0, distToCursor);
    float activeWind = uCursorIntensity * cursorInfluence * 0.65;
    
    vec2 fromCursor = worldPosXZ - uCursorPos;
    vec2 pushDir = length(fromCursor) > 0.0001 ? normalize(fromCursor) : vec2(0.0, 1.0);
    vec2 cursorForce = pushDir * activeWind;
    
    vec2 windForce = noiseForce + cursorForce;
    float totalWind = length(windForce);
    vec2 finalDir = normalize(windForce + vec2(0.0001));
    
    float highlightStrength = smoothstep(0.3, 0.9, (n1 * 0.75) + (n2 * 0.25));
    highlightStrength = clamp(highlightStrength + activeWind * 0.5, 0.0, 1.0);
    v_WindStrength = highlightStrength; 
    
    float bendAmount = totalWind * pow(vHeight, 1.2) * uWindBend;
    float breeze = sin(uTime * 1.2 + worldPosXZ.x * 0.8 + worldPosXZ.y * 0.8) * uGentleBreeze * pow(vHeight, 1.2);
    bendAmount += breeze;
    
    vec2 windVector = finalDir * bendAmount;
    localPos.x += windVector.x;
    localPos.z += windVector.y;
    
    float dispDist = length(windVector);
    localPos.y -= dispDist * 0.004;
    
    vec3 finalPos = localPos;
    finalPos.x += offset.x;
    finalPos.z += offset.y;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
}
`;

const dandelionFragmentShader = `
uniform vec3 uStemColor;
uniform vec3 uFlowerColor;
uniform vec3 uWhiteColor;

varying float v_Height;
varying float v_WindStrength;
varying float v_FlowerPart;
varying float v_SeedVariation;

void main() {
    // Determine if it's a yellow flower or a white seed head (50% chance for white seed head)
    vec3 headColor = mix(uFlowerColor, uWhiteColor, step(0.5, v_SeedVariation));
    
    vec3 color = mix(uStemColor, headColor, v_FlowerPart);
    
    // Wind highlight
    float highlightFactor = smoothstep(0.5, 1.0, v_Height) * v_WindStrength;
    color = mix(color, vec3(1.0, 1.0, 1.0), highlightFactor * 0.3 * v_FlowerPart);
    
    gl_FragColor = vec4(color, 1.0);
}
`;

function createDandelionGeometry() {
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const vHeights = [];
    const flowerParts = [];
    
    const stemHeight = params.bladeHeight * 0.75; 
    const stemWidth = params.bladeWidth * 0.4; // Thinner stem
    const headRadius = 0.16; 
    const centerY = stemHeight;
    const numSpikes = 8;
    const segments = 64; // Higher detail for rounded spikes

    function addPlane(rotationAngle) {
        const c = Math.cos(rotationAngle);
        const s = Math.sin(rotationAngle);
        
        function rotateX(x, z) { return x * c - z * s; }
        function rotateZ(x, z) { return x * s + z * c; }

        // Stem
        let x1 = -stemWidth/2, z1 = 0;
        let x2 = stemWidth/2, z2 = 0;
        
        let rx1 = rotateX(x1, z1), rz1 = rotateZ(x1, z1);
        let rx2 = rotateX(x2, z2), rz2 = rotateZ(x2, z2);

        positions.push(rx1, 0, rz1); vHeights.push(0); flowerParts.push(0);
        positions.push(rx2, 0, rz2); vHeights.push(0); flowerParts.push(0);
        positions.push(rx1, stemHeight, rz1); vHeights.push(1); flowerParts.push(0);
        
        positions.push(rx1, stemHeight, rz1); vHeights.push(1); flowerParts.push(0);
        positions.push(rx2, 0, rz2); vHeights.push(0); flowerParts.push(0);
        positions.push(rx2, stemHeight, rz2); vHeights.push(1); flowerParts.push(0);

        // Head (rounded petals/spikes)
        for (let i = 0; i < segments; i++) {
            const angle1 = (i / segments) * Math.PI * 2;
            const angle2 = ((i + 1) / segments) * Math.PI * 2;
            
            // Use a smooth power-cosine function to create thick, rounded petals
            const getRadius = (a) => {
                const spike = Math.abs(Math.cos(a * numSpikes / 2));
                return headRadius * (0.1 + 0.9 * Math.pow(spike, 1.5)); // Higher power = thinner petals
            };
            
            const r1 = getRadius(angle1);
            const r2 = getRadius(angle2);
            
            const hx1 = Math.cos(angle1) * r1;
            const hy1 = centerY + Math.sin(angle1) * r1;
            const hx2 = Math.cos(angle2) * r2;
            const hy2 = centerY + Math.sin(angle2) * r2;
            
            let hrx1 = rotateX(hx1, 0), hrz1 = rotateZ(hx1, 0);
            let hrx2 = rotateX(hx2, 0), hrz2 = rotateZ(hx2, 0);
            let hrx0 = rotateX(0, 0), hrz0 = rotateZ(0, 0);
            
            positions.push(hrx0, centerY, hrz0); vHeights.push(1); flowerParts.push(1);
            positions.push(hrx1, hy1, hrz1); vHeights.push(1); flowerParts.push(1);
            positions.push(hrx2, hy2, hrz2); vHeights.push(1); flowerParts.push(1);
        }
    }

    // Intersecting planes for a fluffy asterisk volume
    const numPlanes = 4;
    for (let i = 0; i < numPlanes; i++) {
        addPlane((i / numPlanes) * Math.PI);
    }
    
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('vHeight', new THREE.Float32BufferAttribute(vHeights, 1));
    geom.setAttribute('flowerPart', new THREE.Float32BufferAttribute(flowerParts, 1));
    
    return geom;
}

let dandelionMesh = null;

function setupDandelions() {
    if (dandelionMesh) {
        worldGroup.remove(dandelionMesh);
        dandelionMesh.geometry.dispose();
        dandelionMesh.material.dispose();
    }
    
    const baseGeom = createDandelionGeometry();
    const instancedGeom = new THREE.InstancedBufferGeometry();
    instancedGeom.index = baseGeom.index;
    instancedGeom.attributes.position = baseGeom.attributes.position;
    instancedGeom.attributes.vHeight = baseGeom.attributes.vHeight;
    instancedGeom.attributes.flowerPart = baseGeom.attributes.flowerPart;

    const offsetArray = new Float32Array(params.dandelionCount * 2);
    const rotationArray = new Float32Array(params.dandelionCount);
    const scaleArray = new Float32Array(params.dandelionCount);
    const seedVariationArray = new Float32Array(params.dandelionCount);

    for (let i = 0; i < params.dandelionCount; i++) {
        const x = (Math.random() - 0.5) * params.fieldSize;
        const z = (Math.random() - 0.5) * params.fieldSize;
        offsetArray[i * 2 + 0] = x;
        offsetArray[i * 2 + 1] = z;
        
        // Random size and rotation
        rotationArray[i] = Math.random() * Math.PI * 2;
        scaleArray[i] = 0.9 + Math.random() * 0.3; // 2x larger again
        seedVariationArray[i] = Math.random();
    }

    instancedGeom.setAttribute('offset', new THREE.InstancedBufferAttribute(offsetArray, 2));
    instancedGeom.setAttribute('bladeRotation', new THREE.InstancedBufferAttribute(rotationArray, 1));
    instancedGeom.setAttribute('bladeScale', new THREE.InstancedBufferAttribute(scaleArray, 1));
    instancedGeom.setAttribute('seedVariation', new THREE.InstancedBufferAttribute(seedVariationArray, 1));

    const material = new THREE.ShaderMaterial({
        vertexShader: dandelionVertexShader,
        fragmentShader: dandelionFragmentShader,
        uniforms: dandelionUniforms,
        side: THREE.DoubleSide
    });

    dandelionMesh = new THREE.Mesh(instancedGeom, material);
    dandelionMesh.frustumCulled = false; 
    worldGroup.add(dandelionMesh);
}

// 4. Grass Generation
let grassMesh = null;

function setupGrass() {
    if (grassMesh) {
        worldGroup.remove(grassMesh);
        grassMesh.geometry.dispose();
        grassMesh.material.dispose();
    }
    
    setupGround();

    const segments = 10;

    // Base geometry: simple plane strip
    const baseGeom = new THREE.PlaneGeometry(params.bladeWidth, params.bladeHeight, 1, segments);
    baseGeom.translate(0, params.bladeHeight / 2, 0); // Bottom at Y=0

    // Calculate height for each vertex (0.0 at root, 1.0 at tip)
    const positionAttr = baseGeom.attributes.position;
    const vHeightArray = new Float32Array(positionAttr.count);
    for (let i = 0; i < positionAttr.count; i++) {
        vHeightArray[i] = positionAttr.getY(i) / params.bladeHeight;
    }
    baseGeom.setAttribute('vHeight', new THREE.BufferAttribute(vHeightArray, 1));

    // Instancing
    const instancedGeom = new THREE.InstancedBufferGeometry();
    instancedGeom.index = baseGeom.index;
    instancedGeom.attributes.position = baseGeom.attributes.position;
    instancedGeom.attributes.uv = baseGeom.attributes.uv;
    instancedGeom.attributes.vHeight = baseGeom.attributes.vHeight;

    // Per-instance attributes
    const offsetArray = new Float32Array(params.instanceCount * 2);
    const rotationArray = new Float32Array(params.instanceCount);
    const scaleArray = new Float32Array(params.instanceCount);
    const greenVariationArray = new Float32Array(params.instanceCount);

    for (let i = 0; i < params.instanceCount; i++) {
        // Random position across the ground plane
        const x = (Math.random() - 0.5) * params.fieldSize;
        const z = (Math.random() - 0.5) * params.fieldSize;
        
        offsetArray[i * 2 + 0] = x;
        offsetArray[i * 2 + 1] = z;
        
        // Random Y-axis rotation (fully random for top-down by default)
        rotationArray[i] = Math.random() * Math.PI * 2;
        // Slightly varying blade length (subtle variation around 1.0)
        scaleArray[i] = 0.88 + Math.random() * 0.24;
        // Green variation: 0 = cool (teal), 1 = warm (yellower) for natural variation
        greenVariationArray[i] = Math.random();
    }

    instancedGeom.setAttribute('offset', new THREE.InstancedBufferAttribute(offsetArray, 2));
    instancedGeom.setAttribute('bladeRotation', new THREE.InstancedBufferAttribute(rotationArray, 1));
    instancedGeom.setAttribute('bladeScale', new THREE.InstancedBufferAttribute(scaleArray, 1));
    instancedGeom.setAttribute('greenVariation', new THREE.InstancedBufferAttribute(greenVariationArray, 1));

    const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        side: THREE.DoubleSide
    });

    grassMesh = new THREE.Mesh(instancedGeom, material);
    grassMesh.frustumCulled = false; 
    worldGroup.add(grassMesh);
    
    setupDandelions();
}

function updateWorldTransform() {
    worldGroup.position.set(params.contentOffsetX, 0, params.contentOffsetZ);
    worldGroup.rotation.y = params.contentRotationY;
}

// Initial generation
setupGrass();
updateWorldTransform();

// 5. GUI Setup
const gui = new GUI({ title: 'Grass Explorer' });
gui.close();
gui.hide();

window.addEventListener('keydown', (event) => {
    // Cmd+D or Ctrl+D to toggle GUI
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        if (gui._hidden) {
            gui.show();
        } else {
            gui.hide();
        }
    }
});

const camFolder = gui.addFolder('Camera Settings');
camFolder.add(params, 'frustumSize', 1, 30).onChange(updateCameraFrustum);
camFolder.add(params, 'cameraX', -50, 50).onChange(() => {
    syncCameraFromParams();
});
camFolder.add(params, 'cameraY', -50, 50).onChange(() => {
    syncCameraFromParams();
});
camFolder.add(params, 'cameraZ', -50, 50).onChange(() => {
    syncCameraFromParams();
});
camFolder.add(params, 'targetX', -50, 50).onChange(() => {
    syncCameraFromParams();
});
camFolder.add(params, 'targetY', -50, 50).onChange(() => {
    syncCameraFromParams();
});
camFolder.add(params, 'targetZ', -50, 50).onChange(() => {
    syncCameraFromParams();
});
camFolder.add(params, 'cameraRadius', 5, 40).onChange(() => {
    params.cameraX = Math.cos(params.cameraAngle) * params.cameraRadius;
    params.cameraZ = Math.sin(params.cameraAngle) * params.cameraRadius;
    syncCameraFromParams();
});
camFolder.add(params, 'cameraAngle', -Math.PI, Math.PI).onChange(() => {
    params.cameraX = Math.cos(params.cameraAngle) * params.cameraRadius;
    params.cameraZ = Math.sin(params.cameraAngle) * params.cameraRadius;
    syncCameraFromParams();
});

const contentFolder = gui.addFolder('Content Transform');
contentFolder.add(params, 'contentOffsetX', -50, 50).onChange(updateWorldTransform);
contentFolder.add(params, 'contentOffsetZ', -50, 50).onChange(updateWorldTransform);
contentFolder.add(params, 'contentRotationY', -Math.PI, Math.PI).onChange(updateWorldTransform);

const windFolder = gui.addFolder('Wind Physics');
windFolder.add(params, 'macroScale', 0.01, 0.5);
windFolder.add(params, 'macroSpeed', 0.0, 3.0);
windFolder.add(params, 'midScale', 0.01, 0.5);
windFolder.add(params, 'midSpeed', 0.0, 3.0);
windFolder.add(params, 'detailScale', 0.01, 0.5);
windFolder.add(params, 'detailSpeed', 0.0, 3.0);
windFolder.add(params, 'windBend', 0.0, 5.0);
windFolder.add(params, 'gentleBreeze', 0.0, 1.0);

const groundFolder = gui.addFolder('Ground');
groundFolder.addColor(params, 'groundColor').name('Floor Color').onChange(() => {
    if (ground && ground.material && ground.material.color) {
        ground.material.color.set(params.groundColor);
    }
});

const grassColorFolder = gui.addFolder('Grass Colors');
grassColorFolder.addColor(params, 'baseColor').name('Base (Roots)');
grassColorFolder.addColor(params, 'tipColor').name('Tip (Upper)');
grassColorFolder.addColor(params, 'windHighlightColor').name('Wind Highlight');
grassColorFolder.add(params, 'greenVariationStrength', 0, 1).name('Green variation strength');
grassColorFolder.addColor(params, 'warmTint').name('Warm green');
grassColorFolder.addColor(params, 'coolTint').name('Cool green');

const lightingDebugFolder = gui.addFolder('Debug / Lighting Gradient Map');
lightingDebugFolder.add(params, 'gradientMapEnabled').name('Enable');
lightingDebugFolder.add(params, 'gradientStrength', 0.0, 1.0).name('Strength');
lightingDebugFolder.addColor(params, 'gradientShadowColor').name('Shadows');
lightingDebugFolder.addColor(params, 'gradientMidColor').name('Midtones');
lightingDebugFolder.addColor(params, 'gradientHighlightColor').name('Highlights');

const kuwaharaFolder = gui.addFolder('Kuwahara (Final Pass)');
kuwaharaFolder.add(params, 'kuwaharaEnabled').name('Enabled');
kuwaharaFolder.add(params, 'kuwaharaRadius', 1, 16).step(1).name('Radius X');
kuwaharaFolder.add(params, 'kuwaharaRadiusY', 1, 32).step(1).name('Radius Y (stroke length)');

const grassFolder = gui.addFolder('Grass Geometry (Requires Regen)');
grassFolder.add(params, 'bladeWidth', 0.01, 1.0);
grassFolder.add(params, 'bladeHeight', 0.1, 10.0);
grassFolder.add(params, 'instanceCount', 1000, 300000).step(1000);
grassFolder.add(params, 'fieldSize', 10, 200);
grassFolder.add(params, 'regenerateGrass').name('Generate Grass');

const dandelionFolder = gui.addFolder('Dandelions');
dandelionFolder.add(params, 'dandelionCount', 0, 50000).step(100).name('Count').onChange(setupDandelions);
dandelionFolder.addColor(params, 'dandelionStemColor').name('Stem Color');
dandelionFolder.addColor(params, 'dandelionFlowerColor').name('Flower Color');
dandelionFolder.addColor(params, 'dandelionWhiteColor').name('Seed Head Color');

const presetFolder = gui.addFolder('Presets / Saving');
presetFolder.add(params, 'savePreset').name('Copy current settings to clipboard');

const perfFolder = gui.addFolder('Performance');
perfFolder.add(params, 'targetFPS', 1, 144).step(1).name('Target FPS');

// Cursor variables
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-9999, -9999);
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6);
let cursorVelocity = new THREE.Vector2(0, 1);
let cursorIntensity = 0.0;
let previousCursorPos = new THREE.Vector3();
let cursorInitialized = false;

canvas.style.cursor = 'grab';

window.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
});

window.addEventListener('touchmove', (event) => {
    if (event.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;
    }
});

// 6. Animation Loop
const clock = new THREE.Clock();
let lastRenderTime = 0;
let previousTime = 0;
let macroOffset = 0;
let midOffset = 0;
let detailOffset = 0;

function animate() {
    requestAnimationFrame(animate);
    
    const currentTime = performance.now();
    const elapsed = currentTime - lastRenderTime;
    const fpsInterval = 1000 / params.targetFPS;
    
    if (elapsed < fpsInterval) return;
    
    lastRenderTime = currentTime - (elapsed % fpsInterval);
    
    const elapsedTime = clock.getElapsedTime();
    const deltaTime = elapsedTime - previousTime;
    previousTime = elapsedTime;

    // Slow random fluctuation for wind speeds
    // Multiply maximum speed (current param) by a smoothly fluctuating value between 0.3 and 1.0
    const fl1 = (Math.sin(elapsedTime * 0.5) + Math.sin(elapsedTime * 0.31 + 1.2) + Math.sin(elapsedTime * 0.73 + 2.4) + 3) / 6;
    const fl2 = (Math.sin(elapsedTime * 0.7) + Math.sin(elapsedTime * 0.43 + 3.1) + Math.sin(elapsedTime * 0.89 + 5.5) + 3) / 6;
    const fl3 = (Math.sin(elapsedTime * 0.9) + Math.sin(elapsedTime * 0.57 + 4.2) + Math.sin(elapsedTime * 1.13 + 1.8) + 3) / 6;

    macroOffset += deltaTime * (params.macroSpeed * (0.3 + 0.7 * fl1));
    midOffset += deltaTime * (params.midSpeed * (0.3 + 0.7 * fl2));
    detailOffset += deltaTime * (params.detailSpeed * (0.3 + 0.7 * fl3));

    uniforms.uTime.value = elapsedTime;
    uniforms.uMacroOffset.value = macroOffset;
    uniforms.uMidOffset.value = midOffset;
    uniforms.uDetailOffset.value = detailOffset;
    
    // Cursor Interaction Logic
    if (mouse.x !== -9999) {
        raycaster.setFromCamera(mouse, camera);
        let newPos = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(groundPlane, newPos)) {
            if (!cursorInitialized) {
                previousCursorPos.copy(newPos);
                cursorInitialized = true;
            }
            
            let dx = newPos.x - previousCursorPos.x;
            let dz = newPos.z - previousCursorPos.z;
            let dist = Math.sqrt(dx * dx + dz * dz);
            
            if (dist > 0.01) {
                let moveVec = new THREE.Vector2(dx, dz).normalize();
                cursorVelocity.lerp(moveVec, 0.2).normalize();
                cursorIntensity = Math.min(cursorIntensity + dist * 0.5, 1.0);
            }
            previousCursorPos.copy(newPos);
            uniforms.uCursorPos.value.set(newPos.x, newPos.z);
        }
    }
    
    cursorIntensity *= 0.98; // Decay over time to become still
    uniforms.uCursorVelocity.value.copy(cursorVelocity);
    uniforms.uCursorIntensity.value = cursorIntensity;
    
    // Sync uniforms to GUI params
    uniforms.uMacroScale.value = params.macroScale;
    uniforms.uMidScale.value = params.midScale;
    uniforms.uDetailScale.value = params.detailScale;
    uniforms.uWindBend.value = params.windBend;
    uniforms.uGentleBreeze.value = params.gentleBreeze;
    uniforms.uBaseColor.value.set(params.baseColor);
    uniforms.uTipColor.value.set(params.tipColor);
    uniforms.uWindHighlightColor.value.set(params.windHighlightColor);
    uniforms.uGreenVariationStrength.value = params.greenVariationStrength;
    uniforms.uWarmTint.value.set(params.warmTint);
    uniforms.uCoolTint.value.set(params.coolTint);
    
    // Sync dandelion uniforms
    dandelionUniforms.uStemColor.value.set(params.dandelionStemColor);
    dandelionUniforms.uFlowerColor.value.set(params.dandelionFlowerColor);
    dandelionUniforms.uWhiteColor.value.set(params.dandelionWhiteColor);

    postUniforms.uGradientEnabled.value = params.gradientMapEnabled;
    postUniforms.uGradientStrength.value = params.gradientStrength;
    postUniforms.uShadowColor.value.set(params.gradientShadowColor);
    postUniforms.uMidColor.value.set(params.gradientMidColor);
    postUniforms.uHighlightColor.value.set(params.gradientHighlightColor);
    postUniforms.tScene.value = renderTarget.texture;

    controls.update();

    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(postTarget);
    renderer.render(postScene, postCamera);
    kuwaharaUniforms.tInput.value = postTarget.texture;
    kuwaharaUniforms.uRadiusX.value = params.kuwaharaRadius;
    kuwaharaUniforms.uRadiusY.value = params.kuwaharaRadiusY;
    kuwaharaUniforms.uEnabled.value = params.kuwaharaEnabled ? 1.0 : 0.0;
    renderer.setRenderTarget(null);
    renderer.render(kuwaharaScene, kuwaharaCamera);
}

animate();
