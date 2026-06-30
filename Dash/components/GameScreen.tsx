import { useRef, useState, useEffect, useMemo } from 'react';

const GAME_CSS = `
@keyframes rainbow-shift { from{background-position:0% 50%} to{background-position:200% 50%} }
@keyframes countdown-pop { 0%{transform:scale(1.6);opacity:0} 40%{transform:scale(.93);opacity:1} 100%{transform:scale(1);opacity:1} }
@keyframes go-burst { 0%{transform:scale(.5);opacity:0;filter:brightness(3)} 40%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1;filter:brightness(1)} }
@keyframes respawn-pulse { 0%,100%{opacity:.7} 50%{opacity:1} }
.dash-timer {
  background: linear-gradient(90deg,#ff0080,#ffd700,#00ff88,#22d3ee,#ff0080);
  background-size: 250% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: rainbow-shift 3s linear infinite;
}
.dash-countdown { animation: countdown-pop .35s cubic-bezier(.22,1,.36,1) both; }
.dash-go        { animation: go-burst .5s cubic-bezier(.22,1,.36,1) both; }
`;

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Vector3, Color, MeshStandardMaterial,
  BufferGeometry, BufferAttribute, DynamicDrawUsage,
  LineSegments, LineBasicMaterial, Points, PointsMaterial,
} from 'three';
import { Socket } from 'socket.io-client';
import { GameConfig, ResultData } from '../types';
import { generateCourse, getTrackWidth, GeneratedCourse, CourseObstacle } from '../engine/CourseGenerator';

// ── Constants ─────────────────────────────────────────────────────────────────

const GRAVITY      = 22;
const JUMP_VEL     = 10;
const BASE_SPEED   = 20;
const ACCEL        = 130;
const PLAYER_R     = 0.5;
const FINISH_Z     = 490;
const FALL_Y       = -3.0;
const RESPAWN_MS   = 2000;
const KNOCK_CD_MS  = 450;

// ── Interfaces ────────────────────────────────────────────────────────────────

interface PhysState {
  pos: Vector3; vel: Vector3; onGround: boolean; checkpoint: number;
  finished: boolean; startTime: number; lastSyncTime: number;
  cameraYaw: number; jumpPressed: boolean;
  isFalling: boolean; fallStartMs: number; lastKnockMs: number;
}

interface OtherOrb { id: string; name: string; color: string; pos: [number, number, number]; }

type FallState = 'normal' | 'falling' | 'respawning' | 'flashing';

interface BurstEvent { pos: Vector3; color: string; id: number; }

// ── Obstacle physics ──────────────────────────────────────────────────────────

function applyObstacleEffects(
  obstacles: CourseObstacle[], pos: Vector3, vel: Vector3, time: number,
): boolean {
  let hit = false;
  for (const obs of obstacles) {
    const dz = pos.z - obs.zCenter;
    if (Math.abs(dz) > obs.zRadius + 2) continue;
    switch (obs.type) {
      case 'moving_wall': {
        const wallX = obs.xPos + (obs.params.amplitude ?? 3) * Math.sin((obs.params.speed ?? 1) * time + (obs.params.phase ?? 0));
        const wallHW = 0.8, wallHD = obs.zRadius + 0.3;
        if (Math.abs(dz) < wallHD && Math.abs(pos.x - wallX) < wallHW + PLAYER_R) {
          pos.x -= pos.x < wallX ? -(wallHW + PLAYER_R - Math.abs(pos.x - wallX)) : (wallHW + PLAYER_R - Math.abs(pos.x - wallX));
          vel.x = 0; vel.z -= 22; vel.y += 5; hit = true;
        }
        break;
      }
      case 'rotating_barrier': {
        const armLen = obs.params.armLength ?? 4.5;
        const angle  = (obs.params.speed ?? 1.2) * time + (obs.params.phase ?? 0);
        const numArms = obs.params.numArms ?? 2;
        for (let a = 0; a < numArms; a++) {
          const armAngle = angle + (a / numArms) * Math.PI * 2;
          const armX = obs.xPos + Math.cos(armAngle) * armLen;
          const armZ = obs.zCenter + Math.sin(armAngle) * armLen;
          const dx = pos.x - armX, ddz = pos.z - armZ;
          const dist = Math.sqrt(dx * dx + ddz * ddz);
          if (dist < PLAYER_R + 0.4) {
            const nx = dx / (dist || 1), nz = ddz / (dist || 1);
            pos.x += nx * (PLAYER_R + 0.4 - dist) * 1.5;
            pos.z += nz * (PLAYER_R + 0.4 - dist) * 1.5;
            vel.x += nx * 10; vel.z += nz * 10 - 14; vel.y += 5; hit = true;
          }
        }
        break;
      }
      case 'bounce_pad': {
        const dx = pos.x - obs.xPos;
        if (Math.abs(dx) < 1.2 && Math.abs(dz) < obs.zRadius + 1.2 && pos.y < 0.9) {
          vel.y = obs.params.boostUp ?? 12; vel.z += obs.params.boostFwd ?? 6;
        }
        break;
      }
      case 'spinning_beam': {
        const armLen = obs.params.armLength ?? 5;
        const angle  = (obs.params.speed ?? 2) * time + (obs.params.phase ?? 0);
        const beamY = Math.sin(angle) * armLen, beamX = Math.cos(angle) * armLen;
        if (Math.abs(dz) < 0.7) {
          const t = Math.max(0, Math.min(1, (pos.x - obs.xPos) / (beamX || 1)));
          const nearDist = Math.sqrt((pos.x - (obs.xPos + beamX * t)) ** 2 + (pos.y - beamY * t) ** 2);
          if (nearDist < PLAYER_R + 0.35) { vel.y = Math.max(vel.y, 12); vel.z -= 28; hit = true; }
        }
        break;
      }
    }
  }
  return hit;
}

