/**
 * Grey-box runner. Deliberately ugly: plain boxes, no palette, no effects.
 *
 * The point of this build is to find out whether the thing is any fun before
 * anyone spends time making it look like the key art. Everything visual here is
 * expected to be thrown away; everything in engine/ is not.
 */
import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Vector3, Color, OctahedronGeometry, BoxGeometry } from 'three';
import type { MeshStandardMaterial as THREE_Mat } from 'three';
import type { Socket } from 'socket.io-client';
import { loadPB, savePB, compare, PersonalBest, Beaten } from '../engine/RunnerPB';
import {
  pushRunState, noteToken, noteContact, noteFinish, setDashQuality,
  getHazardMaterial, getTokenMaterial, getDoomedMaterial,
  DashScenery, PlayerRig, RewardLayer,
} from './dashTheme';
import { unlockAudio, playToken, playContact, playFinish } from '../services/rewardAudio';

import {
  generateRun, laneX, trackCenter, RunCourse,
  LANES, LANE_W, RESET_SPEED, RACE_MS,
} from '../engine/RunnerCourse';
import {
  initialState, step, playerX, RunnerState, RunnerInput, FIXED_DT,
  estimateReaction, ceilingTokens,
} from '../engine/RunnerPhysics';

const VIEW_AHEAD  = 130;
const VIEW_BEHIND = 25;

/**
 * How far ahead the token line reads as "live". Shorter than VIEW_AHEAD on
 * purpose: the player should see the whole course to plan, but only commit to
 * a short segment of line at a time.
 */
const LIVE_LEAD = 34;

/**
 * Geometry is shared, not declared inline.
 *
 * <octahedronGeometry> inside a map builds a NEW geometry for every token, and
 * rebuilds all of them whenever the view window advances — roughly 34
 * allocations and disposals twice a second at racing speed, which is a
 * reconciliation spike you can feel. Three shapes cover everything drawn here.
 */
const GEO = {
  token: new OctahedronGeometry(0.5),
  doomed: new OctahedronGeometry(0.46),
  hazard: new BoxGeometry(LANE_W * 0.92, 2, 0.7),
};

/**
 * Which way lane index runs on screen.
 *
 * The chase camera looks along +z, which flips the world x axis across the
 * view: +x lands on the LEFT of the screen. Lane index rises with x (see
 * laneX), so lane 2 is screen-left and lane 0 is screen-right, and mapping A to
 * a decreasing lane index walked the player right.
 *
 * Corrected here rather than by negating laneX, because which side a lane
 * appears on is a fact about where the camera sits, not about the course —
 * GameScreen.tsx resolves the same flip the same way, with KeyA adding to x.
 */
const STEER_SCREEN_LEFT: -1 | 1 = 1;

// ── Track ─────────────────────────────────────────────────────────────────────

