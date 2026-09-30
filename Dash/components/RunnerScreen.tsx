/**
 * Grey-box runner. Deliberately ugly: plain boxes, no palette, no effects.
 *
 * The point of this build is to find out whether the thing is any fun before
 * anyone spends time making it look like the key art. Everything visual here is
 * expected to be thrown away; everything in engine/ is not.
 */
import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Vector3, Color } from 'three';
import type { Socket } from 'socket.io-client';

import {
  generateRun, laneX, trackCenter, RunCourse,
  LANES, LANE_W, RESET_SPEED, RACE_MS,
} from '../engine/RunnerCourse';
import {
  initialState, step, playerX, RunnerState, RunnerInput, FIXED_DT, estimateReaction,
} from '../engine/RunnerPhysics';

const VIEW_AHEAD  = 130;
const VIEW_BEHIND = 25;

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

// ── Hazards and shards, windowed around the player ────────────────────────────

function Hazards({ course, zRef }: { course: RunCourse; zRef: React.MutableRefObject<number> }) {
  // Re-render only when the visible window actually moves on, not every frame:
  // rebuilding this subtree at 60Hz drops the framerate far enough to change
  // how the game feels, which would defeat the point of a playtest build.
  const BUCKET = 20;
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
          {r.blocked.map(l => (
            <mesh key={l} position={[laneX(course, l, r.z), 1, r.z]} castShadow>
              <boxGeometry args={[LANE_W * 0.92, 2, 0.7]} />
              <meshStandardMaterial color="#c0392b" emissive={new Color('#c0392b')} emissiveIntensity={0.4} />
            </mesh>
          ))}
        </group>
      ))}
      {tokens.map((t: {z:number;lane:number}) => (
        <mesh key={`${t.z}-${t.lane}`} position={[laneX(course, t.lane, t.z), 0.8, t.z]}>
          <octahedronGeometry args={[0.5]} />
          <meshStandardMaterial color="#ffd76a" emissive={new Color('#ffd76a')} emissiveIntensity={1.1} />
        </mesh>
      ))}
    </>
  );
}

// ── Opponents ─────────────────────────────────────────────────────────────────

export interface Ghost { id: string; z: number; lane: number; name: string; color: string; }

/**
 * Other players, drawn from the relayed progress stream.
 *
 * Reports land every 60 steps — half a second, about 17 units at racing speed —
 * so the raw positions jump. Each ghost lerps toward its latest report instead
 * of snapping to it. They are deliberately translucent and unlit: they are
 * information about the race, not obstacles, and nothing about them can touch
 * the local simulation.
 */
