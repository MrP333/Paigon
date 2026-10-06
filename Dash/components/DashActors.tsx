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
import { getTokenMaterial, getHazardMaterial, hazardTint, hazardStyle } from './dashTheme';

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

/**
 * Roadblock box dimensions. The shader needs them to normalise local position
 * into face coordinates, so they live here rather than inline at the geometry.
 */
const HAZ_W = LANE_W * 0.92;
const HAZ_H = 2;

const GOLD = new THREE.Color('#ffd56a');
const AMBER = new THREE.Color('#ffb020');

/** Reused across frames — allocating these per token would defeat the point. */
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

/**
 * Adds the per-instance glow to a material without disturbing anything else
 * it does. `position` here is the gem's own vertex, geometry-local — the
 * instance transform lives in instanceMatrix and must not be read from it.
 */
export function installGlow(mat: THREE.Material): void {
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

/**
 * The roadblock equivalent, with a surface treatment per act on top of the
 * per-instance colour.
 *
 * THE RULE THIS SHADER OBEYS: the lit area always covers the whole face. The
 * acts change the TEXTURE of a roadblock, never its apparent footprint. There
 * is no jump and no duck in this game, so every roadblock blocks absolutely —
 * a pattern that left a dark gap would read as a way through and punish the
 * player for believing their own eyes. Hence the 0.45 floor on every stripe:
 * the dim band is shading, never a hole.
 */
export function installHazardSkin(mat: THREE.Material): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute vec3 aGlow;\nattribute float aStyle;\n' +
      'varying vec3 vGlow;\nvarying float vStyle;\nvarying vec2 vSkin;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        // Face coordinates come from the box's own local position, NOT from uv:
        // this material has no maps, so three never defines USE_UV and the uv
        // attribute is simply not declared. Reading it would fail to compile at
        // runtime, which no build step would have caught.
        '#include <begin_vertex>\nvGlow = aGlow;\nvStyle = aStyle;\n' +
          'vSkin = vec2(position.x / ' + HAZ_W.toFixed(5) + ' + 0.5, position.y / ' +
          HAZ_H.toFixed(5) + ' + 0.5);',
      );
    shader.fragmentShader =
      'varying vec3 vGlow;\nvarying float vStyle;\nvarying vec2 vSkin;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Act 0 solid with a hot rim, act 1 diagonal chevrons, act 2 scan bars.
        float band = 1.0;
        if (vStyle < 0.5) {
          float edge = min(min(vSkin.x, 1.0 - vSkin.x), min(vSkin.y, 1.0 - vSkin.y));
          band = mix(1.0, 0.62, smoothstep(0.0, 0.18, edge));
        } else if (vStyle < 1.5) {
          band = step(0.5, fract((vSkin.x + vSkin.y) * 3.0));
        } else {
          band = step(0.5, fract(vSkin.y * 4.0));
        }
        // Never below 0.45 — a roadblock must read as closed everywhere.
        totalEmissiveRadiance = vGlow * mix(0.45, 1.0, band) * 1.9;`,
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

    // Roadblocks carry a colour and an act style. Same silhouette for all.
    const hGlow = new Float32Array(MAX_HAZARDS * 3);
    const hStyle = new Float32Array(MAX_HAZARDS);
    const hGlowAttr = new THREE.InstancedBufferAttribute(hGlow, 3);
    const hStyleAttr = new THREE.InstancedBufferAttribute(hStyle, 1);
    hGlowAttr.setUsage(THREE.DynamicDrawUsage);
    hStyleAttr.setUsage(THREE.DynamicDrawUsage);

    const hazardGeo = new THREE.BoxGeometry(HAZ_W, HAZ_H, 0.7);
    hazardGeo.setAttribute('aGlow', hGlowAttr);
    hazardGeo.setAttribute('aStyle', hStyleAttr);

    const hazardMat = getHazardMaterial().clone();
    installHazardSkin(hazardMat);

    return {
      tokenGeo, tokenMat, glow, lit, glowAttr, litAttr,
      hazardGeo, hazardMat, hGlow, hStyle, hGlowAttr, hStyleAttr,
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
      // Act tint read at the ROW's z, so a roadblock keeps the look of the act
      // it stands in rather than flickering to match wherever the player is.
      hazardTint(row.z, _c);
      const style = hazardStyle(row.z);
      for (const lane of row.blocked) {
        if (h >= MAX_HAZARDS) break;
        _p.set(laneX(course, lane, row.z), 1, row.z);
        _m.compose(_p, _q, _s);
        hm.setMatrixAt(h, _m);
        kit.hGlow[h * 3] = _c.r;
        kit.hGlow[h * 3 + 1] = _c.g;
        kit.hGlow[h * 3 + 2] = _c.b;
        kit.hStyle[h] = style;
        h++;
      }
    }
    hm.count = h;
    hm.instanceMatrix.needsUpdate = true;
    kit.hGlowAttr.needsUpdate = true;
    kit.hStyleAttr.needsUpdate = true;
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