const CP_COLORS = ['#22d3ee', '#ff0080', '#ffd700'];

function hslColor(h: number, s = 100, l = 55) {
  return `hsl(${((h % 360) + 360) % 360},${s}%,${l}%)`;
}

// ── Pulsing point light ───────────────────────────────────────────────────────

function PulsingLight({ color, base, dist, pos, rate }: {
  color: string; base: number; dist: number; pos: [number, number, number]; rate: number;
}) {
  const lRef = useRef<any>(null);
  useFrame(({ clock }) => {
    if (lRef.current) lRef.current.intensity = base * (0.55 + 0.45 * Math.sin(clock.elapsedTime * rate * Math.PI * 2));
  });
  return <pointLight ref={lRef} position={pos} color={color} intensity={base} distance={dist} />;
}

// ── Track geometry ────────────────────────────────────────────────────────────

function Track({ course }: { course: GeneratedCourse }) {
  const envMats  = useRef<any[]>([]);
  const tmpColor = useRef(new Color());

  useFrame(({ clock }) => {
    const h = (clock.elapsedTime * 40) % 360;
    envMats.current.forEach((m, i) => {
      if (!m) return;
      tmpColor.current.setHSL(((h + i * 18) % 360) / 360, 1, 0.6);
      m.color.copy(tmpColor.current);
      m.emissive.copy(tmpColor.current);
    });
  });

  const cpsFiltered = course.checkpoints.filter(cp => cp.index > 0);
  const cpBase      = course.sections.length * 2;
  const finishBase  = cpBase + cpsFiltered.length * 3;

  return (
    <>
      {course.sections.map((s, i) => {
        const len = s.zEnd - s.zStart, cz = s.zStart + len / 2;
        const isNarrow = s.width <= 4;
        return (
          <group key={i}>
            <mesh position={[0, -0.1, cz]} receiveShadow>
              <boxGeometry args={[s.width, 0.2, len]} />
              <meshStandardMaterial color={isNarrow ? '#1a0020' : '#0c0c1a'} emissive={new Color(isNarrow ? '#3a002a' : '#000820')} emissiveIntensity={0.5} roughness={0.75} metalness={0.15} />
            </mesh>
            <mesh position={[-(s.width / 2 + 0.05), 0.05, cz]}>
              <boxGeometry args={[0.12, 0.22, len]} />
              <meshStandardMaterial ref={(el: any) => { envMats.current[i * 2] = el; }} color="#00ff88" emissive={new Color('#00ff88')} emissiveIntensity={1.2} />
            </mesh>
            <mesh position={[(s.width / 2 + 0.05), 0.05, cz]}>
              <boxGeometry args={[0.12, 0.22, len]} />
              <meshStandardMaterial ref={(el: any) => { envMats.current[i * 2 + 1] = el; }} color="#00ff88" emissive={new Color('#00ff88')} emissiveIntensity={1.2} />
            </mesh>
          </group>
        );
      })}

      {cpsFiltered.map((cp, j) => (
        <group key={cp.index} position={[0, 0, cp.z]}>
          <mesh position={[-7, 1.5, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.18, 0.18, 3, 8]} />
            <meshStandardMaterial ref={(el: any) => { envMats.current[cpBase + j * 3] = el; }} color="#22d3ee" emissive={new Color('#22d3ee')} emissiveIntensity={1.5} />
          </mesh>
          <mesh position={[7, 1.5, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.18, 0.18, 3, 8]} />
            <meshStandardMaterial ref={(el: any) => { envMats.current[cpBase + j * 3 + 1] = el; }} color="#22d3ee" emissive={new Color('#22d3ee')} emissiveIntensity={1.5} />
          </mesh>
          <mesh position={[0, 2.8, 0]}>
            <boxGeometry args={[14, 0.18, 0.18]} />
            <meshStandardMaterial ref={(el: any) => { envMats.current[cpBase + j * 3 + 2] = el; }} color="#22d3ee" emissive={new Color('#22d3ee')} emissiveIntensity={1.5} />
          </mesh>
          <pointLight position={[0, 2, 0]} color="#22d3ee" intensity={4} distance={12} />
        </group>
      ))}

      <group position={[0, 0, FINISH_Z]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[12, 0.25, 1]} />
          <meshStandardMaterial ref={(el: any) => { envMats.current[finishBase] = el; }} color="#ffd700" emissive={new Color('#ffd700')} emissiveIntensity={2} />
        </mesh>
        <mesh position={[-6.5, 2.5, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.25, 0.25, 5, 8]} />
          <meshStandardMaterial ref={(el: any) => { envMats.current[finishBase + 1] = el; }} color="#ff8c00" emissive={new Color('#ff8c00')} emissiveIntensity={1.5} />
        </mesh>
        <mesh position={[6.5, 2.5, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.25, 0.25, 5, 8]} />
          <meshStandardMaterial ref={(el: any) => { envMats.current[finishBase + 2] = el; }} color="#ff8c00" emissive={new Color('#ff8c00')} emissiveIntensity={1.5} />
        </mesh>
        <mesh position={[0, 5, 0]}>
          <boxGeometry args={[14, 0.25, 0.25]} />
          <meshStandardMaterial ref={(el: any) => { envMats.current[finishBase + 3] = el; }} color="#ffd700" emissive={new Color('#ffd700')} emissiveIntensity={2} />
        </mesh>
        <pointLight position={[0, 2, 0]} color="#ffd700" intensity={8} distance={18} />
      </group>

      <mesh position={[0, -0.08, 12]}>
        <boxGeometry args={[12, 0.06, 14]} />
        <meshStandardMaterial color="#0a1a2a" emissive={new Color('#002244')} emissiveIntensity={0.6} roughness={0.5} />
      </mesh>
    </>
  );
}