function Track({ course, zRef }: { course: RunCourse; zRef: React.MutableRefObject<number> }) {
  const SLAB = 10;
  const group = useRef<any>(null);
  const count = Math.ceil((VIEW_AHEAD + VIEW_BEHIND) / SLAB);

  useFrame(() => {
    if (!group.current) return;
    const z0 = Math.floor((zRef.current - VIEW_BEHIND) / SLAB) * SLAB;
    group.current.children.forEach((m: any, i: number) => {
      const z = z0 + i * SLAB;
      m.position.set(trackCenter(course, z), -0.35, z);
    });
  });

  return (
    <group ref={group}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} receiveShadow>
          <boxGeometry args={[LANES * LANE_W + 1.2, 0.3, SLAB]} />
          <meshStandardMaterial color={i % 2 ? '#26262e' : '#202027'} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The token line.
 *
 * Only the stretch inside LIVE_LEAD is lit; beyond it the line is dim, so the
 * eye tracks a short live segment rather than a long gold carpet. A trail that
 * dead-ends into a blocked lane burns amber from the moment it enters view,
 * which turns the one-in-three betrayal into a beat the player can learn
 * instead of a trap they have to memorise per seed.
 *
 * Lighting is mutated per frame through material refs rather than by
 * re-rendering. Which tokens are MOUNTED changes only every 20 units, so
 * driving the glow off React state would make it step in 20-unit jumps —
 * which is the exact artefact this is supposed to remove.
 */
function TokenLine({ course, tokens, zRef }: {
  course: RunCourse;
  tokens: { z: number; lane: number; doomed?: boolean }[];
  zRef: React.MutableRefObject<number>;
}) {
  /**
   * A bounded pool, cloned once from the pack's materials.
   *
   * The pack asks for one shared material per kind, which is right for
   * hazards — they are drawn in bulk. It cannot work for tokens, because the
   * live window lights each one by its distance ahead, and a shared material
   * would mean the last token written wins. Cloning per render would leak a
   * material every time the view bucket advances, so the pool is fixed and
   * indexed instead: colour and emissive still come from the pack, the count
   * is capped, and nothing is allocated per frame.
   *
   * Only ~34 tokens are ever on screen (VIEW_AHEAD / TOKEN_SPACING), so 48 is
   * headroom rather than a limit.
   */
  /**
   * Derived, not guessed: the window is VIEW_AHEAD plus one BUCKET of overhang
   * plus the 6 units kept behind, divided by token spacing — 44 worst case.
   * Rounded up with headroom so widening the view or the bucket cannot
   * silently start recycling a material that is still on screen.
   */
  const POOL = 64;
  const pool = useMemo(() => ({
    safe: Array.from({ length: POOL }, () => getTokenMaterial().clone()),
    doomed: Array.from({ length: POOL }, () => getDoomedMaterial().clone()),
  }), []);
  const mats = useRef<(THREE_Mat | null)[]>([]);

  useFrame(({ clock }) => {
    const zNow = zRef.current;
    const pulse = 0.72 + 0.28 * Math.sin(clock.elapsedTime * 5.2);
    for (let i = 0; i < tokens.length; i++) {
      const m = mats.current[i];
      if (!m) continue;
      const ahead = tokens[i].z - zNow;
      const live = ahead > -2 && ahead < LIVE_LEAD;
      if (!live) { m.emissiveIntensity = 0.16; m.opacity = 0.3; continue; }
      // Doomed trails pulse, so the warning reads as urgency rather than as
      // just another colour the player has to have been told about.
      m.emissiveIntensity = tokens[i].doomed ? 2.0 * pulse : 1.15;
      m.opacity = 1;
    }
  });

  return (
    <>
      {tokens.map((t, i) => {
        return (
          <mesh
            key={`${t.z}-${t.lane}`}
            position={[laneX(course, t.lane, t.z), 0.8, t.z]}
            geometry={t.doomed ? GEO.doomed : GEO.token}
            material={(t.doomed ? pool.doomed : pool.safe)[i % POOL]}
            ref={() => { mats.current[i] = (t.doomed ? pool.doomed : pool.safe)[i % POOL]; }}
          />
        );
      })}
    </>
  );
}

// ── Hazards and shards, windowed around the player ────────────────────────────

function Hazards({ course, zRef }: { course: RunCourse; zRef: React.MutableRefObject<number> }) {
  // Re-render only when the visible window actually moves on, not every frame:
  // rebuilding this subtree at 60Hz drops the framerate far enough to change
  // how the game feels, which would defeat the point of a playtest build.
  // Wider bucket, fewer reconciliations. The lit window is driven per frame
  // through material refs, so this only controls which objects are MOUNTED —
  // raising it costs a few more off-screen draws and halves the spikes.
  const BUCKET = 40;
  const [bucket, setBucket] = useState(0);
  useFrame(() => {
    const b = Math.floor(zRef.current / BUCKET);
    if (b !== bucket) setBucket(b);
  });

  const z = bucket * BUCKET;
  const rows = course.rows.filter(r => r.z > z - 6 && r.z < z + VIEW_AHEAD);
  const tokens = course.tokens.filter((t: {z:number;lane:number}) => t.z > z - 6 && t.z < z + VIEW_AHEAD);

  return (
    <>
      {rows.map(r => (
        <group key={r.z}>
          {/* One shared hazard material, never cloned per box: these are drawn
              in bulk every frame and per-box materials would hitch. */}
          {r.blocked.map(l => (
            <mesh
              key={l}
              position={[laneX(course, l, r.z), 1, r.z]}
              geometry={GEO.hazard}
              material={getHazardMaterial()}
            />
          ))}
        </group>
      ))}
      {/* The line is a read, not a ribbon to vacuum.
          Only the stretch inside LIVE_LEAD is lit; past that it is dim, so the
          eye tracks a short live segment instead of a long gold carpet. A
          trail that dead-ends into a blocked lane is amber from the moment it
          enters view, which turns the one-in-three betrayal into a beat the
          player can learn rather than a trap they memorise per seed. */}
      <TokenLine course={course} tokens={tokens} zRef={zRef} />
    </>
  );
}

// ── Opponents ─────────────────────────────────────────────────────────────────

/**
 * An opponent is a NUMBER, never a position.
 *
 * They used to be drawn as ghost riders at their actual lane, which leaked the
 * route: everyone races the same course, so an opponent ahead of you is
 * standing in the answer to a row you have not reached. A weaker player could
 * follow the leader's line instead of reading the course. Only the token delta
 * crosses the wire now.
 */
export interface Rival { id: string; tokens: number; name: string; color: string; }

/**
 * Your previous best run on this course, stepped alongside the live one.
 *
 * The simulation is deterministic, so replaying the stored trace reproduces
 * that run exactly — this is not an approximation or a recorded path, it is
 * the same code running the same inputs. Stepped inside the live loop so the
 * two stay on the same clock.
 */
function usePBGhost(course: RunCourse, pb: PersonalBest | null, runId: number) {
  return useMemo(() => {
    if (!pb || !pb.trace.length) return null;
    return { state: initialState(), trace: pb.trace, cursor: 0 };
  }, [pb, course, runId]);
}

function GhostRider({ course, ghost }: {
  course: RunCourse;
  ghost: { state: RunnerState } | null;
}) {
  const ref = useRef<any>(null);
  useFrame(() => {
    if (!ref.current || !ghost) return;
    ref.current.position.set(playerX(course, ghost.state), 0.5, ghost.state.z);
  });
  if (!ghost) return null;
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.5, 14, 12]} />
      <meshStandardMaterial
        color="#9aa4b2" emissive={new Color('#9aa4b2')} emissiveIntensity={0.4}
        transparent opacity={0.3} depthWrite={false}
      />
    </mesh>
  );
}

