import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Socket } from 'socket.io-client';
import { GameConfig, ResultData, InputCommands, WorldState, Obstacle } from '../types';
import { Simulation } from '../engine/Simulation';
import { NmlSounds } from '../services/sounds';
import MuteButton from './MuteButton';
import {
  FIELD_W, FIELD_D, BUNKER_H, TOWER_Y, TOWER_Z, TOWER_COUNT,
  FINISH_Z, START_Z, WIRE_BAND_ZS, ARTILLERY_BLAST_RADIUS,
} from '../constants';

interface Props {
  config: GameConfig;
  socket: Socket;
  onResult: (r: ResultData) => void;
}

// ── Blood spot pool ───────────────────────────────────────────────────────────

const MAX_BLOOD = 15;
interface BloodSpot { mesh: THREE.Mesh; life: number; maxLife: number; active: boolean; }

// ── 3D Scene ──────────────────────────────────────────────────────────────────

interface SceneProps {
  sim: Simulation;
  inputRef: React.MutableRefObject<InputCommands>;
  onStateUpdate: (s: WorldState) => void;
}

function Scene({ sim, inputRef, onStateUpdate }: SceneProps) {
  const { camera } = useThree();

  // Player parts
  const playerGroupRef = useRef<THREE.Group>(null);
  const bodyRef        = useRef<THREE.Mesh>(null);
  const headRef        = useRef<THREE.Mesh>(null);
  const leftArmRef     = useRef<THREE.Mesh>(null);
  const rightArmRef    = useRef<THREE.Mesh>(null);
  const leftLegRef     = useRef<THREE.Mesh>(null);
  const rightLegRef    = useRef<THREE.Mesh>(null);
  const bloodGroupRef  = useRef<THREE.Group>(null);

  // Instanced meshes
  const bulletMeshRef      = useRef<THREE.InstancedMesh>(null);
  const dirtMeshRef        = useRef<THREE.InstancedMesh>(null);
  const bloodFxMeshRef     = useRef<THREE.InstancedMesh>(null);
  const explosionFxMeshRef = useRef<THREE.InstancedMesh>(null);
  const smokeMeshRef       = useRef<THREE.InstancedMesh>(null);
  const fireMeshRef        = useRef<THREE.InstancedMesh>(null);
  const craterMeshRef      = useRef<THREE.InstancedMesh>(null);

  // Artillery ring
  const artRingRef  = useRef<THREE.Mesh>(null);
  const artBlastRef = useRef<THREE.Mesh>(null);

  const bloodSpotsRef      = useRef<BloodSpot[]>([]);
  const walkPhaseRef       = useRef(0);
  const prevFlashRef       = useRef(0);
  const accRef             = useRef(0);
  const prevCraterCount    = useRef(0);
  const prevActiveBullets  = useRef(0);
  const lastShootSound     = useRef(0);
  const prevArtPhase       = useRef<string>('none');
  const FIXED_DT        = 1 / 60;
  const dummy           = useMemo(() => new THREE.Object3D(), []);

  // Static world (obstacles don't change)
  const world = useMemo(() => sim.getState(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const wrecks    = useMemo(() => world.obstacles.filter(o => o.kind === 'tankWreck'), [world]);
  const wireObs   = useMemo(() => world.obstacles.filter(o => o.kind === 'barbedWire'), [world]);

  // Build blood pool
  useEffect(() => {
    const grp = bloodGroupRef.current;
    if (!grp) return;
    const spots: BloodSpot[] = [];
    for (let i = 0; i < MAX_BLOOD; i++) {
      const mat  = new THREE.MeshBasicMaterial({ color: 0x8b0000, transparent: true, opacity: 1 });
      const geo  = new THREE.SphereGeometry(0.055 + Math.random() * 0.065, 5, 4);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      grp.add(mesh);
      spots.push({ mesh, life: 0, maxLife: 2.5, active: false });
    }
    bloodSpotsRef.current = spots;
    return () => spots.forEach(s => {
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
    });
  }, []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    accRef.current += dt;
    while (accRef.current >= FIXED_DT) {
      sim.tick(inputRef.current);
      accRef.current -= FIXED_DT;
    }

    const state = sim.getState();
    onStateUpdate(state);

    const p  = state.player;
    const pg = playerGroupRef.current;
    if (!pg) return;

    // ── Camera ──────────────────────────────────────────────────────────────
    camera.position.lerp(
      new THREE.Vector3(p.pos.x, p.pos.y + 4.8, p.pos.z + 11),
      0.10,
    );
    (camera as THREE.PerspectiveCamera).lookAt(p.pos.x, p.pos.y + 0.6, p.pos.z - 5);

    // ── Player group ─────────────────────────────────────────────────────────
    pg.position.set(p.pos.x, 0, p.pos.z);
    const targetTilt = p.isCrawling ? -Math.PI * 0.43 : 0;
    pg.rotation.x += (targetTilt - pg.rotation.x) * 0.16;

    // Walk animation — only when actually moving
    const moving = Math.abs(inputRef.current.dx) + Math.abs(inputRef.current.dz) > 0.01;
    if (moving) {
      walkPhaseRef.current += dt * (p.isSprinting ? 9 : p.isCrawling ? 2.5 : 5.5);
    }
    const wp = walkPhaseRef.current;
    const bodyBob = moving ? Math.abs(Math.sin(wp)) * 0.07 : 0;

    if (leftLegRef.current)  leftLegRef.current.rotation.x  = moving ? Math.sin(wp) * 0.55 : 0;
    if (rightLegRef.current) rightLegRef.current.rotation.x = moving ? Math.sin(wp + Math.PI) * 0.55 : 0;
    if (leftArmRef.current)  leftArmRef.current.rotation.x  = moving ? Math.sin(wp + Math.PI) * 0.45 : 0;
    if (rightArmRef.current) rightArmRef.current.rotation.x = moving ? Math.sin(wp) * 0.45 : 0;
    if (bodyRef.current)  bodyRef.current.position.y  = 0.85 + bodyBob;
    if (headRef.current)  headRef.current.position.y  = 1.30 + bodyBob;

    // ── Sounds ───────────────────────────────────────────────────────────────
    const activeBullets = state.bullets.filter(b => b.active).length;
    if (activeBullets > prevActiveBullets.current) {
      const now = performance.now();
      if (now - lastShootSound.current > 130) { NmlSounds.shoot(); lastShootSound.current = now; }
    }
    prevActiveBullets.current = activeBullets;

    if (state.artilleryStatus.phase !== prevArtPhase.current) {
      if (state.artilleryStatus.phase === 'warning') NmlSounds.artWarning();
      if (state.artilleryStatus.phase === 'blast')   NmlSounds.explosion();
      prevArtPhase.current = state.artilleryStatus.phase;
    }

    // ── Hit flash ─────────────────────────────────────────────────────────────
    const flashing = p.hitFlash > 0;
    if (flashing !== (prevFlashRef.current > 0)) {
      if (bodyRef.current) (bodyRef.current.material as THREE.MeshLambertMaterial).color.setHex(flashing ? 0xff2222 : 0x3a6a3a);
      if (headRef.current) (headRef.current.material as THREE.MeshLambertMaterial).color.setHex(flashing ? 0xff4444 : 0xd4a88a);

      if (flashing) NmlSounds.hit();

      // Spawn blood spots on rising edge
      if (flashing) {
        for (let k = 0; k < 3; k++) {
          const spot = bloodSpotsRef.current.find(s => !s.active) ?? bloodSpotsRef.current[0];
          const hitY = p.isCrawling ? 0.12 : 0.35 + Math.random() * 0.75;
          spot.mesh.position.set((Math.random()-0.5)*0.3, hitY, -0.16 + (Math.random()-0.5)*0.12);
          spot.mesh.visible = true;
          spot.life    = spot.maxLife;
          spot.active  = true;
          (spot.mesh.material as THREE.MeshBasicMaterial).opacity = 0.92;
        }
      }
    }
    prevFlashRef.current = p.hitFlash;

    // Fade blood spots
    for (const spot of bloodSpotsRef.current) {
      if (!spot.active) continue;
      spot.life -= dt;
      (spot.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, spot.life / spot.maxLife) * 0.9;
      if (spot.life <= 0) { spot.active = false; spot.mesh.visible = false; }
    }

    // ── Bullets ───────────────────────────────────────────────────────────────
    const im = bulletMeshRef.current;
    if (im) {
      const MAX = 300;
      const bullets = state.bullets;
      const n = Math.min(bullets.length, MAX);
      for (let i = 0; i < n; i++) {
        const b = bullets[i];
        dummy.position.set(b.pos.x, b.pos.y, b.pos.z);
        dummy.lookAt(b.pos.x + b.vel.x, b.pos.y + b.vel.y, b.pos.z + b.vel.z);
        dummy.scale.set(0.04, 0.04, 0.22);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      }
      dummy.scale.setScalar(0); dummy.updateMatrix();
      for (let i = n; i < MAX; i++) im.setMatrixAt(i, dummy.matrix);
      im.instanceMatrix.needsUpdate = true;
    }

    // ── Effect particles ──────────────────────────────────────────────────────
    const updateFx = (mesh: THREE.InstancedMesh | null, type: string) => {
      if (!mesh) return;
      const list = state.effects.filter(e => e.type === type);
      const n = Math.min(list.length, 200);
      for (let i = 0; i < n; i++) {
        const e = list[i];
        dummy.position.set(e.x, e.y, e.z);
        dummy.scale.setScalar(e.size * Math.max(0, e.life / e.maxLife));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      dummy.scale.setScalar(0); dummy.updateMatrix();
      for (let i = n; i < 200; i++) mesh.setMatrixAt(i, dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
    };
    updateFx(dirtMeshRef.current, 'dirt');
    updateFx(bloodFxMeshRef.current, 'blood');
    updateFx(explosionFxMeshRef.current, 'explosion');

    // ── Tank smoke & fire ─────────────────────────────────────────────────────
    const elapsedT = clock.elapsedTime;
    const smokeMesh = smokeMeshRef.current;
    if (smokeMesh) {
      let idx = 0;
      const PUFFS = 4;
      for (const wreck of wrecks) {
        for (let k = 0; k < PUFFS; k++) {
          const cyc   = (elapsedT * 0.38 + k * 0.78 + wreck.pos.x * 0.07) % 3.2;
          const y     = wreck.halfY * 2 + 0.6 + cyc * 2.2;
          const ox    = Math.sin(elapsedT * 0.55 + k * 2.1 + wreck.pos.x * 0.3) * 0.45;
          const oz    = Math.cos(elapsedT * 0.45 + k * 1.7 + wreck.pos.z * 0.3) * 0.35;
          const scale = Math.max(0, (0.3 + cyc * 0.48) * (1 - cyc / 3.2));
          dummy.position.set(wreck.pos.x + ox, y, wreck.pos.z + oz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          smokeMesh.setMatrixAt(idx++, dummy.matrix);
        }
      }
      dummy.scale.setScalar(0); dummy.updateMatrix();
      const maxSmoke = wrecks.length * PUFFS + 1;
      for (let i = idx; i < maxSmoke; i++) smokeMesh.setMatrixAt(i, dummy.matrix);
      smokeMesh.instanceMatrix.needsUpdate = true;
    }

    const fireMesh = fireMeshRef.current;
    if (fireMesh) {
      for (let i = 0; i < wrecks.length; i++) {
        const w       = wrecks[i];
        const flicker = 0.65 + Math.sin(elapsedT * 14 + i * 1.3) * 0.35;
        dummy.position.set(w.pos.x, w.halfY * 1.6, w.pos.z);
        dummy.scale.setScalar(Math.max(0, flicker * 0.6));
        dummy.updateMatrix();
        fireMesh.setMatrixAt(i, dummy.matrix);
      }
      dummy.scale.setScalar(0); dummy.updateMatrix();
      for (let i = wrecks.length; i < 6; i++) fireMesh.setMatrixAt(i, dummy.matrix);
      fireMesh.instanceMatrix.needsUpdate = true;
    }

    // ── Dynamic craters ───────────────────────────────────────────────────────
    const craterMesh = craterMeshRef.current;
    if (craterMesh && state.craters.length !== prevCraterCount.current) {
      prevCraterCount.current = state.craters.length;
      for (let i = 0; i < state.craters.length; i++) {
        const c = state.craters[i];
        dummy.position.set(c.x, 0.02, c.z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(c.r, c.r, 1);
        dummy.updateMatrix();
        craterMesh.setMatrixAt(i, dummy.matrix);
      }
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0); dummy.updateMatrix();
      for (let i = state.craters.length; i < 40; i++) craterMesh.setMatrixAt(i, dummy.matrix);
      craterMesh.count = 40;
      craterMesh.instanceMatrix.needsUpdate = true;
    }

    // ── Artillery ring indicator ──────────────────────────────────────────────
    const artRing  = artRingRef.current;
    const artBlast = artBlastRef.current;
    const art      = state.artilleryStatus;

    if (artRing) {
      if (art.phase === 'warning') {
        artRing.visible = true;
        artRing.position.set(art.x, 0.06, art.z);
        const t = art.progress;
        // Start as tiny dot, grow to full blast radius
        artRing.scale.setScalar(0.04 + t * 0.96);
        const mat = artRing.material as THREE.MeshBasicMaterial;
        mat.color.setHex(t > 0.8 ? 0xff0000 : t > 0.5 ? 0xff5500 : 0xff9900);
        mat.opacity = 0.35 + t * 0.55;
      } else {
        artRing.visible = false;
      }
    }

    if (artBlast) {
      if (art.phase === 'blast') {
        artBlast.visible = true;
        artBlast.position.set(art.x, 0.08, art.z);
        const t = art.progress;
        artBlast.scale.setScalar(1.0 + t * 0.25);
        (artBlast.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.75;
      } else {
        artBlast.visible = false;
      }
    }
  });

  const towerXs = useMemo(() => {
    const sp = FIELD_W / (TOWER_COUNT + 1);
    return Array.from({ length: TOWER_COUNT }, (_, i) => -FIELD_W / 2 + sp * (i + 1));
  }, []);

  return (
    <>
      <ambientLight intensity={0.35} color={0xb0c4de} />
      <directionalLight position={[20, 40, 60]} intensity={0.85} color={0xfff5e0} castShadow />
      <fog attach="fog" args={[0x8fa0b0, 55, 140]} />

      {/* Sky dome */}
      <mesh>
        <sphereGeometry args={[180, 16, 8]} />
        <meshBasicMaterial color={0x617d8a} side={THREE.BackSide} />
      </mesh>

      {/* Ground — centred on the full field so nothing is see-through */}
      <mesh position={[0, 0, FIELD_D / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FIELD_W + 40, FIELD_D + 40]} />
        <meshLambertMaterial color={0x8d7045} />
      </mesh>

      {/* Craters — dynamic, updated via instancedMesh */}
      <instancedMesh ref={craterMeshRef} args={[undefined, undefined, 40]} frustumCulled={false}>
        <circleGeometry args={[1, 18]} />
        <meshLambertMaterial color={0x5a4020} />
      </instancedMesh>

      {/* Enemy bunker */}
      <mesh position={[0, BUNKER_H / 2, -1.5]}>
        <boxGeometry args={[FIELD_W + 8, BUNKER_H, 3]} />
        <meshLambertMaterial color={0x7a7a70} />
      </mesh>
      {/* Battlements */}
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} position={[-FIELD_W / 2 + 2.5 + i * 4.5, BUNKER_H + 0.8, -2]}>
          <boxGeometry args={[2.4, 1.6, 1.2]} />
          <meshLambertMaterial color={0x6a6a60} />
        </mesh>
      ))}

      {/* MG towers */}
      {towerXs.map((tx, i) => (
        <group key={i} position={[tx, 0, TOWER_Z]}>
          <mesh position={[0, TOWER_Y - 0.6, 0]}>
            <boxGeometry args={[2.2, 0.5, 2.2]} />
            <meshLambertMaterial color={0x5a5a52} />
          </mesh>
          <mesh position={[0, TOWER_Y + 0.05, 0]}>
            <boxGeometry args={[2.0, 0.6, 1.8]} />
            <meshLambertMaterial color={0x9b8c6a} />
          </mesh>
          {/* MG barrel */}
          <mesh position={[0, TOWER_Y + 0.3, 0.7]} rotation={[0.4, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.08, 1.2, 6]} />
            <meshLambertMaterial color={0x333333} />
          </mesh>
          {([-0.8, 0.8] as number[]).map((ox, j) => (
            <mesh key={j} position={[ox, TOWER_Y / 2, 0]}>
              <cylinderGeometry args={[0.1, 0.12, TOWER_Y, 6]} />
              <meshLambertMaterial color={0x5a5a52} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Allied trench */}
      <mesh position={[0, 0.4, START_Z + 2]}>
        <boxGeometry args={[FIELD_W + 6, 0.8, 3]} />
        <meshLambertMaterial color={0x6b5a3a} />
      </mesh>

      {/* Obstacles */}
      {world.obstacles.map((obs, i) => <ObstacleMesh key={i} obs={obs} />)}

      {/* Barbed wire — gap position comes from the seeded obstacle data */}
      {wireObs.map((w, i) => (
        <WireBand key={i} z={w.pos.z} gapX={w.gapX!} gapW={w.gapW!} />
      ))}

      {/* Tank smoke (instanced, animated in useFrame) */}
      <instancedMesh ref={smokeMeshRef} args={[undefined, undefined, wrecks.length * 4 + 1]} frustumCulled={false}>
        <sphereGeometry args={[0.8, 6, 5]} />
        <meshBasicMaterial color={0x404040} transparent opacity={0.5} depthWrite={false} />
      </instancedMesh>

      {/* Tank fire (instanced, flickering in useFrame) */}
      <instancedMesh ref={fireMeshRef} args={[undefined, undefined, 6]} frustumCulled={false}>
        <sphereGeometry args={[0.7, 6, 5]} />
        <meshBasicMaterial color={0xff6600} transparent opacity={0.82} depthWrite={false} />
      </instancedMesh>

      {/* Artillery warning ring — full blast radius, scaled in useFrame */}
      <mesh ref={artRingRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[ARTILLERY_BLAST_RADIUS * 0.78, ARTILLERY_BLAST_RADIUS, 48]} />
        <meshBasicMaterial color={0xff9900} transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Artillery blast flash */}
      <mesh ref={artBlastRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[ARTILLERY_BLAST_RADIUS, 32]} />
        <meshBasicMaterial color={0xff4400} transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Player */}
      <group ref={playerGroupRef}>
        <mesh ref={bodyRef} position={[0, 0.85, 0]} castShadow>
          <boxGeometry args={[0.5, 0.55, 0.28]} />
          <meshLambertMaterial color={0x3a6a3a} />
        </mesh>
        <mesh ref={headRef} position={[0, 1.3, 0]}>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshLambertMaterial color={0xd4a88a} />
        </mesh>
        {/* Helmet */}
        <mesh position={[0, 1.46, 0]}>
          <boxGeometry args={[0.34, 0.15, 0.36]} />
          <meshLambertMaterial color={0x2d4a1e} />
        </mesh>
        <mesh ref={leftArmRef} position={[-0.33, 0.84, 0]}>
          <boxGeometry args={[0.14, 0.46, 0.14]} />
          <meshLambertMaterial color={0x3a6a3a} />
        </mesh>
        <mesh ref={rightArmRef} position={[0.33, 0.84, 0]}>
          <boxGeometry args={[0.14, 0.46, 0.14]} />
          <meshLambertMaterial color={0x3a6a3a} />
        </mesh>
        <mesh ref={leftLegRef} position={[-0.14, 0.33, 0]}>
          <boxGeometry args={[0.18, 0.6, 0.18]} />
          <meshLambertMaterial color={0x2d4a1e} />
        </mesh>
        <mesh ref={rightLegRef} position={[0.14, 0.33, 0]}>
          <boxGeometry args={[0.18, 0.6, 0.18]} />
          <meshLambertMaterial color={0x2d4a1e} />
        </mesh>
        {/* Rifle */}
        <mesh position={[0.32, 0.82, -0.3]} rotation={[0.6, 0, 0.05]}>
          <boxGeometry args={[0.06, 0.06, 0.7]} />
          <meshLambertMaterial color={0x3a2810} />
        </mesh>
        {/* Blood spots — local space, stay on body */}
        <group ref={bloodGroupRef} />
      </group>

      {/* Bullets */}
      <instancedMesh ref={bulletMeshRef} args={[undefined, undefined, 300]} frustumCulled={false}>
        <sphereGeometry args={[1, 4, 3]} />
        <meshBasicMaterial color={0xffee88} />
      </instancedMesh>

      {/* Effects */}
      <instancedMesh ref={dirtMeshRef} args={[undefined, undefined, 200]} frustumCulled={false}>
        <sphereGeometry args={[1, 4, 3]} />
        <meshBasicMaterial color={0x7a5c3a} />
      </instancedMesh>
      <instancedMesh ref={bloodFxMeshRef} args={[undefined, undefined, 200]} frustumCulled={false}>
        <sphereGeometry args={[1, 4, 3]} />
        <meshBasicMaterial color={0xcc0022} />
      </instancedMesh>
      <instancedMesh ref={explosionFxMeshRef} args={[undefined, undefined, 200]} frustumCulled={false}>
        <sphereGeometry args={[1, 4, 3]} />
        <meshBasicMaterial color={0xff8833} />
      </instancedMesh>
    </>
  );
}

// ── Obstacle meshes ───────────────────────────────────────────────────────────

function ObstacleMesh({ obs }: { obs: Obstacle }) {
  if (obs.kind === 'barbedWire') return null;

  if (obs.kind === 'tankWreck') {
    // Smaller, more realistic tank proportions
    return (
      <group position={[obs.pos.x, 0, obs.pos.z]} rotation={[0, obs.rotation, 0]}>
        {/* Hull — lower and wider */}
        <mesh position={[0, 0.55, 0]} castShadow>
          <boxGeometry args={[obs.halfX * 1.8, 0.9, obs.halfZ * 1.6]} />
          <meshLambertMaterial color={0x3a3020} />
        </mesh>
        {/* Track skirts */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[obs.halfX * 2.1, 0.35, obs.halfZ * 1.65]} />
          <meshLambertMaterial color={0x2a2218} />
        </mesh>
        {/* Turret — smaller */}
        <mesh position={[0, 1.15, -obs.halfZ * 0.1]}>
          <boxGeometry args={[1.1, 0.55, 1.2]} />
          <meshLambertMaterial color={0x32281a} />
        </mesh>
        {/* Turret top hatch */}
        <mesh position={[0, 1.44, -obs.halfZ * 0.1]}>
          <cylinderGeometry args={[0.28, 0.32, 0.12, 8]} />
          <meshLambertMaterial color={0x222015} />
        </mesh>
        {/* Gun barrel */}
        <mesh position={[0, 1.22, -obs.halfZ * 0.6 - 0.6]} rotation={[0.04, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 1.6, 6]} />
          <meshLambertMaterial color={0x1a1810} />
        </mesh>
        {/* Damage — bent barrel end */}
        <mesh position={[0, 1.18, -obs.halfZ * 0.6 - 1.45]} rotation={[0.35, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.06, 0.4, 6]} />
          <meshLambertMaterial color={0x1a1810} />
        </mesh>
      </group>
    );
  }

  // Sandbags
  const rows: JSX.Element[] = [];
  for (let row = 0; row < 3; row++) {
    const cols = row === 0 ? 4 : 3;
    for (let col = 0; col < cols; col++) {
      rows.push(
        <mesh key={`${row}-${col}`}
          position={[(col - (cols - 1) / 2) * 0.65, row * 0.38 + 0.2, (row % 2) * 0.12]}
          castShadow
        >
          <boxGeometry args={[0.6, 0.36, 0.32]} />
          <meshLambertMaterial color={0xa09060} />
        </mesh>
      );
    }
  }
  return <group position={[obs.pos.x, 0, obs.pos.z]} rotation={[0, obs.rotation, 0]}>{rows}</group>;
}

// ── Barbed wire ───────────────────────────────────────────────────────────────

function WireBand({ z, gapX, gapW }: { z: number; gapX: number; gapW: number }) {
  const postCount  = Math.floor(FIELD_W / 4.5) + 1;
  const gapEnd     = gapX + gapW;
  const leftWidth  = gapX - (-FIELD_W / 2);
  const rightWidth = FIELD_W / 2 - gapEnd;
  const leftCX     = -FIELD_W / 2 + leftWidth / 2;
  const rightCX    = gapEnd + rightWidth / 2;

  return (
    <group>
      {/* Posts — omit any that fall inside the gap */}
      {Array.from({ length: postCount }, (_, i) => {
        const px = -FIELD_W / 2 + i * 4.5;
        if (px >= gapX - 0.3 && px <= gapEnd + 0.3) return null;
        return (
          <mesh key={i} position={[px, 0.6, z]}>
            <cylinderGeometry args={[0.05, 0.06, 1.2, 5]} />
            <meshLambertMaterial color={0x6a5a40} />
          </mesh>
        );
      })}

      {/* Wire strands — left segment */}
      {([0.5, 0.9, 1.15] as number[]).map((wy, si) => (
        <mesh key={`l${si}`} position={[leftCX, wy, z]}>
          <boxGeometry args={[leftWidth, 0.03, 0.03]} />
          <meshLambertMaterial color={0x888880} />
        </mesh>
      ))}

      {/* Wire strands — right segment */}
      {([0.5, 0.9, 1.15] as number[]).map((wy, si) => (
        <mesh key={`r${si}`} position={[rightCX, wy, z]}>
          <boxGeometry args={[rightWidth, 0.03, 0.03]} />
          <meshLambertMaterial color={0x888880} />
        </mesh>
      ))}
    </group>
  );
}

// ── HUD ───────────────────────────────────────────────────────────────────────

function HUD({ state }: { state: WorldState }) {
  const { player, distancePct, artilleryStatus, timer } = state;
  const hp    = Math.max(0, player.health);
  const hpCol = hp > 60 ? '#22c55e' : hp > 30 ? '#eab308' : '#ef4444';
  const mins  = Math.floor(timer / 60);
  const secs  = Math.floor(timer % 60).toString().padStart(2, '0');

  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      fontFamily: 'ui-monospace, monospace',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: '18px 22px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={chip}>{mins > 0 ? `${mins}:` : ''}{secs}</div>
        <div style={{ ...chip, color: 'rgba(255,255,255,0.3)', fontSize: '0.67rem' }}>
          WASD / Arrows · Shift sprint · C crawl
        </div>
      </div>

      {artilleryStatus.phase === 'warning' && (
        <div style={{
          position: 'absolute', top: 66, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(180,0,0,0.7)', border: '1px solid #ff4444',
          borderRadius: 10, padding: '8px 22px', color: '#fff',
          fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.15em',
          animation: 'artWarn 0.4s ease-in-out infinite alternate',
        }}>
          ⚠ INCOMING ⚠
        </div>
      )}

      <div style={{ position: 'absolute', top: 64, left: 22, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {player.isCrawling && <Badge label="CRAWLING" color="#eab308" />}
        {player.isSprinting && <Badge label="SPRINT"   color="#60a5fa" />}
        {player.inCrater   && <Badge label="IN COVER" color="#4ade80" />}
        {player.inWire     && <Badge label="WIRE"     color="#f87171" />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Bar label={`ADVANCE — ${Math.round(distancePct * 100)}%`} pct={distancePct} color="#22c55e" h={6} />
        <Bar label={`HP — ${Math.round(hp)} / ${player.maxHealth}`} pct={hp / player.maxHealth} color={hpCol} h={10} />
      </div>
    </div>
  );
}

const chip: React.CSSProperties = {
  background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '6px 14px', color: 'rgba(255,255,255,0.75)',
  fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.12em',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      background: `${color}22`, border: `1px solid ${color}77`,
      borderRadius: 6, padding: '3px 10px', color, fontSize: '0.7rem',
      fontWeight: 700, letterSpacing: '0.12em',
    }}>{label}</div>
  );
}

function Bar({ label, pct, color, h }: { label: string; pct: number; color: string; h: number }) {
  return (
    <div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', letterSpacing: '0.15em', marginBottom: 4 }}>{label}</div>
      <div style={{ height: h, background: 'rgba(255,255,255,0.1)', borderRadius: h / 2 }}>
        <div style={{ height: '100%', borderRadius: h / 2, background: color, width: `${Math.max(0, pct) * 100}%`, transition: 'width 0.07s, background 0.2s' }} />
      </div>
    </div>
  );
}

// ── End overlays ──────────────────────────────────────────────────────────────

function EndCard({ bg, accent, title, sub, detail, btnLabel, onBtn }: {
  bg: string; accent: string; title: string; sub: string; detail: string;
  btnLabel: string; onBtn: () => void;
}) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: bg, fontFamily: 'ui-monospace, monospace',
    }}>
      <div style={{ fontSize: '3.5rem', fontWeight: 900, color: accent, lineHeight: 1 }}>{title}</div>
      <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.3em', marginTop: 6 }}>{sub}</div>
      {detail && <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#fff', marginTop: 22 }}>{detail}</div>}
      <button onClick={onBtn} style={{
        marginTop: 28, padding: '12px 32px', borderRadius: 10,
        border: `1px solid ${accent}`, background: `${accent}22`,
        color: accent, fontFamily: 'inherit', fontSize: '0.9rem',
        fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
      }}>{btnLabel}</button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function GameScreen({ config, onResult }: Props) {
  const simRef   = useRef<Simulation | null>(null);
  const inputRef = useRef<InputCommands>({ dx: 0, dz: 0, crawl: false, sprint: false });
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const phaseRef = useRef('playing');

  useEffect(() => {
    simRef.current = new Simulation(config.roomCode);
    setWorldState(simRef.current.getState());
  }, [config.roomCode]);

  useEffect(() => {
    const keys = new Set<string>();
    const sync = () => {
      inputRef.current = {
        dx: (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0)
          - (keys.has('ArrowLeft')  || keys.has('KeyA') ? 1 : 0),
        dz: (keys.has('ArrowDown')  || keys.has('KeyS') ? 1 : 0)
          - (keys.has('ArrowUp')    || keys.has('KeyW') ? 1 : 0),
        crawl:  keys.has('KeyC'),
        sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      };
    };
    const dn = (e: KeyboardEvent) => { e.preventDefault(); keys.add(e.code); sync(); };
    const up = (e: KeyboardEvent) => { keys.delete(e.code); sync(); };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  const handleStateUpdate = useCallback((state: WorldState) => {
    if (state.phase !== phaseRef.current) phaseRef.current = state.phase;
    setWorldState({ ...state });
  }, []);

  useEffect(() => {
    if (phase === 'victory') NmlSounds.win();
    if (phase === 'dead')    NmlSounds.die();
  }, [phase]);

  const handleDone = useCallback(() => {
    const state = simRef.current?.getState();
    onResult({
      won: phaseRef.current === 'victory',
      draw: false,
      myTimeMs:       state ? state.timer * 1000 : null,
      opponentTimeMs: null,
      winnerName:     phaseRef.current === 'victory' ? config.playerName : 'Enemy',
    });
  }, [onResult, config.playerName]);

  if (!simRef.current) return null;
  const phase = worldState?.phase ?? 'playing';

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#03030a' }}>
      <Canvas
        camera={{ fov: 62, near: 0.1, far: 220, position: [0, 4.8, START_Z + 11] }}
        gl={{ antialias: true }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Scene sim={simRef.current} inputRef={inputRef} onStateUpdate={handleStateUpdate} />
      </Canvas>

      {worldState && phase === 'playing' && <HUD state={worldState} />}

      {/* Mute button — always visible during gameplay */}
      <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 999 }}>
        <MuteButton />
      </div>

      {phase === 'victory' && worldState && (
        <EndCard bg="rgba(0,20,0,0.84)" accent="#22c55e" title="ACROSS"
          sub="NO MAN'S LAND CROSSED"
          detail={`${Math.floor(worldState.timer / 60) > 0 ? Math.floor(worldState.timer / 60) + 'm ' : ''}${(worldState.timer % 60).toFixed(2)}s`}
          btnLabel="BACK TO LOBBY" onBtn={handleDone} />
      )}
      {phase === 'dead' && (
        <EndCard bg="rgba(30,0,0,0.86)" accent="#ef4444" title="KIA"
          sub="KILLED IN ACTION" detail="" btnLabel="TRY AGAIN" onBtn={handleDone} />
      )}

      <style>{`@keyframes artWarn { from{opacity:0.7} to{opacity:1} }`}</style>
    </div>
  );
}