// ── Obstacle meshes ───────────────────────────────────────────────────────────

function ObstacleMeshes({ obstacles, time }: { obstacles: CourseObstacle[]; time: number }) {
  const hOff = (time * 40) % 360;
  return (
    <>
      {obstacles.map(obs => {
        switch (obs.type) {
          case 'moving_wall': {
            const wallX = obs.xPos + (obs.params.amplitude ?? 3) * Math.sin((obs.params.speed ?? 1) * time + (obs.params.phase ?? 0));
            const mCol  = hslColor(hOff, 100, 50);
            return (
              <group key={obs.id}>
                <mesh position={[wallX, 1.5, obs.zCenter]} castShadow>
                  <boxGeometry args={[1.6, 3, 0.5]} />
                  <meshStandardMaterial color={mCol} emissive={new Color(mCol)} emissiveIntensity={0.9} roughness={0.25} metalness={0.4} />
                </mesh>
                <PulsingLight color="#4499ff" base={5} dist={10} pos={[wallX, 1.5, obs.zCenter]} rate={0.7} />
              </group>
            );
          }
          case 'rotating_barrier': {
            const angle = (obs.params.speed ?? 1.2) * time + (obs.params.phase ?? 0);
            const mCol  = hslColor((hOff + 200) % 360, 100, 50);
            const arms  = Array.from({ length: obs.params.numArms ?? 2 }, (_, a) => {
              const aa = angle + (a / (obs.params.numArms ?? 2)) * Math.PI * 2;
              const ax = obs.xPos + Math.cos(aa) * (obs.params.armLength ?? 4.5) / 2;
              const az = obs.zCenter + Math.sin(aa) * (obs.params.armLength ?? 4.5) / 2;
              return (
                <mesh key={a} position={[ax, 0.7, az]} rotation={[0, -aa, 0]}>
                  <boxGeometry args={[obs.params.armLength ?? 4.5, 0.4, 0.4]} />
                  <meshStandardMaterial color={mCol} emissive={new Color(mCol)} emissiveIntensity={1.2} roughness={0.2} />
                </mesh>
              );
            });
            return (
              <group key={obs.id}>
                {arms}
                <mesh position={[obs.xPos, 1.0, obs.zCenter]}>
                  <cylinderGeometry args={[0.3, 0.3, 2, 8]} />
                  <meshStandardMaterial color={mCol} emissive={new Color(mCol)} emissiveIntensity={1} />
                </mesh>
                <PulsingLight color="#ff4400" base={5} dist={12} pos={[obs.xPos, 1, obs.zCenter]} rate={0.85} />
              </group>
            );
          }
          case 'bounce_pad': {
            const mCol = hslColor((hOff + 120) % 360, 100, 55);
            return (
              <group key={obs.id}>
                <mesh position={[obs.xPos, 0.06, obs.zCenter]}>
                  <cylinderGeometry args={[1.2, 1.2, 0.14, 16]} />
                  <meshStandardMaterial color={mCol} emissive={new Color(mCol)} emissiveIntensity={1.8} roughness={0.15} />
                </mesh>
                <PulsingLight color="#00ff88" base={6} dist={9} pos={[obs.xPos, 0.5, obs.zCenter]} rate={1.0} />
              </group>
            );
          }
          case 'spinning_beam': {
            const angle   = (obs.params.speed ?? 2) * time + (obs.params.phase ?? 0);
            const halfLen = (obs.params.armLength ?? 5) / 2;
            const bx = obs.xPos + Math.cos(angle) * halfLen;
            const by = Math.sin(angle) * halfLen;
            const mCol = hslColor((hOff + 290) % 360, 100, 50);
            return (
              <group key={obs.id}>
                <mesh position={[bx, by + halfLen, obs.zCenter]} rotation={[0, 0, -angle]}>
                  <boxGeometry args={[obs.params.armLength ?? 5, 0.35, 0.35]} />
                  <meshStandardMaterial color={mCol} emissive={new Color(mCol)} emissiveIntensity={1.5} roughness={0.15} />
                </mesh>
                <PulsingLight color="#ffdd00" base={4} dist={11} pos={[obs.xPos, halfLen, obs.zCenter]} rate={0.9} />
              </group>
            );
          }
          default: return null;
        }
      })}
    </>
  );
}

