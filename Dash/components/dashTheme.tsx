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
 *   Sky 1/1. Walls 2/2 instanced segments (20 / 10 each). Deck 1/1 instanced slabs (20 / 10).
 *   Shoulder pylons 2/2. Speed streaks 1 (36 / 12). Motes 1 (24 / 0).
 *   Gate 1 draw, 3 instances (pillar, pillar, lintel) — same on low. Opening stays wider than the lanes.
 *   Player orb 1, trail 1 (12 / 4), reward billboards 1 (40 / 12), milestone ring 1/1.
 *   Act change is a uniform lerp, 0 extra draws. Crossing flash is a DOM opacity
 *   for about four frames at 60Hz, never a fullscreen pass.
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

/** Fixed course points. Replace with the real gate z list. Two gates, three acts. */
export const GATE_Z = [620, 1280];

/**
 * Centreline sway. Sample at the object's own z.
 *
 * The pack ships a stand-in formula so its own preview has a curve to follow.
 * The real course generates a DIFFERENT one, with seed-dependent phases — it
 * changes per room code — so the host must install the live course's function
 * or the scenery sways on a path the lanes never take, and the player drives
 * through the canyon wall on every bend.
 */
let centerImpl = (z: number) => Math.sin(z * 0.021) * 10 + Math.sin(z * 0.008 + 1.7) * 8;

/**
 * Install the real course's centreline. Call once per run.
 *
 * `phases` are the three seeded offsets the deck shader needs. The JS side and
 * the GLSL side compute the same curve independently — if only one is updated
 * the painted lane markings drift away from where the lanes actually are.
 */
export function setCenterAt(fn: (z: number) => number, phases?: [number, number, number]) {
  centerImpl = fn;
  if (phases) pendingSway = phases;
}

let pendingSway: [number, number, number] | null = null;

/** Applied once the theme exists; called from the frame loop. */
function applySway(t: Theme) {
  if (!pendingSway) return;
  (t.deckMat.uniforms.uSway.value as THREE.Vector3).set(...pendingSway);
  pendingSway = null;
}

export function centerAt(z: number) {
  return centerImpl(z);
}

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
  /** 1 for a few frames when a gate is crossed. Theme decays it. */
  flash: 0,
  /** 0 act one, 1 act two, 2 act three. Derived from z and gates. */
  act: 0,
  /** 1 when the player's lane closes inside the read window. */
  threat: 0,
  burstSeq: 0,
  contactSeq: 0,
  finishSeq: 0,
  milestoneSeq: 0,
  gateSeq: 0,
  /** 1 = high, 0 = cheap fallback. */
  quality: 1,
  gates: GATE_Z,
  centerAt,
  _prevZ: 0,
};

