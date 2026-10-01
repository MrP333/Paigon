/**
 * dashTheme.tsx — visual pack for Dash. Drop-in. No course, physics, sockets, or scoring.
 *
 * Glow is emissive materials (toneMapped: false) plus additive billboards.
 * Textures are canvas-built at first client mount. No EffectComposer, no bloom pass,
 * no fetched images.
 *
 * Readability (do not break):
 *   Hazard boxes use HAZARD only. Doomed tokens use AMBER only, and they pulse.
 *   Scenery is cyan / violet / electric blue, outside the lane corridor.
 *   Reward bursts spawn on the orb and drift behind it. Nothing bright is added
 *   ahead of the player inside the three lanes.
 *
 * Frame cost, high / low (draw calls, not the caller's hazards and tokens):
 *   Sky 1/1, walls 2/2, deck 1/1, shoulder pylons 2/2,
 *   speed streaks 1 (36 / 12 instances), motes 1 (24 / 0),
 *   player orb 1, trail 1 (12 / 4), reward billboards 1 (40 / 12),
 *   milestone ring 1/1.
 *   Hazards: one shared MeshStandardMaterial. Tokens: two shared materials
 *   (gold, amber). Do not clone them per box.
 *
 * Wire from the real RunnerScreen useFrame — mutate dashVis, do not put speed
 * in React state:
 *   pushRunState({ speed, z, laneX, streak, threat })
 *   noteToken() on a validated collect
 *   noteContact() on a validated hit
 *   noteFinish() when the match ends
 *   setDashQuality(false) on weak hardware
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const DASH_COLORS = {
  void: '#05040c',
  deck: '#07060e',
  hazard: '#ff2a6a',
  amber: '#ffb020',
  gold: '#ffd56a',
  cyan: '#00e7ff',
  violet: '#7a3cff',
  electric: '#1a8cff',
} as const;

export const STREAK_MARKS = [5, 10, 15, 20, 30, 40];

export const dashVis = {
  speed: 20,
  z: 0,
  distance: 0,
  laneX: 0,
  streak: 0,
  /** 0..1 peripheral heat. Theme owns the decay. */
  heat: 0,
  reward: 0,
  contact: 0,
  finish: 0,
  /** 1 when the player's lane closes inside the read window. */
  threat: 0,
  burstSeq: 0,
  contactSeq: 0,
  finishSeq: 0,
  milestoneSeq: 0,
  /** 1 = high, 0 = cheap fallback. */
  quality: 1,
};

export function setDashQuality(high: boolean) {
  dashVis.quality = high ? 1 : 0;
}

export function pushRunState(s: {
  speed: number;
  z: number;
  laneX: number;
  streak: number;
  threat?: number;
}) {
  dashVis.speed = s.speed;
  dashVis.z = s.z;
  dashVis.distance = s.z;
  dashVis.laneX = s.laneX;
  dashVis.streak = s.streak;
  dashVis.threat = s.threat ?? 0;
}

export function noteToken() {
  dashVis.reward = 1;
  dashVis.burstSeq++;
  if (STREAK_MARKS.includes(dashVis.streak)) dashVis.milestoneSeq++;
}

export function noteContact() {
  dashVis.contact = 1;
  dashVis.contactSeq++;
  dashVis.heat *= 0.22;
  dashVis.streak = 0;
}

export function noteFinish() {
  dashVis.finish = 1;
  dashVis.finishSeq++;
  dashVis.reward = 1;
}

