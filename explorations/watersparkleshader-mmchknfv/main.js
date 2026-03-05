import * as THREE from 'three';

// 1. Scene, Camera, Renderer
const canvas = document.getElementById('c');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000208); // Dark sky/environment

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 30);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

// 2. Shared GLSL Noise
const glslNoise = `
// 3D Simplex Noise function (Ashima Arts)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

  // Permutations
  i = mod289(i); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  // Gradients: 7x7 points over a square, mapped onto an octahedron.
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  //Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 105.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}

float calculateWaterHeight(vec2 pos, float time) {
    float h = 0.0;
    vec2 p = pos * 0.15;
    float amp = 1.0;
    
    // Flowing coordinates
    vec3 p3 = vec3(p.x, p.y - time * 0.6, time * 0.3);
    
    for(int i=0; i<4; i++) {
        float n = 1.0 - abs(snoise(p3));
        n = pow(n, 2.5); // extremely sharp ridges
        h += n * amp;
        p3.xy *= 2.0;
        p3.z *= 1.2;
        amp *= 0.5;
    }
    
    return h;
}
`;

// 3. Water Surface Mesh
const waterGeom = new THREE.PlaneGeometry(100, 100, 256, 256);
waterGeom.rotateX(-Math.PI / 2);

const waterUniforms = {
    uTime: { value: 0.0 },
    uDeepColor: { value: new THREE.Color(0x000814) },
    uSurfaceColor: { value: new THREE.Color(0x002244) },
    uCrestColor: { value: new THREE.Color(0x88e8ff) }
};

const waterVert = `
uniform float uTime;
varying vec3 vWorldPos;
varying float vHeight;

${glslNoise}

void main() {
    vec3 pos = position;
    float h = calculateWaterHeight(pos.xz, uTime);
    pos.y += h;
    
    vWorldPos = pos;
    vHeight = h;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const waterFrag = `
uniform vec3 uDeepColor;
uniform vec3 uSurfaceColor;
uniform vec3 uCrestColor;

varying vec3 vWorldPos;
varying float vHeight;

void main() {
    // With ridged noise, vHeight is mostly low (~0.0) with sharp peaks up to ~1.8.
    float hMap = vHeight / 1.5; 
    hMap = clamp(hMap, 0.0, 1.0);
    
    vec3 color = mix(uDeepColor, uSurfaceColor, smoothstep(0.0, 0.4, hMap));
    
    // Add extremely bright and sharp crests
    float crestFactor = smoothstep(0.6, 0.9, hMap);
    color = mix(color, uCrestColor, crestFactor);
    
    // Give a neon glow extra boost for the absolute tip
    float superCrest = smoothstep(0.85, 1.0, hMap);
    color += vec3(0.5, 0.9, 1.0) * superCrest;
    
    // Edge fade (optional, to blend with background)
    float dist = length(vWorldPos.xz);
    float fade = smoothstep(45.0, 50.0, dist);
    color = mix(color, vec3(0.0, 0.011, 0.024), fade);
    
    gl_FragColor = vec4(color, 1.0);
}
`;

const waterMat = new THREE.ShaderMaterial({
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    uniforms: waterUniforms,
    side: THREE.DoubleSide
});

const waterMesh = new THREE.Mesh(waterGeom, waterMat);
scene.add(waterMesh);

// 4. Sparkle Particle System
const particleCount = 100000;
const particleGeo = new THREE.BufferGeometry();
const posArray = new Float32Array(particleCount * 3);
const randomArray = new Float32Array(particleCount);

for(let i=0; i<particleCount; i++) {
    const x = (Math.random() - 0.5) * 100;
    const z = (Math.random() - 0.5) * 100;
    
    posArray[i*3 + 0] = x;
    posArray[i*3 + 1] = 0; // Y will be set in shader
    posArray[i*3 + 2] = z;
    
    randomArray[i] = Math.random() * Math.PI * 2.0; // Random phase for twinkling
}

particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
particleGeo.setAttribute('aRandom', new THREE.BufferAttribute(randomArray, 1));

const sparkleUniforms = {
    uTime: { value: 0.0 },
    uSparkleColor: { value: new THREE.Color(0xffffff) }
};

const sparkleVert = `
uniform float uTime;
attribute float aRandom;
varying float vIntensity;

${glslNoise}

void main() {
    vec3 pos = position;
    
    // Drift particles to keep them aligned with the moving waves
    pos.z += uTime * 4.0; 
    pos.z = mod(pos.z + 50.0, 100.0) - 50.0;
    
    float h = calculateWaterHeight(pos.xz, uTime);
    pos.y += h;
    
    // Sparkle logic: only appear on extremely high sharp crests
    float threshold = 1.3; 
    
    if(h > threshold) {
        // Map height above threshold to intensity
        float intensity = (h - threshold) / 0.4;
        intensity = clamp(intensity, 0.0, 1.0);
        
        // Add twinkling effect
        float twinkle = 0.5 + 0.5 * sin(uTime * 8.0 + aRandom);
        
        vIntensity = intensity * twinkle;
        gl_PointSize = vIntensity * 250.0 * (1.0 / - (modelViewMatrix * vec4(pos, 1.0)).z);
    } else {
        vIntensity = 0.0;
        gl_PointSize = 0.0;
    }
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const sparkleFrag = `
uniform vec3 uSparkleColor;
varying float vIntensity;

void main() {
    if(vIntensity <= 0.01) discard;
    
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = length(p);
    
    // 4-point star shape
    float crossX = exp(-abs(p.x) * 30.0) * exp(-abs(p.y) * 2.0);
    float crossY = exp(-abs(p.y) * 30.0) * exp(-abs(p.x) * 2.0);
    float core = exp(-d * 15.0);
    
    float star = (crossX + crossY + core) * smoothstep(1.0, 0.2, d);
    
    // Circular bounds
    if(d > 1.0) discard;
    
    gl_FragColor = vec4(uSparkleColor * star * vIntensity, star * vIntensity);
}
`;

const sparkleMat = new THREE.ShaderMaterial({
    vertexShader: sparkleVert,
    fragmentShader: sparkleFrag,
    uniforms: sparkleUniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

const sparkleMesh = new THREE.Points(particleGeo, sparkleMat);
scene.add(sparkleMesh);

// 5. Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const elapsedTime = clock.getElapsedTime();
    waterUniforms.uTime.value = elapsedTime;
    sparkleUniforms.uTime.value = elapsedTime;
    
    // Slow camera rotation
    camera.position.x = Math.sin(elapsedTime * 0.05) * 30;
    camera.position.z = Math.cos(elapsedTime * 0.05) * 30;
    camera.lookAt(0, 0, 0);
    
    renderer.render(scene, camera);
}

animate();
