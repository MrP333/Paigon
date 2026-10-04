/**
 * Tokens and hazards as two instanced meshes.
 *
 * They used to be ~53 individual meshes, remounted as the view window
 * advanced. This collapses them to two draw calls, mounted once for the whole
 * race, filled imperatively every frame.
 *
 * THE REASON THEY WERE NOT ALREADY INSTANCED: tokens are not uniform. Only the
 * next LIVE_LEAD units of the trail is lit, and doomed tokens pulse amber — so
 * per-instance emissive varies and changes every frame. InstancedMesh's built
 * in `instanceColor` cannot express that: three injects it at
 * `#include <color_fragment>`, where it multiplies diffuseColor, leaving
 * totalEmissiveRadiance identical across every instance. A shared
 * MeshStandardMaterial has exactly one emissive value.
 *
 * So the glow rides on custom instanced attributes instead:
 *   aGlow  vec3   the colour to emit
 *   aLit   float  how much of it, 0 dim to 1 lit
 *
 * 16 bytes per instance rather than the 24 two vec3s would cost, for the same
 * expressiveness — the base colour never varies per instance, only its
 * intensity does.
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { laneX, RunCourse, LANE_W } from '../engine/RunnerCourse';
import { getTokenMaterial, getHazardMaterial } from './dashTheme';

/**
 * Pool sizes, derived rather than guessed. The widest window is VIEW_AHEAD
 * plus a bucket of overhang plus what is kept behind; at TOKEN_SPACING that is
 * 44 tokens worst case. Hazard rows are far sparser — gaps bottom out at 14
 * units and block at most 2 lanes.
 */
const MAX_TOKENS = 64;
const MAX_HAZARDS = 24;

const VIEW_AHEAD = 130;
const VIEW_BEHIND = 6;
/** How far ahead the token line reads as live. Beyond this it is dim. */
const LIVE_LEAD = 34;

const GOLD = new THREE.Color('#ffd56a');
const AMBER = new THREE.Color('#ffb020');

/** Reused across frames — allocating these per token would defeat the point. */
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);

/**
 * Adds the per-instance glow to a material without disturbing anything else
 * it does. `position` here is the gem's own vertex, geometry-local — the
 * instance transform lives in instanceMatrix and must not be read from it.
 */
function installGlow(mat: THREE.Material): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute vec3 aGlow;\nattribute float aLit;\nvarying vec3 vGlow;\nvarying float vLit;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGlow = aGlow;\nvLit = aLit;',
      );
    shader.fragmentShader =
      'varying vec3 vGlow;\nvarying float vLit;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance = vGlow * vLit;',
      );
  };
  mat.needsUpdate = true;
}

export default function DashActors({ course, zRef }: {
  course: RunCourse;
  zRef: React.MutableRefObject<number>;
}) {
  const tokenRef = useRef<THREE.InstancedMesh>(null);
  const hazardRef = useRef<THREE.InstancedMesh>(null);

  const kit = useMemo(() => {
    const glow = new Float32Array(MAX_TOKENS * 3);
    const lit = new Float32Array(MAX_TOKENS);
    const glowAttr = new THREE.InstancedBufferAttribute(glow, 3);
    const litAttr = new THREE.InstancedBufferAttribute(lit, 1);
    glowAttr.setUsage(THREE.DynamicDrawUsage);
    litAttr.setUsage(THREE.DynamicDrawUsage);

    const tokenGeo = new THREE.OctahedronGeometry(0.5);
    tokenGeo.setAttribute('aGlow', glowAttr);
    tokenGeo.setAttribute('aLit', litAttr);

    const tokenMat = getTokenMaterial().clone();
    installGlow(tokenMat);

    return {
      tokenGeo, tokenMat, glow, lit, glowAttr, litAttr,
      hazardGeo: new THREE.BoxGeometry(LANE_W * 0.92, 2, 0.7),
      hazardMat: getHazardMaterial(),
    };
  }, []);

  useFrame(({ clock }) => {
    const tm = tokenRef.current;
    const hm = hazardRef.current;
    if (!tm || !hm) return;

    const z = zRef.current;
    const lo = z - VIEW_BEHIND;
    const hi = z + VIEW_AHEAD;
    const pulse = 0.72 + 0.28 * Math.sin(clock.elapsedTime * 5.2);

    let n = 0;
    for (const t of course.tokens) {
      if (t.z < lo) continue;
      if (t.z > hi) break;
      if (n >= MAX_TOKENS) break;
      // Centreline sampled at the TOKEN's depth, never the player's.
      _p.set(laneX(course, t.lane, t.z), 0.8, t.z);
      _m.compose(_p, _q, _s);
      tm.setMatrixAt(n, _m);

      const c = t.doomed ? AMBER : GOLD;
      kit.glow[n * 3] = c.r; kit.glow[n * 3 + 1] = c.g; kit.glow[n * 3 + 2] = c.b;
      // Only the near stretch reads as live; doomed trails pulse so the
      // warning is urgency rather than another colour to have been told about.
      const ahead = t.z - z;
      kit.lit[n] = ahead < LIVE_LEAD
        ? (t.doomed ? 2.0 * pulse : 1.15)
        : 0.16;
      n++;
    }
    tm.count = n;
    tm.instanceMatrix.needsUpdate = true;
    kit.glowAttr.needsUpdate = true;
    kit.litAttr.needsUpdate = true;

    let h = 0;
    for (const row of course.rows) {
      if (row.z < lo) continue;
      if (row.z > hi) break;
      for (const lane of row.blocked) {
        if (h >= MAX_HAZARDS) break;
        _p.set(laneX(course, lane, row.z), 1, row.z);
        _m.compose(_p, _q, _s);
        hm.setMatrixAt(h, _m);
        h++;
      }
    }
    hm.count = h;
    hm.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {/* Both are positioned entirely from instanceMatrix each frame, so the
          scene graph has nothing useful to cull them against. */}
      <instancedMesh
        ref={tokenRef}
        args={[kit.tokenGeo, kit.tokenMat, MAX_TOKENS]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={hazardRef}
        args={[kit.hazardGeo, kit.hazardMat, MAX_HAZARDS]}
        frustumCulled={false}
      />
    </>
  );
}