// ── Simulation loop ───────────────────────────────────────────────────────────

interface LoopProps {
  course: RunCourse;
  stateRef: React.MutableRefObject<RunnerState>;
  /**
   * Timestamped input queue rather than a polled key state.
   *
   * Key events cannot interrupt a frame callback, so every fixed step pumped
   * in one frame used to read the SAME boolean state — quantising a 60Hz
   * player's decisions to 16.7ms while a 144Hz player got 6.9ms. Measured,
   * that was worth only +0.5% in tokens but won 84.7% of head-to-heads at
   * identical skill, because with no randomness in the course a small
   * consistent edge wins nearly every time. A monitor should not be worth
   * most of a reaction-time improvement in a paid match.
   *
   * Each press carries its own event.timeStamp and is applied at the step
   * whose wall-clock window actually contains it, so input resolution comes
   * from the keyboard rather than the display.
   */
  /**
   * ONE pending press, carrying the timestamp it was made at. Not a queue —
   * buffering inputs would let a burst spread across ticks and make a lane
   * change cost less than it should.
   *
   * The timestamp is the point. Key events cannot interrupt a frame callback,
   * so reading key STATE once per frame quantises a 60Hz player's decisions to
   * 16.7ms against a 144Hz player's 6.9ms. Measured, that was worth only +0.5%
   * in tokens but won 84.7% of head-to-heads at identical skill — with no
   * randomness in the course, a small consistent edge wins nearly every time.
   * Applying each press at the tick whose window actually contains it makes
   * input resolution a property of the keyboard, not the monitor.
   */
  inputRef: React.MutableRefObject<{ dir: -1 | 1; t: number } | null>;
  zRef: React.MutableRefObject<number>;
  onEnd: (s: RunnerState) => void;
  onHud: (s: RunnerState) => void;
  socket: Socket | null;
  ghost: { state: RunnerState; trace: [number, number][]; cursor: number } | null;
  onTrace?: (t: [number, number][]) => void;
}

/**
 * How often a position report goes to the server, in fixed steps. 60 steps is
 * half a second, giving ~180 reports over a race against the 24 the server
 * requires — enough headroom that a few dropped packets cannot fail an honest
 * run, while still leaving the whole race visible in the stream.
 */
const REPORT_EVERY_STEPS = 60;