// ── Player orb ────────────────────────────────────────────────────────────────

function PlayerOrb({ pos, color, hitTimeRef, fallStateRef }: {
  pos: Vector3; color: string;
  hitTimeRef: React.MutableRefObject<number>;
  fallStateRef: React.MutableRefObject<FallState>;
}) {
  const meshRef = useRef<any>(null);
  useFrame(() => {
    const mat = meshRef.current?.material as MeshStandardMaterial | undefined;
    if (!mat) return;
    const fallState = fallStateRef.current;
    const now = Date.now(), hitAge = now - hitTimeRef.current;
    if (fallState === 'falling') {
      mat.opacity = Math.max(0, mat.opacity - 0.04);
      mat.color.set(color); mat.emissive.set(color);
    } else if (fallState === 'respawning') {
      mat.opacity = 0;
    } else if (fallState === 'flashing') {
      mat.opacity = 0.4 + 0.6 * Math.abs(Math.sin(now * 0.012));
      mat.color.set(color); mat.emissive.set(color); mat.emissiveIntensity = 2.5;
    } else {
      mat.opacity = 1; mat.emissiveIntensity = 1.2;
      if (hitAge < 380) {
        const t = hitAge / 380;
        mat.color.setRGB(1, t * 0.1, t * 0.1);
        mat.emissive.setRGB(1 - t * 0.85, 0, 0);
        mat.emissiveIntensity = 1.8 - t * 0.6;
      } else { mat.color.set(color); mat.emissive.set(color); }
    }
  });
  return (
    <group position={pos}>
      <mesh ref={meshRef} castShadow>
        <sphereGeometry args={[0.5, 20, 20]} />
        <meshStandardMaterial color={color} emissive={new Color(color)} emissiveIntensity={1.2} roughness={0.15} metalness={0.5} transparent />
      </mesh>
      <pointLight color={color} intensity={5} distance={8} />
    </group>
  );
}

function OtherPlayerOrb({ orb }: { orb: OtherOrb }) {
  return (
    <group position={orb.pos}>
      <mesh>
        <sphereGeometry args={[0.5, 14, 14]} />
        <meshStandardMaterial color={orb.color} emissive={new Color(orb.color)} emissiveIntensity={0.9} roughness={0.2} metalness={0.4} transparent opacity={0.9} />
      </mesh>
      <pointLight color={orb.color} intensity={3} distance={6} />
    </group>
  );
}

// ── Parallax background shapes ────────────────────────────────────────────────

function ParallaxBackground({ physRef }: { physRef: React.MutableRefObject<PhysState> }) {
  const N = 35;
  const meshRefs = useRef<any[]>([]);

  const objs = useMemo(() => Array.from({ length: N }, (_, i) => ({
    x: Math.sin(i * 1.618 * 2) * 28,
    y: 3 + Math.abs(Math.cos(i * 1.3)) * 14,
    z: (i / N) * 500,
    scale: 0.5 + (i % 7) * 0.25,
    type: i % 3,
    hue: (i / N) * 360,
    rx: Math.sin(i) * 0.4,
    ry: Math.cos(i * 1.3) * 0.4,
    pFactor: 2.0 + (i % 3) * 0.5,
  })), []);

  const zPos = useRef(objs.map(o => o.z));

  useFrame((_, dt) => {
    const p = physRef.current;
    const velZ = p.isFalling ? 0 : Math.max(0, p.vel.z);
    for (let i = 0; i < N; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      zPos.current[i] -= velZ * objs[i].pFactor * dt;
      if (zPos.current[i] < p.pos.z - 30) {
        zPos.current[i] = p.pos.z + 130 + Math.random() * 80;
        mesh.position.x = (Math.random() - 0.5) * 56;
        mesh.position.y = 3 + Math.random() * 14;
      }
      mesh.position.z = zPos.current[i];
      mesh.rotation.x += objs[i].rx * dt;
      mesh.rotation.y += objs[i].ry * dt;
    }
  });

  return (
    <>
      {objs.map((obj, i) => (
        <mesh key={i} ref={(el: any) => { meshRefs.current[i] = el; }} position={[obj.x, obj.y, obj.z]} scale={obj.scale}>
          {obj.type === 0 ? <torusGeometry args={[1, 0.15, 8, 24]} /> :
           obj.type === 1 ? <octahedronGeometry args={[1]} /> :
           <tetrahedronGeometry args={[1]} />}
          <meshStandardMaterial
            color={`hsl(${obj.hue},100%,55%)`}
            emissive={new Color().setHSL(obj.hue / 360, 1, 0.45)}
            emissiveIntensity={1.0} transparent opacity={0.32}
          />
        </mesh>
      ))}
    </>
  );
}

// ── Speed lines ───────────────────────────────────────────────────────────────