type Theme = {
  wallMat: THREE.ShaderMaterial;
  deckMat: THREE.ShaderMaterial;
  skyMat: THREE.ShaderMaterial;
  hazardMat: THREE.MeshStandardMaterial;
  tokenMat: THREE.MeshStandardMaterial;
  doomedMat: THREE.MeshStandardMaterial;
  pylonCyan: THREE.MeshStandardMaterial;
  pylonViolet: THREE.MeshStandardMaterial;
  streakMat: THREE.MeshBasicMaterial;
  moteMat: THREE.MeshBasicMaterial;
  rewardMat: THREE.ShaderMaterial;
  trailMat: THREE.MeshBasicMaterial;
  orbMat: THREE.MeshStandardMaterial;
  ringMat: THREE.MeshBasicMaterial;
  wallGeo: THREE.PlaneGeometry;
  deckGeo: THREE.PlaneGeometry;
  skyGeo: THREE.SphereGeometry;
  pylonGeo: THREE.BoxGeometry;
  streakGeo: THREE.PlaneGeometry;
  moteGeo: THREE.SphereGeometry;
  rewardGeo: THREE.PlaneGeometry;
  trailGeo: THREE.PlaneGeometry;
  orbGeo: THREE.SphereGeometry;
  ringGeo: THREE.TorusGeometry;
  radial: THREE.CanvasTexture;
  streakTex: THREE.CanvasTexture;
  detail: THREE.CanvasTexture;
  life: THREE.InstancedBufferAttribute;
  tint: THREE.InstancedBufferAttribute;
  size: THREE.InstancedBufferAttribute;
};

let theme: Theme | null = null;

function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  wrap: THREE.Wrapping,
) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context missing');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeDetail() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const grid = x % 16 === 0 || y % 16 === 0 ? 90 : 18;
        const n = grid + Math.floor(Math.random() * 28);
        img.data[i] = n;
        img.data[i + 1] = n;
        img.data[i + 2] = n + 8;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, THREE.RepeatWrapping);
}

function makeRadial() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.28, 'rgba(255,255,255,0.62)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, THREE.ClampToEdgeWrapping);
}

function makeStreak() {
  return canvasTexture(32, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.15)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.58, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, THREE.ClampToEdgeWrapping);
}

const wallVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const wallFrag = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
uniform sampler2D uDetail;
uniform float uDist;
uniform float uSpeed;
uniform float uHeat;
uniform vec3 uCyan;
uniform vec3 uViolet;
uniform vec3 uFog;
void main() {
  float rib = smoothstep(0.82, 1.0, fract(vWorld.y * 0.55 - uDist * 0.012));
  float panel = smoothstep(0.97, 1.0, fract(vWorld.z * 0.08 - uDist * 0.004));
  float top = smoothstep(4.6, 5.2, vWorld.y);
  vec2 uv = vec2(vWorld.y * 0.2, vWorld.z * 0.08 - uDist * 0.02);
  float grain = texture2D(uDetail, uv).r;
  vec3 neon = mix(uCyan, uViolet, clamp(uHeat, 0.0, 1.0));
  vec3 col = vec3(0.012, 0.010, 0.028);
  col += neon * rib * (0.85 + uSpeed * 2.1);
  col += neon * top * (1.1 + uSpeed * 1.4);
  col += vec3(0.25, 0.35, 0.55) * panel * 0.35;
  col += grain * 0.05;
  float dist = distance(cameraPosition, vWorld);
  col = mix(col, uFog, smoothstep(48.0, 130.0, dist));
  gl_FragColor = vec4(col, 1.0);
}
`;

const deckVert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const deckFrag = /* glsl */ `
varying vec3 vWorld;
uniform sampler2D uDetail;
uniform float uDist;
uniform float uSpeed;
uniform float uHeat;
uniform float uLaneX;
uniform float uZ;
uniform vec3 uCyan;
uniform vec3 uViolet;
uniform vec3 uFog;
void main() {
  float x = vWorld.x;
  float lane = min(abs(x), min(abs(x - 3.2), abs(x + 3.2)));
  float inLane = 1.0 - smoothstep(0.9, 1.45, lane);
  float rail = 1.0 - smoothstep(0.0, 0.22, abs(abs(x) - 5.55));
  float seam = smoothstep(0.965, 1.0, fract((vWorld.z) * 0.1));
  vec2 uv = vec2(x * 0.22, vWorld.z * 0.22 - uDist * 0.03);
  float grain = texture2D(uDetail, uv).r;
  vec3 neon = mix(uCyan, uViolet, clamp(uHeat, 0.0, 1.0));
  vec3 col = vec3(0.010, 0.009, 0.020) + grain * 0.045;
  col += vec3(0.18, 0.22, 0.32) * seam * 0.22;
  col += neon * rail * (0.65 + uSpeed * 1.35);
  col *= mix(1.0, 0.42, inLane);
  float mine = abs(x - uLaneX);
  float myLane = 1.0 - smoothstep(0.15, 1.2, mine);
  float along = vWorld.z - uZ;
  float near = (1.0 - smoothstep(0.5, 11.0, along)) * step(-1.5, along);
  col += vec3(0.0, 0.22, 0.32) * myLane * near * 0.45;
  float dist = distance(cameraPosition, vWorld);
  col = mix(col, uFog, smoothstep(42.0, 125.0, dist));
  gl_FragColor = vec4(col, 1.0);
}
`;

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}
`;