function Ghosts({ course, ghostsRef }: {
  course: RunCourse;
  ghostsRef: React.MutableRefObject<Map<string, Ghost>>;
}) {
  const group = useRef<any>(null);
  const shown = useRef<Map<string, any>>(new Map());
  const [, force] = useState(0);
  const ids = useRef<string[]>([]);

  useFrame((_, dt) => {
    const live = [...ghostsRef.current.keys()];
    if (live.length !== ids.current.length) { ids.current = live; force(n => n + 1); }
    if (!group.current) return;
    group.current.children.forEach((m: any) => {
      const g = ghostsRef.current.get(m.userData.id);
      if (!g) return;
      const targetX = laneX(course, 0, g.z) + g.lane * LANE_W;
      const k = Math.min(1, dt * 6);
      m.position.x += (targetX - m.position.x) * k;
      m.position.z += (g.z - m.position.z) * k;
      m.position.y = 0.5;
    });
  });

  return (
    <group ref={group}>
      {ids.current.map(id => {
        const g = ghostsRef.current.get(id);
        if (!g) return null;
        return (
          <mesh key={id} userData={{ id }} position={[0, 0.5, 0]}>
            <sphereGeometry args={[0.5, 14, 12]} />
            <meshStandardMaterial
              color={g.color} emissive={new Color(g.color)} emissiveIntensity={0.7}
              transparent opacity={0.45} depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ── Simulation loop ───────────────────────────────────────────────────────────

interface LoopProps {
  course: RunCourse;
  stateRef: React.MutableRefObject<RunnerState>;
  inputRef: React.MutableRefObject<{ left: boolean; right: boolean }>;
  zRef: React.MutableRefObject<number>;
  onEnd: (s: RunnerState) => void;
  onHud: (s: RunnerState) => void;
  socket: Socket | null;
}

/**
 * How often a position report goes to the server, in fixed steps. 60 steps is
 * half a second, giving ~180 reports over a race against the 24 the server
 * requires — enough headroom that a few dropped packets cannot fail an honest
 * run, while still leaving the whole race visible in the stream.
 */
const REPORT_EVERY_STEPS = 60;

function Loop({ course, stateRef, inputRef, zRef, onEnd, onHud, socket }: LoopProps) {
  const { camera } = useThree();
  const acc = useRef(0);
  const prevLeft = useRef(false);
  const prevRight = useRef(false);
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
    acc.current += Math.min(delta, 0.25);
    while (acc.current >= FIXED_DT && !s.finished) {
      const i = inputRef.current;
      // Steering is edge-triggered: holding left must not walk across lanes.
      let steer: -1 | 0 | 1 = 0;
      if (i.left && !prevLeft.current) steer = STEER_SCREEN_LEFT;
      else if (i.right && !prevRight.current) steer = -STEER_SCREEN_LEFT as -1 | 1;
      prevLeft.current = i.left;
      prevRight.current = i.right;

      if (!started.current) { started.current = true; socket?.emit('parity:start'); }
      if (steer !== 0) trace.current.push([stepNo.current, steer]);

      const input: RunnerInput = { steer };
      step(course, s, input);

      if (socket && stepNo.current % REPORT_EVERY_STEPS === 0) {
        socket.emit('parity:progress', {
          step: stepNo.current, z: s.z, tokens: s.tokens, lane: s.lanePos,
        });
      }

      stepNo.current++;
      acc.current -= FIXED_DT;
    }

    zRef.current = s.z;

    const px = playerX(course, s);
    camera.position.lerp(new Vector3(px * 0.6 + trackCenter(course, s.z) * 0.4, 5.2, s.z - 9), 0.12);
    camera.lookAt(trackCenter(course, s.z + 20), 0.8, s.z + 20);

    hudAcc.current += delta;
    if (hudAcc.current > 0.08) { hudAcc.current = 0; onHud(s); }

    if (s.finished && !done.current) {
      done.current = true;
      socket?.emit('parity:finish', { tokens: s.tokens, trace: trace.current });
      onEnd(s);
    }
  });
  return null;
}

function Player({ course, stateRef }: { course: RunCourse; stateRef: React.MutableRefObject<RunnerState> }) {
  const ref = useRef<any>(null);
  useFrame(() => {
    const s = stateRef.current;
    if (!ref.current) return;
    ref.current.position.set(playerX(course, s), 0.5, s.z);
    const m = ref.current.material;
    // Brightness tracks charge, so how well the run is going is readable off
    // the ball itself rather than off a meter.
    const hot = Math.min(1, Math.max(0, (s.speed - RESET_SPEED) / 18));
    m.emissiveIntensity = s.immuneS > 0 ? 2.4 : 0.5 + hot * 1.6;
    m.color.set(s.immuneS > 0 ? '#ff3b30' : '#41d6ff');
    m.emissive.set(s.immuneS > 0 ? '#ff3b30' : '#41d6ff');
  });
  return (
    <mesh ref={ref} castShadow>
      <sphereGeometry args={[0.55, 20, 16]} />
      <meshStandardMaterial color="#41d6ff" emissive={new Color('#41d6ff')} emissiveIntensity={0.8} roughness={0.25} />
    </mesh>
  );
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
  const inputRef = useRef({ left: false, right: false });

  const [hud, setHud] = useState({ z: 0, t: 0, clean: 0, tokens: 0, seen: 0, crashes: 0, speed: RESET_SPEED });
  const [final, setFinal] = useState<RunnerState | null>(null);
  // Remounts the loop on restart; without it the loop's `done` latch stays set
  // and a second run never advances.
  const [runId, setRunId] = useState(0);
  const [rejected, setRejected] = useState<string | null>(null);
  const ghostsRef = useRef<Map<string, Ghost>>(new Map());

  /**
   * The server ranks the room and sends the verdict. A rejected run comes back
   * with myTokens null rather than a score, because a run that failed
   * validation did not happen as far as the result is concerned.
   */
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
    const onPos = (g: Ghost) => {
      const prev = ghostsRef.current.get(g.id);
      ghostsRef.current.set(g.id, { ...g, name: g.name || prev?.name || '' });
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
      if (e.code === 'KeyA' || e.code === 'ArrowLeft')  inputRef.current.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') inputRef.current.right = true;
      if (e.code === 'Space') e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft')  inputRef.current.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') inputRef.current.right = false;

    };
    const blur = () => { inputRef.current = { left: false, right: false }; };
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
        <Track course={course} zRef={zRef} />
        <Hazards course={course} zRef={zRef} />
        <Player course={course} stateRef={stateRef} />
        <Ghosts course={course} ghostsRef={ghostsRef} />
        <Loop
          key={runId}
          course={course} stateRef={stateRef} inputRef={inputRef} zRef={zRef}
          socket={socket}
          onEnd={setFinal}
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
              setFinal(null); setRunId(n => n + 1);
            }}
              style={{ ...mono, padding: '10px 22px', background: '#41d6ff', color: '#08080c', border: 0, borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
              Again
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