function SpeedLines({ physRef, color }: { physRef: React.MutableRefObject<PhysState>; color: string }) {
  const N = 80;
  const posArr = useMemo(() => new Float32Array(N * 6), []);
  const geo    = useMemo(() => {
    const g = new BufferGeometry();
    const a = new BufferAttribute(posArr, 3); a.setUsage(DynamicDrawUsage);
    g.setAttribute('position', a); return g;
  }, []);
  const mat    = useMemo(() => new LineBasicMaterial({ color, transparent: true, opacity: 0 }), [color]);
  const lines  = useMemo(() => new LineSegments(geo, mat), []);

  const data = useMemo(() => Array.from({ length: N }, () => ({
    x: (Math.random() - 0.5) * 24,
    y: (Math.random() - 0.5) * 10,
    zOff: Math.random() * 70,
    halfLen: 1.5 + Math.random() * 5,
  })), []);
  const zOffsets = useRef(data.map(d => d.zOff));

  useFrame((_, dt) => {
    const p = physRef.current;
    const spd   = Math.max(0, p.vel.z);
    const ratio = Math.min(1, spd / BASE_SPEED);
    // Only ignite above 75% of BASE_SPEED — feels like hitting a boost threshold
    const above = Math.max(0, (ratio - 0.75) / 0.25);
    mat.opacity = above * above * 0.7;
    if (above < 0.05) return;
    const scroll = spd * 2.8;
    for (let i = 0; i < N; i++) {
      zOffsets.current[i] -= scroll * dt;
      if (zOffsets.current[i] < -12) {
        zOffsets.current[i] = 55 + Math.random() * 25;
        data[i].x = (Math.random() - 0.5) * 24;
        data[i].y = (Math.random() - 0.5) * 10;
      }
      const wx = p.pos.x + data[i].x;
      const wy = p.pos.y + data[i].y;
      const wz = p.pos.z + zOffsets.current[i];
      const hl = data[i].halfLen;
      posArr[i*6]   = wx; posArr[i*6+1] = wy; posArr[i*6+2] = wz - hl;
      posArr[i*6+3] = wx; posArr[i*6+4] = wy; posArr[i*6+5] = wz + hl;
    }
    geo.attributes.position.needsUpdate = true;
  });

  return <primitive object={lines} />;
}

// ── Checkpoint particle burst ─────────────────────────────────────────────────