const skyFrag = /* glsl */ `
varying vec3 vDir;
uniform float uSpeed;
uniform float uHeat;
uniform vec3 uCyan;
uniform vec3 uViolet;
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  vec3 top = vec3(0.012, 0.006, 0.035);
  vec3 mid = vec3(0.045, 0.012, 0.110);
  vec3 hor = mix(uCyan, uViolet, 0.35 + 0.65 * clamp(uHeat, 0.0, 1.0));
  vec3 col = mix(top, mid, smoothstep(0.55, 0.05, h));
  float band = smoothstep(0.22, -0.02, h);
  col = mix(col, hor, band * (0.28 + uSpeed * 0.72));
  float stars = step(0.984, fract(sin(dot(floor(dir.xy * 90.0), vec2(12.9898, 78.233))) * 43758.5453));
  col += stars * (0.35 + uSpeed * 0.9) * smoothstep(0.05, 0.4, h);
  gl_FragColor = vec4(col, 1.0);
}
`;

const rewardVert = /* glsl */ `
attribute float aLife;
attribute float aSize;
attribute vec3 aTint;
varying float vLife;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vLife = aLife;
  vUv = uv;
  vTint = aTint;
  vec3 inst = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = inst + camRight * position.x * aSize + camUp * position.y * aSize;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const rewardFrag = /* glsl */ `