function Loop({ course, stateRef, inputRef, zRef, onEnd, onHud, socket, ghost, onTrace }: LoopProps) {
  const { camera } = useThree();
  // Stable across frames so the pack is not handed a new closure every tick.
  const centerFn = useMemo(() => (z: number) => trackCenter(course, z), [course]);
  const acc = useRef(0);
  /** Wall clock of sim step 0, so a step index can be converted to a time. */
  const t0 = useRef(0);
  const done = useRef(false);
  const hudAcc = useRef(0);
  /**
   * Absolute fixed-step index, and the sparse record of every step a lane
   * change was asked on. This IS the run as far as the server is concerned:
   * it replays these inputs to derive the score rather than believing the
   * number we report.
   */
  const stepNo = useRef(0);
  const trace = useRef<[number, number][]>([]);
  const started = useRef(false);

  useFrame((_, delta) => {
    const s = stateRef.current;
    if (done.current) return;

    // Fixed-step accumulator. Leftover time is carried, never folded into a
    // step — a variable dt would make distance framerate-dependent and the
    // server would have nothing stable to check against.
    if (!t0.current) t0.current = performance.now() - acc.current * 1000;
    acc.current += Math.min(delta, 0.25);
    while (acc.current >= FIXED_DT && !s.finished) {
      // The wall-clock window this fixed step covers. Inputs are applied to
      // the step that actually contains their timestamp, which is what makes
      // the result independent of frame rate.
      // The wall-clock window this tick covers. A press is applied on the tick
      // that actually contains its timestamp, which is what makes the result
      // independent of frame rate.
      const stepEndMs = t0.current + (stepNo.current + 1) * FIXED_DT * 1000;
      let steer: -1 | 0 | 1 = 0;
      const pending = inputRef.current;
      if (pending && pending.t <= stepEndMs) {
        steer = pending.dir;
        inputRef.current = null;
      }

      if (!started.current) { started.current = true; socket?.emit('parity:start'); }
      if (steer !== 0) trace.current.push([stepNo.current, steer]);

      const input: RunnerInput = { steer };
      const ev = step(course, s, input);

      // Reward feedback fires off the simulation's own events, so what the
      // player sees and hears is the same thing the server will later replay.
      if (ev.picked) { noteToken(); playToken(s.streak); }
      if (ev.crashed) { noteContact(); playContact(); }

      if (socket && stepNo.current % REPORT_EVERY_STEPS === 0) {
        socket.emit('parity:progress', { step: stepNo.current, z: s.z, tokens: s.tokens });
      }

      // The ghost advances on the same fixed step as the live run, so the two
      // are always comparing the same moment rather than drifting on frames.
      if (ghost && !ghost.state.finished) {
        let g: -1 | 0 | 1 = 0;
        while (ghost.cursor < ghost.trace.length && ghost.trace[ghost.cursor][0] === stepNo.current) {
          g = ghost.trace[ghost.cursor][1] as -1 | 1; ghost.cursor++;
        }
        step(course, ghost.state, { steer: g });
      }

      stepNo.current++;
      acc.current -= FIXED_DT;
    }

    zRef.current = s.z;

    // Visual state is pushed, never held in React: these change every frame and
    // re-rendering for them would cost more than the effects they drive.
    // `threat` is omitted deliberately — the pack declares it but never reads it.
    pushRunState({
      speed: s.speed,
      z: s.z,
      laneX: playerX(course, s),
      streak: s.streak,
      // The pack pins its scenery to absolute x; this course sways by up to
      // 18 units, so without it the player drives through the canyon walls.
      centerAt: centerFn,
    });

    const px = playerX(course, s);
    camera.position.lerp(new Vector3(px * 0.6 + trackCenter(course, s.z) * 0.4, 5.2, s.z - 9), 0.12);
    camera.lookAt(trackCenter(course, s.z + 20), 0.8, s.z + 20);

    hudAcc.current += delta;
    if (hudAcc.current > 0.08) { hudAcc.current = 0; onHud(s); }

    if (s.finished && !done.current) {
      done.current = true;
      noteFinish(); playFinish();
      socket?.emit('parity:finish', { tokens: s.tokens, trace: trace.current });
      onTrace?.(trace.current);
      onEnd(s);
    }
  });
  return null;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RunnerScreen({
  roomCode = 'GREYBOX', onExit, socket = null, solo = false, onResult,
}: {
  roomCode?: string;
  onExit?: () => void;
  /** Null for solo practice — the run is then never submitted anywhere. */
  socket?: Socket | null;
  solo?: boolean;
  onResult?: (r: {
    won: boolean; myTokens: number | null; winnerName: string; players?: any[];
  }) => void;
}) {
  const course = useMemo(() => generateRun(roomCode), [roomCode]);
  const stateRef = useRef<RunnerState>(initialState());
  const zRef = useRef(0);
  const inputRef = useRef<{ dir: -1 | 1; t: number } | null>(null);

  const [hud, setHud] = useState({ z: 0, t: 0, clean: 0, tokens: 0, seen: 0, crashes: 0, speed: RESET_SPEED });
  const [final, setFinal] = useState<RunnerState | null>(null);
  // Remounts the loop on restart; without it the loop's `done` latch stays set
  // and a second run never advances.
  const [runId, setRunId] = useState(0);
  const [rejected, setRejected] = useState<string | null>(null);
  const [pb, setPb] = useState<PersonalBest | null>(() => loadPB(roomCode));
  const [beatPB, setBeatPB] = useState(false);
  const [beaten, setBeaten] = useState<Beaten | null>(null);
  const traceRef = useRef<[number, number][]>([]);
  const ghostRun = usePBGhost(course, pb, runId);
  const ghostsRef = useRef<Map<string, Rival>>(new Map());
  const [rivals, setRivals] = useState<Rival[]>([]);

  /**
   * The server ranks the room and sends the verdict. A rejected run comes back
   * with myTokens null rather than a score, because a run that failed
   * validation did not happen as far as the result is concerned.
   */
  // Browsers will not start audio without a gesture. The click that begins a
  // run is the only one guaranteed to exist.
  useEffect(() => { unlockAudio(); }, [runId]);

  useEffect(() => {
    if (!socket || solo || !onResult) return;
    const onDone = (d: any) => onResult({
      won: d.winnerId === socket.id,
      myTokens: d.myTokens ?? null,
      winnerName: d.winnerName ?? '',
      players: d.players,
    });
    const onRejected = ({ reason }: { reason: string }) => {
      console.warn('[parity] run rejected:', reason);
      setRejected(reason);
    };
    const onPos = (g: Rival) => {
      const prev = ghostsRef.current.get(g.id);
      ghostsRef.current.set(g.id, { ...g, name: g.name || prev?.name || '' });
      setRivals([...ghostsRef.current.values()]);
    };
    socket.on('dash:result', onDone);
    socket.on('parity:rejected', onRejected);
    socket.on('parity:position', onPos);
    return () => {
      socket.off('dash:result', onDone);
      socket.off('parity:rejected', onRejected);
      socket.off('parity:position', onPos);
    };
  }, [socket, solo, onResult]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') e.preventDefault();
      // Browsers fire repeated keydown while a key is held. A held key is one
      // lane change, not a walk across the board.
      if (e.repeat) return;
      const dir: -1 | 1 | 0 =
        (e.code === 'KeyA' || e.code === 'ArrowLeft') ? STEER_SCREEN_LEFT :
        (e.code === 'KeyD' || e.code === 'ArrowRight') ? (-STEER_SCREEN_LEFT as -1 | 1) : 0;
      if (!dir) return;
      // event.timeStamp shares an origin with performance.now(), so it can be
      // compared directly against a sim step's wall-clock window.
      // Last press wins. A second press before the first has been consumed
      // replaces it rather than stacking, so spamming A/D cannot buy extra
      // moves — the physics lockout drops them anyway once a move is in
      // flight, and this keeps the client honest about it too.
      inputRef.current = { dir, t: e.timeStamp };
    };
    // Key-up carries no meaning now: a press IS the whole input.
    const up = (_e: KeyboardEvent) => {};
    const blur = () => { inputRef.current = null; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const mono: React.CSSProperties = { fontFamily: 'ui-monospace, monospace', color: '#dfe6ee' };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0a0a0f' }}>
      <Canvas shadows camera={{ fov: 72, near: 0.1, far: 400, position: [0, 5.2, -9] }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 25, 8]} intensity={1.1} castShadow />
        <fog attach="fog" args={['#0a0a0f', 60, 170]} />
        <DashScenery />
        <Track course={course} zRef={zRef} />
        <Hazards course={course} zRef={zRef} />
        <PlayerRig />
        <RewardLayer />
        <GhostRider course={course} ghost={ghostRun} />
        <Loop
          key={runId}
          course={course} stateRef={stateRef} inputRef={inputRef} zRef={zRef}
          socket={socket}
          ghost={ghostRun}
          onTrace={t => { traceRef.current = t; }}
          onEnd={s => {
            setFinal(s);
            // PBs are per-course: the seed is the level, so a best is only
            // meaningful against the course it was set on.
            const run: PersonalBest = {
              tokens: s.tokens, streak: s.bestStreak, contacts: s.crashes,
              closing: s.bands[2],
              greedPct: s.greedSeen ? (s.greedTook / s.greedSeen) * 100 : 0,
              reactionMs: estimateReaction(s) === null ? null : Math.round(estimateReaction(s)! * 1000),
              trace: traceRef.current, at: Date.now(),
            };
            setBeaten(compare(loadPB(roomCode), run));
            const beat = savePB(roomCode, run);
            setBeatPB(beat);
            if (beat) setPb(loadPB(roomCode));
          }}
          onHud={s => setHud({
            z: s.z, t: s.elapsedS, clean: s.cleanS,
            tokens: s.tokens, seen: s.tokensSeen, crashes: s.crashes, speed: s.speed,
          })}
        />
      </Canvas>

      {/* HUD — numbers only, on purpose */}
      <div style={{ ...mono, position: 'absolute', top: 14, left: 16, fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-.02em', color: '#ffd76a' }}>
          {hud.tokens}<span style={{ fontSize: 14, opacity: .55, fontWeight: 400, color: '#dfe6ee' }}> / {hud.seen}</span>
        </div>
        <div style={{ opacity: .55, marginTop: -4, marginBottom: 6 }}>tokens</div>
        <div>t {Math.max(0, RACE_MS / 1000 - hud.t).toFixed(1)}s</div>
        <div>{hud.speed.toFixed(0)} u/s · {hud.z.toFixed(0)}u</div>
        <div>clean {hud.clean.toFixed(1)}s · contacts {hud.crashes}</div>
        {/* Opponents are a delta, never a position. See the Rival comment. */}
        {rivals.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {rivals.map(r => {
              const d = hud.tokens - r.tokens;
              return (
                <div key={r.id} style={{ fontSize: 12 }}>
                  <span style={{ color: r.color }}>●</span>{' '}
                  <span style={{ opacity: .7 }}>{r.name || 'rival'}</span>{' '}
                  <span style={{ color: d >= 0 ? '#41d6ff' : '#ff8080', fontWeight: 700 }}>
                    {d >= 0 ? '+' : ''}{d}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ opacity: .45, marginTop: 4 }}>A/D or arrows — that is the whole control scheme</div>
      </div>

      {final && (
        <div style={{
          ...mono, position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,15,.88)', gap: 10,
        }}>
          <div style={{ fontSize: 13, letterSpacing: '.24em', opacity: .55 }}>RUN COMPLETE</div>
          <div style={{ fontSize: 60, fontWeight: 800, color: '#ffd76a' }}>
            {final.tokens}<span style={{ fontSize: 20, opacity: .55, color: '#dfe6ee' }}> / {final.tokensSeen}</span>
          </div>
          <div style={{ opacity: .55, marginTop: -6, letterSpacing: '.2em', fontSize: 12 }}>TOKENS</div>
          {/* The shape of the run. Money is the sum of these three; the bands
              exist so you can see WHERE a race was won, and so the published
              tiebreak (tokens at 60s) is something you can check rather than
              something you are told. */}
          <div style={{ display: 'flex', gap: 2, marginTop: 14, width: 280 }}>
            {([['0-25s', 0], ['25-60s', 1], ['60-90s', 2]] as [string, number][]).map(([label, i]) => {
              const v = final.bands[i];
              const share = final.tokens ? v / final.tokens : 0;
              return (
                <div key={label} style={{ flex: Math.max(0.6, share * 3), textAlign: 'center' }}>
                  <div style={{
                    height: 4, borderRadius: 2, marginBottom: 6,
                    background: ['#41d6ff', '#ffd76a', '#ff9a3c'][i], opacity: .85,
                  }} />
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{v}</div>
                  <div style={{ fontSize: 9, opacity: .4, letterSpacing: '.08em' }}>{label}</div>
                </div>
              );
            })}
          </div>

          {/* The thermostat made visible. Speed is deliberately not a number
              during the run, but afterwards the whole point is seeing where
              your own limit actually sat. */}
          <div style={{
            display: 'flex', gap: 26, marginTop: 14, justifyContent: 'center',
            fontFamily: 'ui-monospace, monospace',
          }}>
            {[
              ['best streak', String(final.bestStreak)],
              ['contacts', String(final.crashes)],
              ['clean run', `${final.bestCleanS.toFixed(1)}s`],
            ].map(([label, value]) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
                <div style={{ fontSize: 10, opacity: .45, letterSpacing: '.12em', textTransform: 'uppercase' }}>{label}</div>
              </div>
            ))}
          </div>
          {/* Display only — none of this pays. The money score is the raw
              token count; these describe HOW it was earned so a run is worth
              reading back rather than just a number. All derived from the
              trace, so the server reproduces the same figures. */}
          <div style={{
            display: 'flex', gap: 22, marginTop: 16, justifyContent: 'center',
            fontFamily: 'ui-monospace, monospace', opacity: .9,
          }}>
            {[
              ['line', `${(final.safeTook / Math.max(1, final.safeSeen) * 100).toFixed(0)}%`,
               'of the holdable line you took'],
              ['greed', `${(final.greedTook / Math.max(1, final.greedSeen) * 100).toFixed(0)}%`,
               'squeezed from dead-end trails'],
              ['ceiling', String(ceilingTokens(final).took),
               `taken above ${ceilingTokens(final).threshold} u/s`],
            ].map(([label, value, title]) => (
              <div key={label} title={title} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#41d6ff' }}>{value}</div>
                <div style={{ fontSize: 9, opacity: .45, letterSpacing: '.12em', textTransform: 'uppercase' }}>{label}</div>
              </div>
            ))}
          </div>

          {estimateReaction(final) !== null && (
            <div style={{ marginTop: 12, fontSize: 13, opacity: .8 }}>
              you played at a{' '}
              <span style={{ color: '#41d6ff', fontWeight: 700 }}>
                {(estimateReaction(final)! * 1000).toFixed(0)}ms
              </span>{' '}
              reaction
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 11, opacity: .35 }}>{final.z.toFixed(0)}u covered</div>

          {/* The seed is the level, so the only comparison that means anything
              is against your own runs on THIS course. */}
          {/* Three things to chase on the same course, so a run that scored
              less can still have improved something worth coming back for. */}
          {beaten && (beaten.tokens || beaten.closing || beaten.greed) && (
            <div style={{ marginTop: 10, color: '#ffd76a', fontWeight: 700, fontSize: 12, letterSpacing: '.06em' }}>
              {[
                beaten.tokens && 'NEW BEST',
                beaten.closing && 'BEST CLOSE',
                beaten.greed && 'BEST GREED',
              ].filter(Boolean).join('  ·  ')}
            </div>
          )}
          {!beatPB && pb && (
            <div style={{ marginTop: 10, fontSize: 12, opacity: .6 }}>
              best on this course: {pb.tokens}
              <span style={{ color: final.tokens >= pb.tokens ? '#41d6ff' : '#ff8080', marginLeft: 8 }}>
                {final.tokens - pb.tokens >= 0 ? '+' : ''}{final.tokens - pb.tokens}
              </span>
            </div>
          )}
          {rejected && (
            <div style={{ marginTop: 10, maxWidth: 420, textAlign: 'center', color: '#ff8080', fontSize: 12 }}>
              This run was not accepted: {rejected}
            </div>
          )}
          {!solo && !rejected && (
            <div style={{ marginTop: 8, opacity: .55, fontSize: 12 }}>Waiting for the other players…</div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={() => {
              stateRef.current = initialState(); zRef.current = 0;
              traceRef.current = [];
              setFinal(null); setBeatPB(false); setBeaten(null); setRunId(n => n + 1);
            }}
              style={{ ...mono, padding: '10px 22px', background: '#41d6ff', color: '#08080c', border: 0, borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
              {pb ? 'Same course — beat ' + pb.tokens : 'Same course'}
            </button>
            {onExit && (
              <button onClick={onExit}
                style={{ ...mono, padding: '10px 22px', background: 'transparent', color: '#8b93a0', border: '1px solid #33333d', borderRadius: 8, cursor: 'pointer' }}>
                Exit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