export function worldX(z = dashVis.z, laneOffset = dashVis.laneX) {
  return centerAt(z) + laneOffset;
}

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
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
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
uniform float uAct;
uniform vec3 uCyan;
uniform vec3 uViolet;
uniform vec3 uFog;
void main() {
  float freq = mix(0.42, 1.25, clamp(uAct / 2.0, 0.0, 1.0));
  float rib = smoothstep(0.78, 1.0, fract(vWorld.y * freq - uDist * 0.012));
  float slash = smoothstep(0.94, 1.0, fract(vWorld.y * 0.35 + vWorld.z * 0.12));
  float pattern = mix(rib, max(rib, slash), smoothstep(1.15, 1.85, uAct));
  float panel = smoothstep(0.97, 1.0, fract(vWorld.z * mix(0.08, 0.2, clamp(uAct / 2.0, 0.0, 1.0))));
  float top = smoothstep(0.82, 1.0, vUv.y);
  vec2 uv = vec2(vWorld.y * 0.2, vWorld.z * 0.08 - uDist * 0.02);
  float grain = texture2D(uDetail, uv).r;
  vec3 neon = mix(uCyan, uViolet, clamp(uHeat * 0.65 + uAct * 0.28, 0.0, 1.0));
  float boost = 1.0 + uAct * 0.62;
  vec3 col = vec3(0.012, 0.010, 0.028);
  col += neon * pattern * (0.85 + uSpeed * 2.1) * boost;
  col += neon * top * (1.1 + uSpeed * 1.4) * boost;
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
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
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
uniform float uAct;
uniform vec3 uCyan;
uniform vec3 uViolet;
uniform vec3 uFog;
// Must match the host's course exactly. uSway carries the seeded phases, so
// the deck's lane markings land on the same curve the lanes actually take.
// A hardcoded formula here puts the painted lanes somewhere the player is not.
uniform vec3 uSway;
float centerLine(float z) {
  return sin(z * 0.01150 + uSway.x) * 7.50000
       + sin(z * 0.00440 + uSway.y) * 11.00000
       + sin(z * 0.02810 + uSway.z) * 2.20000;
}
void main() {
  float rel = vWorld.x - centerLine(vWorld.z);
  float lane = min(abs(rel), min(abs(rel - 3.2), abs(rel + 3.2)));
  float inLane = 1.0 - smoothstep(0.9, 1.45, lane);
  float rail = 1.0 - smoothstep(0.0, 0.22, abs(abs(rel) - 5.55));
  float seam = smoothstep(0.965, 1.0, fract(vWorld.z * mix(0.10, 0.22, clamp(uAct / 2.0, 0.0, 1.0))));
  vec2 uv = vec2(rel * 0.22, vWorld.z * 0.22 - uDist * 0.03);
  float grain = texture2D(uDetail, uv).r;
  vec3 neon = mix(uCyan, uViolet, clamp(uHeat * 0.65 + uAct * 0.28, 0.0, 1.0));
  vec3 col = vec3(0.010, 0.009, 0.020) + grain * 0.045;
  col += vec3(0.18, 0.22, 0.32) * seam * 0.22;
  col += neon * rail * (0.65 + uSpeed * 1.35) * (1.0 + uAct * 0.45);
  col *= mix(1.0, 0.42, inLane);
  float mine = abs(rel - uLaneX);
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
uniform float uAct;
uniform vec3 uCyan;
uniform vec3 uViolet;
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  vec3 top = vec3(0.012, 0.006, 0.035);
  vec3 mid = mix(vec3(0.045, 0.012, 0.110), vec3(0.09, 0.02, 0.16), clamp(uAct / 2.0, 0.0, 1.0));
  vec3 hor = mix(uCyan, uViolet, 0.35 + 0.45 * clamp(uHeat, 0.0, 1.0) + 0.2 * clamp(uAct / 2.0, 0.0, 1.0));
  vec3 col = mix(top, mid, smoothstep(0.55, 0.05, h));
  float band = smoothstep(mix(0.22, 0.08, clamp(uAct / 2.0, 0.0, 1.0)), -0.02, h);
  col = mix(col, hor, band * (0.28 + uSpeed * 0.72 + uAct * 0.18));
  float starCut = mix(0.986, 0.972, clamp(uAct / 2.0, 0.0, 1.0));
  float stars = step(starCut, fract(sin(dot(floor(dir.xy * 90.0), vec2(12.9898, 78.233))) * 43758.5453));
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
    uniforms: { ...shared, uDetail: { value: detail }, uCyan: { value: cyan.clone() }, uViolet: { value: violet.clone() }, uFog: { value: fog.clone() }, uAct: { value: 0 } },
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
      uAct: { value: 0 },
      // Seeded phases of the host's centreline. Defaults are the pack's own
      // stand-in curve; setCenterAt's companion overwrites them per run.
      uSway: { value: new THREE.Vector3(0, 1.7, 0) },
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
      uAct: { value: 0 },
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
    wallGeo: new THREE.PlaneGeometry(8, 1),
    deckGeo: new THREE.PlaneGeometry(28, 8),
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
const _fog = new THREE.Color();
const ACT_A = [new THREE.Color('#3ecfff'), new THREE.Color('#b388ff'), new THREE.Color('#d7fbff')];
const ACT_B = [new THREE.Color('#1a8cff'), new THREE.Color('#6d4bff'), new THREE.Color('#7aa2ff')];
const ACT_FOG = [new THREE.Color('#07141c'), new THREE.Color('#140a22'), new THREE.Color('#070814')];

function speedNorm() {
  return THREE.MathUtils.clamp((dashVis.speed - 16) / 34, 0, 1);
}

function actSample(z: number) {
  const list = dashVis.gates;
  let act = 0;
  let gate = -1e9;
  for (let i = 0; i < list.length; i++) {
    if (z >= list[i]) {
      act = Math.min(2, i + 1);
      gate = list[i];
    }
  }
  if (act === 0) return { prev: 0, act: 0, t: 1, u: 0 };
  const prev = act - 1;
  const t = Math.min(1, (z - gate) / 14);
  return { prev, act, t, u: prev + (act - prev) * t };
}

function watchGates() {
  if (dashVis.z + 0.5 < dashVis._prevZ) dashVis._prevZ = dashVis.z;
  const list = dashVis.gates;
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (dashVis._prevZ < g && dashVis.z >= g) {
      dashVis.flash = 1;
      dashVis.gateSeq++;
    }
  }
  dashVis._prevZ = dashVis.z;
  dashVis.act = actSample(dashVis.z).act;
}

function decay(dt: number) {
  const k = (rate: number) => Math.exp(-rate * dt);
  dashVis.reward *= k(3.2);
  dashVis.contact *= k(4.5);
  dashVis.finish *= k(1.4);
  dashVis.flash *= k(40);
  const target =
    Math.min(1, dashVis.streak / 24) * 0.62 + speedNorm() * 0.38 + dashVis.finish * 0.4;
  dashVis.heat += (target - dashVis.heat) * (1 - Math.exp(-2.4 * dt));
}

function paintAct(t: Theme, u: number, prev: number, act: number, blend: number) {
  _cyan.copy(ACT_A[prev]).lerp(ACT_A[act], blend);
  _violet.copy(ACT_B[prev]).lerp(ACT_B[act], blend);
  const fog = _fog.copy(ACT_FOG[prev]).lerp(ACT_FOG[act], blend);
  t.wallMat.uniforms.uCyan.value.copy(_cyan);
  t.wallMat.uniforms.uViolet.value.copy(_violet);
  t.wallMat.uniforms.uFog.value.copy(fog);
  t.wallMat.uniforms.uAct.value = u;
  t.deckMat.uniforms.uCyan.value.copy(_cyan);
  t.deckMat.uniforms.uViolet.value.copy(_violet);
  t.deckMat.uniforms.uFog.value.copy(fog);
  t.deckMat.uniforms.uAct.value = u;
  t.skyMat.uniforms.uCyan.value.copy(_cyan);
  t.skyMat.uniforms.uViolet.value.copy(_violet);
  t.skyMat.uniforms.uAct.value = u;
  t.pylonCyan.emissive.copy(_cyan);
  t.pylonViolet.emissive.copy(_violet);
  t.streakMat.color.copy(_cyan);
  t.moteMat.color.copy(_violet);
}

function paintScroll(t: Theme) {
  const sn = speedNorm();
  const sample = actSample(dashVis.z);
  paintAct(t, sample.u, sample.prev, sample.act, sample.t);
  t.wallMat.uniforms.uDist.value = dashVis.distance;
  t.wallMat.uniforms.uSpeed.value = sn;
  t.wallMat.uniforms.uHeat.value = dashVis.heat;
  t.deckMat.uniforms.uDist.value = dashVis.distance;
  t.deckMat.uniforms.uSpeed.value = sn;
  t.deckMat.uniforms.uHeat.value = dashVis.heat;
  applySway(t);
  t.deckMat.uniforms.uLaneX.value = dashVis.laneX;
  t.deckMat.uniforms.uZ.value = dashVis.z;
  t.skyMat.uniforms.uSpeed.value = sn;
  t.skyMat.uniforms.uHeat.value = dashVis.heat;
  const hot = (0.7 + sn * 1.5 + dashVis.heat * 1.1) * (1 + sample.u * 0.35);
  t.pylonCyan.emissiveIntensity = hot;
  t.pylonViolet.emissiveIntensity = (0.55 + sn * 1.1 + dashVis.heat * 1.6) * (1 + sample.u * 0.25);
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
  const wallL = useRef<THREE.InstancedMesh>(null);
  const wallR = useRef<THREE.InstancedMesh>(null);
  const deck = useRef<THREE.InstancedMesh>(null);
  const sky = useRef<THREE.Mesh>(null);
  const streakZ = useRef<Float32Array | null>(null);
  const moteZ = useRef<Float32Array | null>(null);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    watchGates();
    decay(dt);
    paintScroll(t);
    const z = dashVis.z;
    const sample = actSample(z);
    const cx = centerAt(z);
    if (sky.current) sky.current.position.set(cx, 0, z);
    const fog = state.scene.fog;
    if (fog && 'color' in fog) (fog as THREE.Fog).color.copy(_fog);

    const high = dashVis.quality === 1;
    const seg = high ? 8 : 16;
    const slabs = high ? 20 : 10;
    const base = Math.floor((z - 24) / seg) * seg;
    const inset = 7.45 - sample.u * 0.55;
    const wallH = 4.7 + sample.u * 1.45;
    const placeWall = (mesh: THREE.InstancedMesh | null, side: number) => {
      if (!mesh) return;
      mesh.count = slabs;
      for (let i = 0; i < slabs; i++) {
        const sz = base + i * seg + seg * 0.5;
        _dummy.position.set(centerAt(sz) + side * inset, wallH * 0.5, sz);
        _dummy.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
        _dummy.scale.set(high ? 1 : 2, wallH, 1);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    placeWall(wallL.current, -1);
    placeWall(wallR.current, 1);
    const deckMesh = deck.current;
    if (deckMesh) {
      deckMesh.count = slabs;
      for (let i = 0; i < slabs; i++) {
        const sz = base + i * seg + seg * 0.5;
        _dummy.position.set(centerAt(sz), 0, sz);
        _dummy.rotation.set(-Math.PI / 2, 0, 0);
        _dummy.scale.set(1, high ? 1 : 2, 1);
        _dummy.updateMatrix();
        deckMesh.setMatrixAt(i, _dummy.matrix);
      }
      deckMesh.instanceMatrix.needsUpdate = true;
    }

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
        const wz = z + sz[i];
        const side = i % 2 === 0 ? -1 : 1;
        const x = centerAt(wz) + side * (6.35 + (i % 4) * 0.4);
        _dummy.position.set(x, 1.1 + (i % 3) * 0.7, wz);
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
        const mzWorld = z + mz[i] - 10;
        const side = i % 2 === 0 ? -1 : 1;
        _dummy.position.set(centerAt(mzWorld) + side * (6.5 + (i % 5) * 0.55), 2.2 + (i % 4) * 0.8, mzWorld);
        _dummy.scale.setScalar(1);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        mm.setMatrixAt(i, _dummy.matrix);
      }
      if (mc > 0) mm.instanceMatrix.needsUpdate = true;
    }

    const gap = Math.max(4, 8 - sample.u * 2);
    const lateral = 5.9 - sample.u * 0.3;
    const pBase = Math.floor(z / gap) * gap;
    const placePylons = (mesh: THREE.InstancedMesh | null, side: number) => {
      if (!mesh) return;
      const n = high ? 16 : 8;
      mesh.count = n;
      const step = gap;
      for (let i = 0; i < n; i++) {
        const pz = pBase + i * step;
        const tall = (i % 4 === 0 ? 3.3 : 1.55) * (1 + sample.u * 0.25);
        _dummy.position.set(centerAt(pz) + side * lateral, tall * 0.5, pz);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, tall, 1);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    placePylons(leftP.current, -1);
    placePylons(rightP.current, 1);
  });

  return (
    <group>
      <mesh ref={sky} geometry={t.skyGeo} material={t.skyMat} frustumCulled={false} />
      <instancedMesh ref={deck} args={[t.deckGeo, t.deckMat, 20]} frustumCulled={false} />
      <instancedMesh ref={wallL} args={[t.wallGeo, t.wallMat, 20]} frustumCulled={false} />
      <instancedMesh ref={wallR} args={[t.wallGeo, t.wallMat, 20]} frustumCulled={false} />
      <instancedMesh ref={leftP} args={[t.pylonGeo, t.pylonCyan, 16]} frustumCulled={false} />
      <instancedMesh ref={rightP} args={[t.pylonGeo, t.pylonViolet, 16]} frustumCulled={false} />
      <instancedMesh ref={streaks} args={[t.streakGeo, t.streakMat, 36]} frustumCulled={false} />
      <instancedMesh ref={motes} args={[t.moteGeo, t.moteMat, 24]} frustumCulled={false} />
    </group>
  );
}