varying float vLife;
varying vec2 vUv;
varying vec3 vTint;
uniform sampler2D uMap;
void main() {
  vec4 tex = texture2D(uMap, vUv);
  gl_FragColor = vec4(vTint, tex.a * vLife);
}
`;

function std(color: string, emissive: string, intensity: number) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.42,
    metalness: 0.18,
  });
  mat.toneMapped = false;
  return mat;
}

function buildTheme(): Theme {
  const detail = makeDetail();
  const radial = makeRadial();
  const streakTex = makeStreak();
  const fog = new THREE.Color(DASH_COLORS.void);
  const cyan = new THREE.Color(DASH_COLORS.cyan);
  const violet = new THREE.Color(DASH_COLORS.violet);

  const shared = {
    uDetail: { value: detail },
    uDist: { value: 0 },
    uSpeed: { value: 0 },
    uHeat: { value: 0 },
    uCyan: { value: cyan },
    uViolet: { value: violet },
    uFog: { value: fog },
  };

  const wallMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uDetail: { value: detail }, uCyan: { value: cyan.clone() }, uViolet: { value: violet.clone() }, uFog: { value: fog.clone() } },
    vertexShader: wallVert,
    fragmentShader: wallFrag,
  });
  wallMat.toneMapped = false;

  const deckMat = new THREE.ShaderMaterial({
    uniforms: {
      uDetail: { value: detail },
      uDist: { value: 0 },
      uSpeed: { value: 0 },
      uHeat: { value: 0 },
      uLaneX: { value: 0 },
      uZ: { value: 0 },
      uCyan: { value: cyan.clone() },
      uViolet: { value: violet.clone() },
      uFog: { value: fog.clone() },
    },
    vertexShader: deckVert,
    fragmentShader: deckFrag,
  });
  deckMat.toneMapped = false;

  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uSpeed: { value: 0 },
      uHeat: { value: 0 },
      uCyan: { value: cyan.clone() },
      uViolet: { value: violet.clone() },
    },
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  skyMat.toneMapped = false;

  const hazardMat = std('#1a0610', DASH_COLORS.hazard, 1.85);
  const tokenMat = std('#3a2c10', DASH_COLORS.gold, 1.7);
  const doomedMat = std('#3a2408', DASH_COLORS.amber, 1.5);
  const pylonCyan = std('#041018', DASH_COLORS.cyan, 1.35);
  const pylonViolet = std('#120818', DASH_COLORS.violet, 1.25);

  const streakMat = new THREE.MeshBasicMaterial({
    map: streakTex,
    color: DASH_COLORS.cyan,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  streakMat.toneMapped = false;

  const moteMat = new THREE.MeshBasicMaterial({
    map: radial,
    color: DASH_COLORS.violet,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  moteMat.toneMapped = false;

  const REWARD_N = 40;
  const life = new THREE.InstancedBufferAttribute(new Float32Array(REWARD_N), 1);
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(REWARD_N * 3), 3);
  const size = new THREE.InstancedBufferAttribute(new Float32Array(REWARD_N), 1);
  const rewardGeo = new THREE.PlaneGeometry(1, 1);
  rewardGeo.setAttribute('aLife', life);
  rewardGeo.setAttribute('aTint', tint);
  rewardGeo.setAttribute('aSize', size);

  const rewardMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: radial } },
    vertexShader: rewardVert,
    fragmentShader: rewardFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  rewardMat.toneMapped = false;

  const trailMat = new THREE.MeshBasicMaterial({
    map: radial,
    color: DASH_COLORS.cyan,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  trailMat.toneMapped = false;

  const orbMat = std('#062028', DASH_COLORS.cyan, 1.6);
  const ringMat = new THREE.MeshBasicMaterial({
    color: DASH_COLORS.gold,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  ringMat.toneMapped = false;

  return {
    wallMat,
    deckMat,
    skyMat,
    hazardMat,
    tokenMat,
    doomedMat,
    pylonCyan,
    pylonViolet,
    streakMat,
    moteMat,
    rewardMat,
    trailMat,
    orbMat,
    ringMat,
    wallGeo: new THREE.PlaneGeometry(170, 5.6),
    deckGeo: new THREE.PlaneGeometry(22, 180),
    skyGeo: new THREE.SphereGeometry(80, 28, 16),
    pylonGeo: new THREE.BoxGeometry(0.16, 1, 0.16),
    streakGeo: new THREE.PlaneGeometry(0.18, 7),
    moteGeo: new THREE.SphereGeometry(0.08, 6, 6),
    rewardGeo,
    trailGeo: new THREE.PlaneGeometry(0.45, 0.45),
    orbGeo: new THREE.SphereGeometry(0.38, 24, 16),
    ringGeo: new THREE.TorusGeometry(0.55, 0.035, 8, 28),
    radial,
    streakTex,
    detail,
    life,
    tint,
    size,
  };
}

export function getDashTheme() {
  if (!theme) {
    if (typeof document === 'undefined') {
      throw new Error('Dash theme builds textures in the browser.');
    }
    theme = buildTheme();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) dashVis.quality = 0;
  }
  return theme;
}

export function getHazardMaterial() {
  return getDashTheme().hazardMat;
}
export function getTokenMaterial() {
  return getDashTheme().tokenMat;
}
export function getDoomedMaterial() {
  return getDashTheme().doomedMat;
}

const _dummy = new THREE.Object3D();
const _gold = new THREE.Color(DASH_COLORS.gold);
const _cyan = new THREE.Color(DASH_COLORS.cyan);
const _violet = new THREE.Color(DASH_COLORS.violet);
const _white = new THREE.Color('#f4fbff');

function speedNorm() {
  return THREE.MathUtils.clamp((dashVis.speed - 16) / 34, 0, 1);
}

function decay(dt: number) {
  const k = (rate: number) => Math.exp(-rate * dt);
  dashVis.reward *= k(3.2);
  dashVis.contact *= k(4.5);
  dashVis.finish *= k(1.4);
  const target =
    Math.min(1, dashVis.streak / 24) * 0.62 + speedNorm() * 0.38 + dashVis.finish * 0.4;
  dashVis.heat += (target - dashVis.heat) * (1 - Math.exp(-2.4 * dt));
}

function paintScroll(t: Theme) {
  const sn = speedNorm();
  t.wallMat.uniforms.uDist.value = dashVis.distance;
  t.wallMat.uniforms.uSpeed.value = sn;
  t.wallMat.uniforms.uHeat.value = dashVis.heat;
  t.deckMat.uniforms.uDist.value = dashVis.distance;
  t.deckMat.uniforms.uSpeed.value = sn;
  t.deckMat.uniforms.uHeat.value = dashVis.heat;
  t.deckMat.uniforms.uLaneX.value = dashVis.laneX;
  t.deckMat.uniforms.uZ.value = dashVis.z;
  t.skyMat.uniforms.uSpeed.value = sn;
  t.skyMat.uniforms.uHeat.value = dashVis.heat;
  const hot = 0.7 + sn * 1.5 + dashVis.heat * 1.1;
  t.pylonCyan.emissiveIntensity = hot;
  t.pylonViolet.emissiveIntensity = 0.55 + sn * 1.1 + dashVis.heat * 1.6;
  t.streakMat.color.copy(_cyan).lerp(_violet, dashVis.heat * 0.65);
  t.streakMat.opacity = 0.25 + sn * 0.55;
  t.moteMat.opacity = 0.15 + dashVis.heat * 0.45;
  t.doomedMat.emissiveIntensity = 1.15 + Math.sin(performance.now() * 0.009) * 0.65;
  t.orbMat.emissive.copy(_cyan).lerp(_gold, Math.min(1, dashVis.reward));
  t.orbMat.emissiveIntensity = 1.3 + sn * 0.8 + dashVis.reward * 2.4 + dashVis.contact * 1.5;
  if (dashVis.contact > 0.35) t.orbMat.emissive.lerp(_white, dashVis.contact);
}

export function DashScenery() {
  const t = useMemo(() => getDashTheme(), []);
  const streaks = useRef<THREE.InstancedMesh>(null);
  const motes = useRef<THREE.InstancedMesh>(null);
  const leftP = useRef<THREE.InstancedMesh>(null);
  const rightP = useRef<THREE.InstancedMesh>(null);
  const wallL = useRef<THREE.Mesh>(null);
  const wallR = useRef<THREE.Mesh>(null);
  const deck = useRef<THREE.Mesh>(null);
  const sky = useRef<THREE.Mesh>(null);
  const streakZ = useRef<Float32Array | null>(null);
  const moteZ = useRef<Float32Array | null>(null);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    decay(dt);
    paintScroll(t);
    const z = dashVis.z;
    if (sky.current) sky.current.position.set(0, 0, z);
    if (deck.current) deck.current.position.set(0, 0, z + 28);
    if (wallL.current) wallL.current.position.set(-7.15, 2.7, z + 24);
    if (wallR.current) wallR.current.position.set(7.15, 2.7, z + 24);

    const high = dashVis.quality === 1;
    const sc = high ? 36 : 12;
    const mc = high ? 24 : 0;
    if (!streakZ.current) {
      streakZ.current = new Float32Array(36);
      moteZ.current = new Float32Array(24);
      for (let i = 0; i < 36; i++) streakZ.current[i] = Math.random() * 80;
      for (let i = 0; i < 24; i++) moteZ.current[i] = Math.random() * 90;
    }
    const sz = streakZ.current;
    const mz = moteZ.current!;
    const sm = streaks.current;
    if (sm) {
      sm.count = sc;
      for (let i = 0; i < sc; i++) {
        sz[i] -= dt * dashVis.speed * (1.15 + (i % 5) * 0.08);
        if (sz[i] < -12) sz[i] = 70 + (i % 7) * 4;
        const side = i % 2 === 0 ? -1 : 1;
        const x = side * (6.15 + (i % 4) * 0.45);
        _dummy.position.set(x, 1.1 + (i % 3) * 0.7, z + sz[i]);
        _dummy.scale.set(1, 0.7 + speedNorm(), 1);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        sm.setMatrixAt(i, _dummy.matrix);
      }
      sm.instanceMatrix.needsUpdate = true;
    }
    const mm = motes.current;
    if (mm) {
      mm.count = mc;
      for (let i = 0; i < mc; i++) {
        mz[i] += dt * dashVis.speed * 0.45;
        if (mz[i] > 96) mz[i] -= 100;
        const side = i % 2 === 0 ? -1 : 1;
        _dummy.position.set(side * (6.4 + (i % 5) * 0.7), 2.2 + (i % 4) * 0.8, z + mz[i] - 10);
        _dummy.scale.setScalar(1);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        mm.setMatrixAt(i, _dummy.matrix);
      }
      if (mc > 0) mm.instanceMatrix.needsUpdate = true;
    }

    const base = Math.floor(z / 8) * 8;
    const placePylons = (mesh: THREE.InstancedMesh | null, x: number) => {
      if (!mesh) return;
      const n = high ? 16 : 8;
      mesh.count = n;
      for (let i = 0; i < n; i++) {
        const tall = i % 4 === 0 ? 3.3 : 1.55;
        _dummy.position.set(x, tall * 0.5, base + i * 8);
        _dummy.scale.set(1, tall, 1);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    placePylons(leftP.current, -5.7);
    placePylons(rightP.current, 5.7);
  });

  return (
    <group>
      <mesh ref={sky} geometry={t.skyGeo} material={t.skyMat} frustumCulled={false} />
      <mesh
        ref={deck}
        geometry={t.deckGeo}
        material={t.deckMat}
        rotation={[-Math.PI / 2, 0, 0]}
        frustumCulled={false}
      />
      <mesh ref={wallL} geometry={t.wallGeo} material={t.wallMat} rotation={[0, Math.PI / 2, 0]} frustumCulled={false} />
      <mesh ref={wallR} geometry={t.wallGeo} material={t.wallMat} rotation={[0, -Math.PI / 2, 0]} frustumCulled={false} />
      <instancedMesh ref={leftP} args={[t.pylonGeo, t.pylonCyan, 16]} frustumCulled={false} />
      <instancedMesh ref={rightP} args={[t.pylonGeo, t.pylonViolet, 16]} frustumCulled={false} />
      <instancedMesh ref={streaks} args={[t.streakGeo, t.streakMat, 36]} frustumCulled={false} />
      <instancedMesh ref={motes} args={[t.moteGeo, t.moteMat, 24]} frustumCulled={false} />
    </group>
  );
}

const TRAIL_N = 12;

export function PlayerRig() {
  const t = useMemo(() => getDashTheme(), []);
  const orb = useRef<THREE.Mesh>(null);
  const trail = useRef<THREE.InstancedMesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const samples = useRef<{ x: number; y: number; z: number }[]>([]);
  const lastZ = useRef(-999);
  const ringT = useRef(1);
  const seenMark = useRef(0);
  const seenFinish = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const high = dashVis.quality === 1;
    if (dashVis.z - lastZ.current > 0.55 || samples.current.length === 0) {
      samples.current.push({ x: dashVis.laneX, y: 0.62, z: dashVis.z });
      if (samples.current.length > TRAIL_N) samples.current.shift();
      lastZ.current = dashVis.z;
    } else if (samples.current.length) {
      const tip = samples.current[samples.current.length - 1];
      tip.x = dashVis.laneX;
      tip.z = dashVis.z;
    }
    if (orb.current) {
      const punch = 1 + dashVis.reward * 0.18 - dashVis.contact * 0.08;
      orb.current.position.set(dashVis.laneX, 0.62, dashVis.z);
      orb.current.scale.setScalar(punch);
    }
    const mesh = trail.current;
    if (mesh) {
      const n = high ? TRAIL_N : 4;
      mesh.count = n;
      const pts = samples.current;
      for (let i = 0; i < n; i++) {
        const p = pts[Math.max(0, pts.length - 1 - i)];
        const fade = 1 - i / n;
        _dummy.position.set(p ? p.x : dashVis.laneX, 0.62, p ? p.z : dashVis.z);
        _dummy.scale.setScalar(p ? 0.35 + fade * 0.7 : 0);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (dashVis.milestoneSeq !== seenMark.current || dashVis.finishSeq !== seenFinish.current) {
      seenMark.current = dashVis.milestoneSeq;
      seenFinish.current = dashVis.finishSeq;
      ringT.current = 0;
      t.ringMat.color.copy(dashVis.finish > 0.5 ? _gold : _cyan);
    }
    if (ring.current && ringT.current < 1) {
      ringT.current = Math.min(1, ringT.current + dt * (dashVis.finish > 0.4 ? 0.7 : 1.35));
      const k = ringT.current;
      ring.current.visible = k < 1;
      ring.current.position.set(dashVis.laneX, 0.7, dashVis.z - 0.9);
      ring.current.scale.setScalar(0.4 + k * 2.1);
      t.ringMat.opacity = (1 - k) * 0.9;
    } else if (ring.current) {
      ring.current.visible = false;
    }
  });

  return (
    <group>
      <mesh ref={orb} geometry={t.orbGeo} material={t.orbMat} />
      <instancedMesh ref={trail} args={[t.trailGeo, t.trailMat, TRAIL_N]} frustumCulled={false} />
      <mesh ref={ring} geometry={t.ringGeo} material={t.ringMat} visible={false} />
    </group>
  );
}

type Spark = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; tint: 0 | 1 | 2; size: number };

export function RewardLayer() {
  const t = useMemo(() => getDashTheme(), []);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const pool = useRef<Spark[]>([]);
  const seenBurst = useRef(0);
  const seenMark = useRef(0);
  const seenHit = useRef(0);
  const seenFinish = useRef(0);

  const spawn = (count: number, tint: 0 | 1 | 2, spread: number, back: number, size: number) => {
    const cap = dashVis.quality === 1 ? 40 : 12;
    for (let i = 0; i < count; i++) {
      if (pool.current.length >= cap) pool.current.shift();
      const ang = Math.random() * Math.PI * 2;
      pool.current.push({
        x: dashVis.laneX + Math.cos(ang) * spread * 0.25,
        y: 0.55 + Math.random() * 0.5,
        z: dashVis.z - Math.random() * 0.4,
        vx: Math.cos(ang) * spread,
        vy: 0.6 + Math.random() * 1.8,
        vz: -back - Math.random() * back,
        life: 0.45 + Math.random() * 0.35,
        max: 0.8,
        tint,
        size,
      });
    }
  };

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (dashVis.burstSeq !== seenBurst.current) {
      seenBurst.current = dashVis.burstSeq;
      spawn(dashVis.quality === 1 ? 8 : 4, 0, 1.4, 3.5, 0.42);
    }
    if (dashVis.milestoneSeq !== seenMark.current) {
      seenMark.current = dashVis.milestoneSeq;
      spawn(dashVis.quality === 1 ? 14 : 6, 1, 3.2, 2.2, 0.55);
    }
    if (dashVis.contactSeq !== seenHit.current) {
      seenHit.current = dashVis.contactSeq;
      spawn(6, 2, 2.2, 1.2, 0.28);
    }
    if (dashVis.finishSeq !== seenFinish.current) {
      seenFinish.current = dashVis.finishSeq;
      spawn(dashVis.quality === 1 ? 22 : 8, 0, 2.4, 4, 0.7);
      spawn(8, 1, 3.4, 3, 0.5);
    }
    const sparks = pool.current;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vy -= dt * 0.4;
      if (s.life <= 0) sparks.splice(i, 1);
    }
    const im = mesh.current;
    if (!im) return;
    const life = t.life;
    const tint = t.tint;
    const size = t.size;
    const n = Math.min(40, sparks.length);
    im.count = Math.max(n, 1);
    for (let i = 0; i < 40; i++) {
      const s = sparks[i];
      if (!s) {
        life.setX(i, 0);
        size.setX(i, 0);
        _dummy.position.set(0, -10, 0);
        _dummy.scale.setScalar(1);
        _dummy.updateMatrix();
        im.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      const col = s.tint === 0 ? _gold : s.tint === 1 ? _violet : _white;
      life.setX(i, Math.max(0, s.life / s.max));
      size.setX(i, s.size * (0.6 + s.life));
      tint.setXYZ(i, col.r, col.g, col.b);
      _dummy.position.set(s.x, s.y, s.z);
      _dummy.scale.setScalar(1);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      im.setMatrixAt(i, _dummy.matrix);
    }
    life.needsUpdate = true;
    tint.needsUpdate = true;
    size.needsUpdate = true;
    im.instanceMatrix.needsUpdate = true;
  });

  const ttheme = t;
  return (
    <instancedMesh ref={mesh} args={[ttheme.rewardGeo, ttheme.rewardMat, 40]} frustumCulled={false} />
  );
}
