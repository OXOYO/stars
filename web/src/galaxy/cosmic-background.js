import * as THREE from 'three';

const SKY_RADIUS = 6500;

const skyVertexShader = `
varying vec3 vWorldDir;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(worldPos.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const skyFragmentShader = `
varying vec3 vWorldDir;

float skyHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float skyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = skyHash(i);
  float b = skyHash(i + vec2(1.0, 0.0));
  float c = skyHash(i + vec2(0.0, 1.0));
  float d = skyHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec3 dir = normalize(vWorldDir);
  float h = dir.y * 0.5 + 0.5;

  vec3 deep = vec3(0.018, 0.028, 0.055);
  vec3 mid = vec3(0.028, 0.038, 0.072);
  vec3 zenith = vec3(0.014, 0.022, 0.048);
  vec3 warm = vec3(0.045, 0.032, 0.038);

  vec3 col = mix(deep, mid, smoothstep(0.0, 0.42, h));
  col = mix(col, zenith, pow(h, 1.35));
  col = mix(col, warm, smoothstep(0.72, 0.98, 1.0 - h) * 0.42);

  float n = skyNoise(dir.xz * 48.0) * 0.5 + skyNoise(dir.xz * 128.0) * 0.3;
  col += (n - 0.4) * 0.035;

  float band = exp(-pow((dir.x * 0.55 + dir.z * 0.35) * 2.2, 2.0) * 0.8);
  col += vec3(0.012, 0.008, 0.022) * band * smoothstep(0.25, 0.75, 1.0 - abs(dir.y));

  gl_FragColor = vec4(col, 1.0);
}
`;

/** 深空渐变穹顶 + 微弱银河感 */
export function createCosmicSkyMesh() {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 24);
  const material = new THREE.ShaderMaterial({
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'cosmic-sky';
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  return mesh;
}

/** @returns {number} */
export function sceneBackgroundColor() {
  return 0x060a12;
}

/** @returns {number} */
export function sceneFogColor() {
  return 0x080e18;
}