/** One arch across all three lanes. No side portals. */
export function ActGate() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#061018',
      emissive: '#3ecfff',
      emissiveIntensity: 1.4,
      roughness: 0.32,
      metalness: 0.22,
    });
    m.toneMapped = false;
    return m;
  }, []);

  useFrame(() => {
    const im = mesh.current;
    if (!im) return;
    const list = dashVis.gates;
    let next = Number.POSITIVE_INFINITY;
    let dest = 1;
    for (let i = 0; i < list.length; i++) {
      if (list[i] > dashVis.z - 6) {
        next = list[i];
        dest = Math.min(2, i + 1);
        break;
      }
    }
    const ahead = next - dashVis.z;
    if (!Number.isFinite(next) || ahead > 150 || ahead < -6) {
      im.count = 0;
      return;
    }
    im.count = 3;
    const approach = 1 - THREE.MathUtils.clamp(ahead / 90, 0, 1);
    const height = 3.6 + approach * 3.4;
    const cx = centerAt(next);
    const half = 6.2;
    mat.emissive.copy(ACT_A[dest]);
    mat.emissiveIntensity = 0.55 + approach * 2.1 + dashVis.flash * 0.4;

    _dummy.rotation.set(0, 0, 0);
    _dummy.position.set(cx - half, height * 0.5, next);
    _dummy.scale.set(0.72, height, 0.72);
    _dummy.updateMatrix();
    im.setMatrixAt(0, _dummy.matrix);

    _dummy.position.set(cx + half, height * 0.5, next);
    _dummy.scale.set(0.72, height, 0.72);
    _dummy.updateMatrix();
    im.setMatrixAt(1, _dummy.matrix);

    _dummy.position.set(cx, height + 0.32, next);
    _dummy.scale.set(half * 2 + 0.72, 0.64, 0.72);
    _dummy.updateMatrix();
    im.setMatrixAt(2, _dummy.matrix);
    im.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geo, mat, 3]} frustumCulled={false} />;
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
      samples.current.push({ x: worldX(), y: 0.62, z: dashVis.z });
      if (samples.current.length > TRAIL_N) samples.current.shift();
      lastZ.current = dashVis.z;
    } else if (samples.current.length) {
      const tip = samples.current[samples.current.length - 1];
      tip.x = worldX();
      tip.z = dashVis.z;
    }
    if (orb.current) {
      const punch = 1 + dashVis.reward * 0.18 - dashVis.contact * 0.08;
      orb.current.position.set(worldX(), 0.62, dashVis.z);
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
        _dummy.position.set(p ? p.x : worldX(), 0.62, p ? p.z : dashVis.z);
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
      ring.current.position.set(worldX(), 0.7, dashVis.z - 0.9);
      ring.current.scale.setScalar(0.4 + k * 2.1);
      t.ringMat.opacity = (1 - k) * 0.9;
    } else if (ring.current) {
      ring.current.visible = false;
    }
  });

  return (
    <group>
      {/* Positioned every frame from dashVis, like the trail beside it, so it
          is exempted from culling for the same reason. */}
      <mesh ref={orb} geometry={t.orbGeo} material={t.orbMat} frustumCulled={false} />
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
        x: worldX() + Math.cos(ang) * spread * 0.25,
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
