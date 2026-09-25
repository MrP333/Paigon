import * as THREE from 'three';

/**
 * One colour direction for the Dash scene, plus the shared materials built from
 * it. Materials are cached per band and per obstacle type rather than created
 * per mesh: a unique onBeforeCompile material for every track slab would
 * compile dozens of shader programs and hitch on race start.
 */
export const CYBER = {
  void: '#05060f',
  fog: '#07091a',
  ambient: '#1a2458',
  key: '#d7e6ff',
  fill: '#ff2f86',
  hemiSky: '#14204a',
  hemiGround: '#07060c',

  asphalt: '#12151f',
  lane: '#8ef6ff',
  open: '#22d3ee',
  mid: '#ffb020',
  narrow: '#ff2d7a',

  wall: '#ff3d8a',
  barrier: '#ff8a1e',
  beam: '#ff3355',
  pad: '#ffe14a',
  bridge: '#ff4ecd',

  gold: '#ffd76a',
  orbCore: '#f4fbff',
} as const;

export type TrackBand = 'open' | 'mid' | 'narrow';

/**
 * Thresholds are the generator's own, not eyeballed. Across 400 courses the
 * width distribution has exactly two gaps: nothing at all between 2.5 and 4.4
 * (bridges against everything else), and a trough at MIN_OPEN = 8.5 — 6
 * sections out of 3493 in the half-unit below it against a flat plateau above.
 *
 * Cutting at 7 instead, as the first pass did, ran the boundary straight
 * through the middle of the constriction hump: 407 sections sat within 0.35 of
 * it, so a 6.9-wide section and a 7.1-wide one — indistinguishable at speed —
 * would have been painted amber and cyan. The rail colour is a braking cue, so
 * a boundary in the middle of a cluster is worse than no colour at all.
 */
export function trackBand(width: number): TrackBand {
  if (width < 3.5) return 'narrow';
  if (width < 8.5) return 'mid';
  return 'open';
}

export const RAIL: Record<TrackBand, string> = {
  open: CYBER.open,
  mid: CYBER.mid,
  narrow: CYBER.narrow,
};

/**
 * Colour channels must be emitted as GLSL float literals. Interpolating a raw
 * JS number writes "1" for any channel that lands exactly on 1.0, which GLSL
 * reads as an int and refuses inside vec3() — that silently broke the amber and
 * magenta bands, whose reds are both 0xff.
 */
function glslRGB(hex: string): string {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;
}

const trackMats: Partial<Record<TrackBand, THREE.MeshStandardMaterial>> = {};
const railMats: Partial<Record<TrackBand, THREE.MeshStandardMaterial>> = {};

function makeTrackMat(band: TrackBand): THREE.MeshStandardMaterial {
  const rail = glslRGB(RAIL[band]);
  const centreGain = band === 'narrow' ? '0.9' : '0.35';

  const m = new THREE.MeshStandardMaterial({
    color: CYBER.asphalt,
    roughness: 0.84,
    metalness: 0.18,
    emissive: new THREE.Color(RAIL[band]),
    emissiveIntensity: band === 'narrow' ? 0.22 : 0.08,
  });

  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRaceTime = { value: 0 };
    shader.vertexShader =
      'varying vec3 vTrkWorld;\nvarying float vTrkLocalX;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `vTrkWorld = (modelMatrix * vec4(position, 1.0)).xyz;
         vTrkLocalX = position.x;
         #include <project_vertex>`,
      );
    shader.fragmentShader =
      'varying vec3 vTrkWorld;\nvarying float vTrkLocalX;\nuniform float uRaceTime;\n' +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        float lane = abs(fract((vTrkWorld.z - uRaceTime * 28.0) * 0.08) - 0.5);
        float streak = smoothstep(0.46, 0.5, lane);
        gl_FragColor.rgb += ${rail} * streak * 0.55;
        // Local X, so the stripe follows the slab — which is already offset by
        // the centreline. Adding the offset again here would double it.
        float centre = 1.0 - smoothstep(0.04, 0.18, abs(vTrkLocalX));
        gl_FragColor.rgb += ${rail} * centre * ${centreGain};
        #include <dithering_fragment>
        `,
      );
    m.userData.shader = shader;
  };
  return m;
}

function makeRailMat(band: TrackBand): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: RAIL[band],
    emissive: new THREE.Color(RAIL[band]),
    emissiveIntensity: band === 'narrow' ? 2.4 : band === 'mid' ? 1.5 : 1.1,
    roughness: 0.22,
    metalness: 0.1,
    toneMapped: false,
  });
}

export function getTrackMaterial(width: number): THREE.MeshStandardMaterial {
  const band = trackBand(width);
  return (trackMats[band] ??= makeTrackMat(band));
}

export function getRailMaterial(width: number): THREE.MeshStandardMaterial {
  const band = trackBand(width);
  return (railMats[band] ??= makeRailMat(band));
}

/** Drive from race time, never the render clock — that desyncs players. */
export function pushTrackTime(raceTime: number): void {
  for (const band of ['open', 'mid', 'narrow'] as const) {
    const shader = trackMats[band]?.userData.shader as
      | { uniforms: { uRaceTime: { value: number } } }
      | undefined;
    if (shader) shader.uniforms.uRaceTime.value = raceTime;
  }
}

export type ObstacleKind =
  | 'moving_wall' | 'rotating_barrier' | 'spinning_beam' | 'bounce_pad' | 'narrow_bridge';

const mat = (hex: string, emissiveIntensity: number, roughness: number, metalness: number) =>
  new THREE.MeshStandardMaterial({
    color: hex, emissive: new THREE.Color(hex),
    emissiveIntensity, roughness, metalness, toneMapped: false,
  });

export const OBSTACLE_MAT: Record<ObstacleKind, THREE.MeshStandardMaterial> = {
  moving_wall:      mat(CYBER.wall,    1.35, 0.32, 0.15),
  rotating_barrier: mat(CYBER.barrier, 1.15, 0.28, 0.20),
  spinning_beam:    mat(CYBER.beam,    2.60, 0.15, 0.00),
  bounce_pad:       mat(CYBER.pad,     1.70, 0.40, 0.05),
  narrow_bridge:    mat(CYBER.bridge,  1.40, 0.25, 0.12),
};

// Narrow hue bands, so a wall never drifts into the beam's red. The previous
// full-spectrum cycle is what made hazards hard to tell apart at speed.
const HUE: Record<ObstacleKind, [number, number, number]> = {
  moving_wall:      [0.90, 0.85, 0.55],
  rotating_barrier: [0.07, 0.95, 0.52],
  spinning_beam:    [0.98, 1.00, 0.55],
  bounce_pad:       [0.13, 0.90, 0.58],
  narrow_bridge:    [0.86, 0.80, 0.55],
};

export function pulseObstacleEmissive(raceTime: number): void {
  for (const key of Object.keys(OBSTACLE_MAT) as ObstacleKind[]) {
    const [h, s, l] = HUE[key];
    const wobble = Math.sin(raceTime * 3.0 + h * 20) * 0.015;
    OBSTACLE_MAT[key].emissive.setHSL(h + wobble, s, l);
    OBSTACLE_MAT[key].color.copy(OBSTACLE_MAT[key].emissive);
  }
}