function CheckpointBurst({ burstRef }: { burstRef: React.MutableRefObject<BurstEvent | null> }) {
  const N = 25;
  const posArr = useMemo(() => new Float32Array(N * 3), []);
  const geo    = useMemo(() => {
    const g = new BufferGeometry();
    const a = new BufferAttribute(posArr, 3); a.setUsage(DynamicDrawUsage);
    g.setAttribute('position', a); return g;
  }, []);
  const mat  = useMemo(() => new PointsMaterial({ size: 0.38, transparent: true, opacity: 0, sizeAttenuation: true }), []);
  const pts  = useMemo(() => new Points(geo, mat), []);

  const vels   = useRef(Array.from({ length: N }, () => new Vector3()));
  const active = useRef(false);
  const age    = useRef(0);
  const lastId = useRef(-1);

  useFrame((_, dt) => {
    const burst = burstRef.current;
    if (burst && burst.id !== lastId.current) {
      lastId.current = burst.id;
      active.current = true; age.current = 0;
      mat.color.set(burst.color);
      for (let i = 0; i < N; i++) {
        const a2 = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
        const el = (Math.random() * 0.7 + 0.1) * Math.PI * 0.5;
        const spd = 5 + Math.random() * 12;
        vels.current[i].set(Math.cos(a2) * Math.cos(el) * spd, Math.sin(el) * spd, Math.sin(a2) * Math.cos(el) * spd);
        posArr[i*3] = burst.pos.x; posArr[i*3+1] = burst.pos.y; posArr[i*3+2] = burst.pos.z;
      }
    }
    if (!active.current) return;
    age.current += dt;
    if (age.current > 0.55) { active.current = false; mat.opacity = 0; return; }
    for (let i = 0; i < N; i++) {
      vels.current[i].y -= 18 * dt;
      posArr[i*3]   += vels.current[i].x * dt;
      posArr[i*3+1] += vels.current[i].y * dt;
      posArr[i*3+2] += vels.current[i].z * dt;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = Math.max(0, 1 - age.current / 0.55);
  });

  return <primitive object={pts} />;
}

// ── Physics + camera loop ─────────────────────────────────────────────────────

interface LoopProps {
  course: GeneratedCourse;
  keysRef: React.MutableRefObject<Record<string, boolean>>;
  physRef: React.MutableRefObject<PhysState>;
  orbsRef: React.MutableRefObject<Map<string, OtherOrb>>;
  hitTimeRef: React.MutableRefObject<number>;
  fallStateRef: React.MutableRefObject<FallState>;
  checkpointBurstRef: React.MutableRefObject<BurstEvent | null>;
  raceActive: boolean;
  socket: Socket | null;
  onFinished: (ms: number) => void;
  onTick: (pos: Vector3, checkpoint: number, respawnMsLeft?: number) => void;
  setTime: React.Dispatch<React.SetStateAction<number>>;
  setObsTime: React.Dispatch<React.SetStateAction<number>>;
}

function PhysicsLoop({
  course, keysRef, physRef, hitTimeRef, fallStateRef, checkpointBurstRef,
  raceActive, socket, onFinished, onTick, setTime, setObsTime,
}: LoopProps) {
  const { camera } = useThree();

  useFrame((state, delta) => {
    const dt  = Math.min(delta, 0.05);
    const p   = physRef.current;
    const now = Date.now();

    setObsTime(state.clock.elapsedTime);

    if (!raceActive || p.finished) {
      camera.position.lerp(new Vector3(0, 5, -8), 0.05);
      camera.lookAt(0, 0, 30);
      return;
    }

    setTime(now - p.startTime);

    // ── Fall / respawn sequence ───────────────────────────────────────────────
    if (p.isFalling) {
      const fe = now - p.fallStartMs;
      if (fe < 600) {
        fallStateRef.current = 'falling';
        p.pos.y -= 0.06; p.vel.set(0, -4, 0);
      } else if (fe < RESPAWN_MS) {
        fallStateRef.current = 'respawning';
        const cp = course.checkpoints[p.checkpoint];
        p.pos.set(0, PLAYER_R + 0.5, cp.z + 3); p.vel.set(0, 0, 0);
      } else if (fe < RESPAWN_MS + 600) {
        fallStateRef.current = 'flashing';
        const cp = course.checkpoints[p.checkpoint];
        p.pos.set(0, PLAYER_R + 0.5, cp.z + 3); p.vel.set(0, 0, 0); p.onGround = true;
      } else {
        fallStateRef.current = 'normal'; p.isFalling = false; p.onGround = true;
      }
      const msLeft = Math.max(0, RESPAWN_MS - Math.max(0, fe - 600));
      onTick(p.pos.clone(), p.checkpoint, msLeft > 50 ? msLeft : undefined);
      camera.position.lerp(new Vector3(p.pos.x, p.pos.y + 3.5, p.pos.z - 7), 0.04);
      camera.lookAt(p.pos.x, p.pos.y + 0.8, p.pos.z);
      return;
    }

    const elapsed = now - p.startTime;

    // ── Movement ──────────────────────────────────────────────────────────────
    if (keysRef.current['KeyW'] || keysRef.current['ArrowUp'])    p.vel.z += ACCEL * dt;
    if (keysRef.current['KeyA'] || keysRef.current['ArrowLeft'])  p.vel.x += ACCEL * dt;
    if (keysRef.current['KeyD'] || keysRef.current['ArrowRight']) p.vel.x -= ACCEL * dt;

    // ── Speed cap ─────────────────────────────────────────────────────────────
    const hs = Math.sqrt(p.vel.x ** 2 + p.vel.z ** 2);
    if (hs > BASE_SPEED) { const s = BASE_SPEED / hs; p.vel.x *= s; p.vel.z *= s; }

    // ── Friction ──────────────────────────────────────────────────────────────
    const ff = Math.pow(p.onGround ? 0.88 : 0.97, dt * 60);
    p.vel.x *= ff; p.vel.z *= ff;

    // ── Gravity ───────────────────────────────────────────────────────────────
    if (!p.onGround) p.vel.y -= GRAVITY * dt;

    // ── Jump ──────────────────────────────────────────────────────────────────
    if (keysRef.current['Space'] && p.onGround && !p.jumpPressed) {
      p.vel.y = JUMP_VEL; p.onGround = false; p.jumpPressed = true;
    }
    if (!keysRef.current['Space']) p.jumpPressed = false;

    // ── Integrate ─────────────────────────────────────────────────────────────
    const np = p.pos.clone().addScaledVector(p.vel, dt);
    np.z = Math.max(1, np.z);

    // ── Ground collision ──────────────────────────────────────────────────────
    const tw        = getTrackWidth(course, np.z);
    const overTrack = Math.abs(np.x) <= tw / 2;
    if (overTrack) {
      if (np.y < PLAYER_R) { np.y = PLAYER_R; p.vel.y = Math.max(0, p.vel.y); p.onGround = true; }
      else p.onGround = false;
    } else p.onGround = false;

    // ── Fall detection ────────────────────────────────────────────────────────
    if (!p.isFalling && np.y < FALL_Y) {
      p.isFalling = true; p.fallStartMs = now; p.vel.set(0, 0, 0);
      fallStateRef.current = 'falling'; p.pos.copy(np);
      onTick(p.pos.clone(), p.checkpoint, RESPAWN_MS); return;
    }

    // ── Obstacle effects ──────────────────────────────────────────────────────
    const hitOccurred = applyObstacleEffects(course.obstacles, np, p.vel, state.clock.elapsedTime);
    if (hitOccurred && (now - p.lastKnockMs) > KNOCK_CD_MS) {
      hitTimeRef.current = now; p.lastKnockMs = now;
    }
    if (overTrack && np.y < PLAYER_R) { np.y = PLAYER_R; p.vel.y = 0; p.onGround = true; }

    // ── Checkpoint advance ────────────────────────────────────────────────────
    for (const cp of course.checkpoints) {
      if (np.z >= cp.z && cp.index > p.checkpoint) {
        p.checkpoint = cp.index;
        checkpointBurstRef.current = {
          pos: new Vector3(np.x, np.y + 0.8, np.z),
          color: CP_COLORS[(cp.index - 1) % CP_COLORS.length],
          id: now,
        };
        if (socket) socket.emit('dash:checkpoint', { index: cp.index, timeMs: elapsed });
      }
    }

    // ── Finish ────────────────────────────────────────────────────────────────
    if (np.z >= course.finishZ && !p.finished) {
      p.finished = true; p.pos.copy(np); onFinished(elapsed); return;
    }

    p.pos.copy(np);
    onTick(np.clone(), p.checkpoint);

    // ── Camera — behind player ────────────────────────────────────────────────
    camera.position.lerp(new Vector3(np.x, np.y + 3.5, np.z - 7), 1 - Math.pow(0.008, dt));
    camera.lookAt(np.x, np.y + 0.8, np.z);

    // ── Camera shake on knockback ─────────────────────────────────────────────
    const hitAge = now - hitTimeRef.current;
    if (hitAge > 0 && hitAge < 400) {
      const mag = ((400 - hitAge) / 400) * 0.18;
      camera.position.x += Math.sin(hitAge * 0.055) * mag;
      camera.position.y += Math.cos(hitAge * 0.043) * mag;
    }

    // ── Position sync ~10 Hz ─────────────────────────────────────────────────
    if (socket && (state.clock.elapsedTime - p.lastSyncTime) > 0.1) {
      p.lastSyncTime = state.clock.elapsedTime;
      socket.emit('dash:position', { position: [np.x, np.y, np.z] });
    }
  });

  return null;
}

// ── HUD ───────────────────────────────────────────────────────────────────────

function fmt(ms: number) {
  const s = Math.floor(ms / 1000), d = Math.floor((ms % 1000) / 10);
  return `${s}.${d.toString().padStart(2, '0')}`;
}

const COUNTDOWN_COLORS: Record<string, string> = { '3': '#ff3300', '2': '#ffd700', '1': '#00ccff', 'GO!': '#ffffff' };

function RaceHUD({ elapsed, checkpoint, maxCheckpoint, respawnMsLeft }: {
  elapsed: number; checkpoint: number; maxCheckpoint: number; respawnMsLeft?: number;
}) {
  return (
    <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none', userSelect: 'none' }}>
      <div className="dash-timer" style={{ fontSize: '2.4rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{fmt(elapsed)}</div>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', background: 'rgba(0,0,0,.5)', padding: '2px 10px', borderRadius: 12 }}>
        CP {checkpoint} / {maxCheckpoint}
      </div>
      {respawnMsLeft !== undefined && (
        <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#ff4444', background: 'rgba(255,0,0,.12)', border: '1px solid rgba(255,68,68,.35)', borderRadius: 10, padding: '3px 12px', animation: 'respawn-pulse 0.6s ease-in-out infinite' }}>
          RESPAWN {(respawnMsLeft / 1000).toFixed(1)}s
        </div>
      )}
    </div>
  );
}

function CountdownOverlay({ count }: { count: number | string }) {
  const isGo = count === 'GO!', col = COUNTDOWN_COLORS[String(count)] ?? '#fff';
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }}>
      {isGo ? (
        <div className="dash-go" style={{ fontSize: '5.5rem', fontWeight: 900, letterSpacing: '-0.04em', background: 'linear-gradient(135deg,#ff0080,#ffd700,#00ff88,#22d3ee)', backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 40px rgba(255,255,255,.6))' }}>GO!</div>
      ) : (
        <div className="dash-countdown" key={String(count)} style={{ fontSize: '8rem', fontWeight: 900, letterSpacing: '-0.04em', color: col, textShadow: `0 0 40px ${col}cc, 0 0 80px ${col}66` }}>{count}</div>
      )}
    </div>
  );
}

const KEY_COLORS: Record<string, string> = { 'W/↑': '#00ff88', 'A/D/←→': '#ffd700', 'Space': '#22d3ee' };

function ControlsHint() {
  return (
    <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 14, pointerEvents: 'none' }}>
      {(['W/↑', 'A/D/←→', 'Space'] as const).map((k, i) => {
        const labels = ['Forward', 'Strafe', 'Jump'], col = KEY_COLORS[k];
        return (
          <div key={k} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: col, background: `${col}18`, padding: '2px 8px', borderRadius: 5, letterSpacing: '0.06em', border: `1px solid ${col}44`, boxShadow: `0 0 8px ${col}33` }}>{k}</div>
            <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{labels[i]}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { config: GameConfig; socket: Socket; onResult: (r: ResultData) => void; }

export default function GameScreen({ config, socket, onResult }: Props) {
  const course = useMemo(() => generateCourse(config.roomCode), [config.roomCode]);

  const [phase, setPhase]            = useState<'countdown' | 'racing' | 'finished'>('countdown');
  const [countdownNum, setCountdown]  = useState<number | string>(3);
  const [elapsed, setElapsed]         = useState(0);
  const [checkpoint, setCheckpoint]   = useState(0);
  const [respawnMsLeft, setRespawn]   = useState<number | undefined>();
  const [otherOrbs, setOtherOrbs]     = useState<OtherOrb[]>([]);
  const [obsTime, setObsTime]         = useState(0);
  const [playerPos, setPlayerPos]     = useState(new Vector3(0, PLAYER_R, 5));

  const keysRef              = useRef<Record<string, boolean>>({});
  const hitTimeRef           = useRef<number>(0);
  const fallStateRef         = useRef<FallState>('normal');
  const checkpointBurstRef   = useRef<BurstEvent | null>(null);
  const physRef              = useRef<PhysState>({
    pos: new Vector3(0, PLAYER_R, 5), vel: new Vector3(0, 0, 0),
    onGround: true, checkpoint: 0, finished: false,
    startTime: 0, lastSyncTime: 0, cameraYaw: 0, jumpPressed: false,
    isFalling: false, fallStartMs: 0, lastKnockMs: 0,
  });
  const orbsRef        = useRef<Map<string, OtherOrb>>(new Map());
  const raceActiveRef  = useRef(false);
  const finishSentRef  = useRef(false);

  useEffect(() => {
    if (document.getElementById('dash-game-css')) return;
    const el = document.createElement('style'); el.id = 'dash-game-css'; el.textContent = GAME_CSS;
    document.head.appendChild(el);
  }, []);

  useEffect(() => {
    let n = 3; setCountdown(3);
    const tick = setInterval(() => {
      n--;
      if (n > 0) setCountdown(n);
      else if (n === 0) setCountdown('GO!');
      else {
        clearInterval(tick); setPhase('racing');
        raceActiveRef.current = true;
        physRef.current.startTime = Date.now();
        physRef.current.lastSyncTime = 0;
      }
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keysRef.current[e.code] = true; e.preventDefault(); };
    const up   = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  useEffect(() => {
    socket.on('dash:position', ({ socketId, name, color, position }: any) => {
      orbsRef.current.set(socketId, { id: socketId, name, color, pos: position });
      setOtherOrbs([...orbsRef.current.values()]);
    });
    socket.on('dash:result', (data: any) => {
      const won = data.winnerName === config.playerName || data.winnerId === socket.id;
      onResult({
        won, myFinishTimeMs: physRef.current.finished ? Date.now() - physRef.current.startTime : (data.myFinishTimeMs ?? 0),
        winnerName: data.winnerName ?? '', players: data.players ?? [],
        payoutCents: won ? (config.payoutCents ?? 0) : 0,
      });
    });
    return () => { socket.off('dash:position'); socket.off('dash:result'); };
  }, []);

  function handleFinished(ms: number) {
    if (finishSentRef.current) return;
    finishSentRef.current = true;
    setPhase('finished'); raceActiveRef.current = false;
    if (config.solo) {
      onResult({ won: true, myFinishTimeMs: ms, winnerName: config.playerName, players: [{ rank: 1, name: config.playerName, color: config.playerColor, finishTimeMs: ms, won: true }] });
    } else {
      socket.emit('dash:finish', { totalTimeMs: ms });
      setTimeout(() => { if (!finishSentRef.current) return; onResult({ won: false, myFinishTimeMs: ms, winnerName: '—', players: [] }); }, 12000);
    }
  }

  function handleTick(pos: Vector3, cp: number, respawnMs?: number) {
    setPlayerPos(pos.clone()); setCheckpoint(cp); setRespawn(respawnMs);
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#020208' }}>
      <Canvas shadows camera={{ fov: 70, near: 0.1, far: 800, position: [0, 5, -8] }} gl={{ antialias: true }}>
        <ambientLight intensity={0.25} color="#2244aa" />
        <directionalLight position={[20, 40, 10]} intensity={0.8} castShadow shadow-mapSize={[1024, 1024]} color="#aaccff" />
        <directionalLight position={[-10, 20, -5]} intensity={0.3} color="#ffaacc" />
        <fog attach="fog" args={['#020208', 200, 500]} />
        <mesh position={[0, 0, 200]}>
          <sphereGeometry args={[600, 16, 16]} />
          <meshBasicMaterial color="#020208" side={2} />
        </mesh>

        <ParallaxBackground physRef={physRef} />
        <Track course={course} />
        <ObstacleMeshes obstacles={course.obstacles} time={obsTime} />
        <PlayerOrb pos={playerPos} color={config.playerColor} hitTimeRef={hitTimeRef} fallStateRef={fallStateRef} />
        {otherOrbs.map(orb => <OtherPlayerOrb key={orb.id} orb={orb} />)}
        <SpeedLines physRef={physRef} color={config.playerColor} />
        <CheckpointBurst burstRef={checkpointBurstRef} />

        <PhysicsLoop
          course={course} keysRef={keysRef} physRef={physRef}
          hitTimeRef={hitTimeRef} fallStateRef={fallStateRef}
          checkpointBurstRef={checkpointBurstRef}
          orbsRef={orbsRef}
          raceActive={raceActiveRef.current || phase === 'racing'}
          socket={config.solo ? null : socket}
          onFinished={handleFinished} onTick={handleTick}
          setTime={setElapsed} setObsTime={setObsTime}
        />
      </Canvas>

      {phase === 'countdown' && <CountdownOverlay count={countdownNum} />}
      {phase === 'racing' && (
        <>
          <RaceHUD elapsed={elapsed} checkpoint={checkpoint} maxCheckpoint={course.checkpoints.length - 1} respawnMsLeft={respawnMsLeft} />
          <ControlsHint />
        </>
      )}
      {phase === 'finished' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="dash-go" style={{ fontSize: '3rem', fontWeight: 900, background: 'linear-gradient(135deg,#ffd700,#00ff88,#22d3ee)', backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 30px rgba(255,215,0,.6))' }}>FINISHED!</div>
            <div className="dash-timer" style={{ fontSize: '1.8rem', fontWeight: 900, marginTop: 8 }}>{fmt(elapsed)}</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: 8, letterSpacing: '0.08em' }}>Waiting for results…</div>
          </div>
        </div>
      )}
    </div>
  );
}
