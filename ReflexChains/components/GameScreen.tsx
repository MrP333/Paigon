import { useEffect, useRef, useState, useMemo, useCallback, type MouseEvent } from 'react';
import { Socket } from 'socket.io-client';
import { GameConfig, ResultData, Target, HitRecord, CanvasEffect } from '../types';

// ── Constants ────────────────────────────────────────────────────────────────
const CW               = 900;
const CH               = 540;
const NUM_TARGETS      = 150;
const GAME_DURATION_MS = 30000;
const TARGET_R         = 32;
const CHARGE_MS        = 100;
const START_RING_MS    = 1500; // slow at game start
const END_RING_MS      = 800;  // fast by game end
const SLOT_COUNT       = 2;
const DECOY_RATE       = 0.15;
const HIT_TOLERANCE    = TARGET_R + 16;
const GHOST_DUR        = 1800;

// ── Multiplier ────────────────────────────────────────────────────────────────
function getMultiplier(consecutive: number): number {
  if (consecutive >= 8) return 3;
  if (consecutive >= 5) return 2;
  if (consecutive >= 3) return 1.5;
  return 1;
}

function multiplierColor(mult: number): string {
  if (mult >= 3)   return '#ffd700';
  if (mult >= 2)   return '#a855f7';
  if (mult >= 1.5) return '#22d3ee';
  return 'rgba(255,255,255,0.22)';
}

function calcPoints(reactionAfterCharge: number, ringMs: number): number {
  return Math.round(10 + 90 * Math.max(0, 1 - reactionAfterCharge / ringMs));
}

const NEON_COLORS = ['#22d3ee', '#a855f7', '#ec4899', '#10b981'];
function getTargetColor(index: number): string {
  return NEON_COLORS[index % NEON_COLORS.length];
}

function streakColor(streak: number): string {
  if (streak >= 8) return '#ffd700';
  if (streak >= 5) return '#a855f7';
  if (streak >= 3) return '#22d3ee';
  return '#00ff88';
}

// ── Internal types ────────────────────────────────────────────────────────────
interface Floater  { x: number; y: number; startTime: number; color: string; pts: number; mult: number; }
interface Ghost    { x: number; y: number; color: string; startTime: number; }
interface Particle { x: number; y: number; vx: number; vy: number; r: number; color: string; phase: number; }

interface ActiveSlot {
  poolIdx:       number;
  appearTime:    number;
  timeoutId:     ReturnType<typeof setTimeout>;
  displayNumber: number; // sequential index for real targets; 0 for decoys
  ringMs:        number; // ring close duration, computed from game progress at spawn time
}

function initParticles(): Particle[] {
  const colors = ['#22d3ee', '#a855f7', '#ec4899', '#10b981'];
  return Array.from({ length: 26 }, () => ({
    x: Math.random() * CW, y: Math.random() * CH,
    vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
    r: 0.8 + Math.random() * 1.4,
    color: colors[Math.floor(Math.random() * colors.length)],
    phase: Math.random() * Math.PI * 2,
  }));
}

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function spawnScale(elapsed: number): number {
  const SPAWN_MS = 150;
  if (elapsed >= SPAWN_MS) return 1;
  const t = elapsed / SPAWN_MS;
  return t < 0.6 ? (t / 0.6) * 1.12 : 1.12 - 0.12 * (t - 0.6) / 0.4;
}

// ── Target pool generation ────────────────────────────────────────────────────
function generateTargets(roomCode: string): Target[] {
  const rng = mulberry32(hashCode(roomCode));
  const PAD = 80;
  const targets: Target[] = [];
  for (let i = 0; i < NUM_TARGETS; i++) {
    let x = 0, y = 0, tries = 0;
    do {
      x = PAD + rng() * (CW - PAD * 2);
      y = PAD + rng() * (CH - PAD * 2);
      tries++;
    } while (tries < 60 && targets.some(t => Math.hypot(t.x - x, t.y - y) < 120));
    rng(); // consumed to keep isDecoy seed position stable
    const isDecoy = rng() < DECOY_RATE;
    targets.push({ x, y, index: i, ringMs: 0, isDecoy }); // ringMs set per-slot at spawn time
  }
  return targets;
}

// ── Background ────────────────────────────────────────────────────────────────
function drawBackground(ctx: CanvasRenderingContext2D, timeLeft: number, hitCount: number, timerProgress: number) {
  const pulse        = 0.5 + 0.5 * Math.sin(Date.now() * 0.0015);
  const redUrgency   = Math.min(1, Math.max(0, (20 - timeLeft) / 20));
  const urgencyPulse = 0.5 + 0.5 * Math.sin(Date.now() * (0.0015 + redUrgency * 0.009));

  ctx.fillStyle = '#03030a';
  ctx.fillRect(0, 0, CW, CH);

  if (timerProgress > 0) {
    ctx.save(); ctx.globalAlpha = timerProgress * 0.22;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CW, CH); ctx.restore();
  }

  const glowIntensity = Math.min(0.03 + hitCount * 0.002, 0.14) + 0.03 * pulse;
  const centerR = Math.round(34 + 205 * redUrgency);
  const centerG = Math.round(211 * (1 - redUrgency * 0.85));
  const centerB = Math.round(238 * (1 - redUrgency));
  const grad = ctx.createRadialGradient(CW / 2, CH / 2, 0, CW / 2, CH / 2, CW * 0.55);
  grad.addColorStop(0, `rgba(${centerR},${centerG},${centerB},${glowIntensity})`);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, CW, CH);

  const waveT = Date.now() * 0.0006;
  for (let gx = 36; gx < CW; gx += 36) {
    for (let gy = 36; gy < CH; gy += 36) {
      const wave = 0.5 + 0.5 * Math.sin(waveT + gx * 0.016 + gy * 0.011);
      const a    = redUrgency > 0.15
        ? (0.07 + redUrgency * 0.14 + wave * 0.07)
        : (0.09 + wave * 0.09);
      ctx.globalAlpha = a;
      ctx.fillStyle   = redUrgency > 0.15 ? '#ef4444' : '#22d3ee';
      ctx.beginPath(); ctx.arc(gx, gy, 1.15, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  if (redUrgency > 0) {
    const vigAlpha = redUrgency * (0.07 + 0.15 * urgencyPulse);
    const vgrad = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.22, CW / 2, CH / 2, CW * 0.72);
    vgrad.addColorStop(0, 'transparent');
    vgrad.addColorStop(1, `rgba(239,68,68,${vigAlpha})`);
    ctx.fillStyle = vgrad; ctx.fillRect(0, 0, CW, CH);
  }
}

// ── Target slot drawing ───────────────────────────────────────────────────────
function drawTarget(
  ctx:          CanvasRenderingContext2D,
  t:            Target,
  elapsed:      number,
  streak:       number,
  color:        string,
  hitNumber:    number,
  isDecoy:      boolean,
  ringMs:       number,
) {
  const { x, y } = t;
  const TOTAL          = CHARGE_MS + ringMs;
  const approachProg   = Math.min(elapsed / TOTAL, 1);
  const easedProg      = approachProg * approachProg;
  const approachR      = TARGET_R + (TARGET_R * 2.8) * (1 - easedProg);
  const chargeProgress = Math.min(elapsed / CHARGE_MS, 1);
  const isClickable    = elapsed >= CHARGE_MS;
  const isDanger       = approachProg > 0.72;
  const pulse          = 0.5 + 0.5 * Math.sin(Date.now() * 0.004 + x * 0.01);
  const glowBoost      = isDecoy ? 0 : Math.min(streak * 0.018, 0.14);
  const activeColor    = (!isDecoy && isClickable && streak >= 3) ? streakColor(streak) : color;
  const ringColor      = isDanger ? '#ff6b6b' : activeColor;

  // Echo ring
  const echoEased = Math.max(0, approachProg - 0.1) ** 2;
  const echoR     = TARGET_R + (TARGET_R * 2.8) * (1 - echoEased);
  ctx.save();
  ctx.globalAlpha = 0.18 + 0.14 * approachProg;
  ctx.beginPath(); ctx.arc(x, y, echoR, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();

  // Approach ring
  ctx.save();
  ctx.globalAlpha = 0.55 + 0.35 * approachProg;
  ctx.beginPath(); ctx.arc(x, y, approachR, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor; ctx.lineWidth = isDanger ? 2.8 : 2.2; ctx.stroke();
  ctx.restore();

  // Spawn scale bounce
  const ss = spawnScale(elapsed);
  ctx.save(); ctx.translate(x, y); ctx.scale(ss, ss); ctx.translate(-x, -y);

  // Glow layers
  for (const [r, a] of [
    [TARGET_R * 3.0, 0.05 + 0.04 * pulse + glowBoost],
    [TARGET_R * 1.9, 0.11 + 0.06 * pulse + glowBoost],
  ] as [number, number][]) {
    ctx.save(); ctx.globalAlpha = chargeProgress * a;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = activeColor; ctx.fill(); ctx.restore();
  }

  // Circle body
  ctx.save(); ctx.globalAlpha = chargeProgress;
  ctx.beginPath(); ctx.arc(x, y, TARGET_R, 0, Math.PI * 2);
  ctx.fillStyle   = isClickable ? `${activeColor}22` : `${activeColor}10`;
  ctx.fill();
  ctx.strokeStyle = isClickable ? activeColor : `${activeColor}55`;
  ctx.lineWidth   = isClickable ? 2.5 : 2;
  ctx.stroke(); ctx.restore();

  // Number — real targets only (missing number is the decoy tell)
  if (!isDecoy) {
    ctx.save();
    ctx.globalAlpha   = chargeProgress * (isClickable ? 1 : 0.55);
    ctx.fillStyle     = isClickable ? '#ffffff' : 'rgba(255,255,255,0.5)';
    ctx.font          = `800 ${hitNumber >= 100 ? 11 : hitNumber >= 10 ? 13 : 15}px ui-monospace, monospace`;
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.shadowColor   = activeColor;
    ctx.shadowBlur    = isClickable ? 8 : 0;
    ctx.fillText(String(hitNumber), x, y);
    ctx.restore();
  }

  ctx.restore(); // restore spawn scale
}

// ── Hit / miss / decoy effects ────────────────────────────────────────────────
function drawEffect(ctx: CanvasRenderingContext2D, fx: CanvasEffect, now: number) {
  const age   = now - fx.startTime;
  const color = (fx as any).color ?? '#00ff88';

  if (fx.type === 'hit') {
    const dur = 850;
    if (age > dur) return;
    const t = age / dur;
    const rings: [number, number, number, number][] = [
      [TARGET_R,  TARGET_R * 5.2, 0,    1.0],
      [8,         TARGET_R * 3.6, 0.04, 0.75],
      [3,         TARGET_R * 2.2, 0.09, 0.50],
    ];
    for (const [sr, er, delay, alpha] of rings) {
      const rt = Math.max(0, t - delay) / (1 - delay);
      if (rt <= 0) continue;
      const ease = 1 - Math.pow(1 - rt, 3);
      ctx.save(); ctx.globalAlpha = alpha * (1 - rt);
      ctx.beginPath(); ctx.arc(fx.x, fx.y, sr + (er - sr) * ease, 0, Math.PI * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = 0.30 * (1 - t);
    ctx.beginPath(); ctx.arc(fx.x, fx.y, TARGET_R * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill(); ctx.restore();
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist  = TARGET_R * 1.4 + TARGET_R * 4.2 * (1 - Math.pow(1 - t, 2));
      ctx.save(); ctx.globalAlpha = 0.85 * (1 - t);
      ctx.beginPath(); ctx.arc(
        fx.x + Math.cos(angle) * dist, fx.y + Math.sin(angle) * dist,
        Math.max(0.5, 3.2 - t * 2.8), 0, Math.PI * 2,
      );
      ctx.fillStyle = color; ctx.fill(); ctx.restore();
    }
  } else if (fx.type === 'decoy') {
    const dur = 480;
    if (age > dur) return;
    const t    = age / dur;
    const ease = 1 - Math.pow(1 - t, 3);
    ctx.save(); ctx.globalAlpha = 0.9 * (1 - t);
    ctx.beginPath(); ctx.arc(fx.x, fx.y, TARGET_R + (TARGET_R * 2.5 - TARGET_R) * ease, 0, Math.PI * 2);
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    // X mark burst
    ctx.save(); ctx.globalAlpha = (1 - t) * 0.8;
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    const s = 10 * (1 - t * 0.4);
    ctx.beginPath();
    ctx.moveTo(fx.x - s, fx.y - s); ctx.lineTo(fx.x + s, fx.y + s);
    ctx.moveTo(fx.x + s, fx.y - s); ctx.lineTo(fx.x - s, fx.y + s);
    ctx.stroke(); ctx.restore();
  } else {
    const dur = 300;
    if (age > dur) return;
    const t = age / dur;
    ctx.save(); ctx.globalAlpha = (1 - t) * 0.7;
    ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const s = 10 * (1 - t);
    ctx.beginPath();
    ctx.moveTo(fx.x - s, fx.y - s); ctx.lineTo(fx.x + s, fx.y + s);
    ctx.moveTo(fx.x + s, fx.y - s); ctx.lineTo(fx.x - s, fx.y + s);
    ctx.stroke(); ctx.restore();
  }
}

function drawFloaters(ctx: CanvasRenderingContext2D, floaters: Floater[], now: number) {
  const dur = 700;
  for (const f of floaters) {
    const age = now - f.startTime;
    if (age > dur) continue;
    const t    = age / dur;
    const ease = 1 - Math.pow(1 - t, 2);
    ctx.save();
    ctx.globalAlpha  = (1 - t) * 0.95;
    ctx.fillStyle    = f.color;
    ctx.font         = `bold ${Math.round(15 - t * 3)}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = f.color;
    ctx.shadowBlur   = 8;
    const label = f.mult > 1 ? `+${f.pts} ×${f.mult}` : `+${f.pts}`;
    ctx.fillText(label, f.x, f.y - 52 * ease);
    ctx.restore();
  }
}

function drawFlash(ctx: CanvasRenderingContext2D, flash: { startTime: number; color: string; alpha?: number; duration?: number } | null, now: number) {
  if (!flash) return;
  const dur      = flash.duration ?? 160;
  const maxAlpha = flash.alpha ?? 0.13;
  const age      = now - flash.startTime;
  if (age > dur) return;
  const t = age / dur;
  ctx.save(); ctx.globalAlpha = maxAlpha * (1 - t);
  ctx.fillStyle = flash.color; ctx.fillRect(0, 0, CW, CH); ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  config:   GameConfig;
  socket:   Socket;
  onResult: (r: ResultData) => void;
}

export default function GameScreen({ config, socket, onResult }: Props) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const [countdown,     setCountdown]     = useState(3);
  const [phase,         setPhase]         = useState<'countdown' | 'playing' | 'waiting' | 'done'>('countdown');
  const [opponentHits,  setOpponentHits]  = useState(0);
  const [timeLeft,      setTimeLeft]      = useState(GAME_DURATION_MS / 1000);
  const [hitDisplay,    setHitDisplay]    = useState(0);
  const [scoreDisplay,  setScoreDisplay]  = useState(0);
  const [streak,        setStreak]        = useState(0);
  const [multiplier,    setMultiplier]    = useState(1);
  const [chainBroken,   setChainBroken]   = useState(0); // timestamp of last chain break

  const phaseRef           = useRef<string>('countdown');
  const startTimeRef       = useRef(0);
  const scoreRef           = useRef(0);
  const effectsRef         = useRef<CanvasEffect[]>([]);
  const hitsRef            = useRef<HitRecord[]>([]);
  const hitCountRef        = useRef(0);
  const myFinalTimeRef     = useRef(0);
  const myFinalScoreRef    = useRef(0);
  const gameEndRef         = useRef(false);
  const streakRef          = useRef(0);         // consecutive hits
  const multiplierRef      = useRef(1);
  const floatersRef        = useRef<Floater[]>([]);
  const flashRef           = useRef<{ startTime: number; color: string; alpha?: number; duration?: number } | null>(null);
  const ghostsRef          = useRef<Ghost[]>([]);
  const particlesRef       = useRef<Particle[]>(initParticles());
  const timeLeftRef        = useRef(GAME_DURATION_MS / 1000);

  // ── Slot management ───────────────────────────────────────────────────────
  const activeSlotsRef     = useRef<ActiveSlot[]>([]);
  const poolIdxRef         = useRef(0);         // next index from the 150-target pool
  const realSlotCounterRef = useRef(0);         // sequential number for real targets

  const targets = useMemo(() => generateTargets(config.roomCode), [config.roomCode]);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  function triggerShake() {
    const el = canvasWrapRef.current;
    if (!el) return;
    el.style.animation = 'none';
    el.getBoundingClientRect();
    el.style.animation = 'reflex-shake 0.32s ease-out';
  }

  // ── Slot timeout handler (via ref so timeouts always call the latest version)
  const handleSlotTimeoutRef = useRef<(poolIdx: number) => void>(() => {});
  handleSlotTimeoutRef.current = (poolIdx: number) => {
    if (phaseRef.current !== 'playing') return;
    const slots = activeSlotsRef.current;
    const idx   = slots.findIndex(s => s.poolIdx === poolIdx);
    if (idx === -1) return;
    slots.splice(idx, 1);
    const t = targets[poolIdx];
    effectsRef.current.push({ x: t.x, y: t.y, type: 'miss', startTime: Date.now() });

    // Only penalize streak/multiplier for real targets timing out
    if (!t.isDecoy) {
      const prevStreak = streakRef.current;
      streakRef.current = 0;
      setStreak(0);
      multiplierRef.current = 1;
      setMultiplier(1);
      if (prevStreak >= 3) {
        setChainBroken(Date.now());
        flashRef.current = { startTime: Date.now(), color: '#ef4444', alpha: 0.18, duration: 250 };
        triggerShake();
      } else {
        flashRef.current = { startTime: Date.now(), color: '#ef4444', alpha: 0.1, duration: 160 };
      }
    }
    addNextSlot(Date.now());
  };

  function createSlot(poolIdx: number, now: number): ActiveSlot {
    const t             = targets[poolIdx];
    const displayNumber = t.isDecoy ? 0 : ++realSlotCounterRef.current;
    // Ring speed ramps up linearly from START_RING_MS → END_RING_MS over the 30s game
    const gameProgress  = startTimeRef.current > 0
      ? Math.min(1, (now - startTimeRef.current) / GAME_DURATION_MS)
      : 0;
    const ringMs        = Math.round(START_RING_MS - (START_RING_MS - END_RING_MS) * gameProgress);
    const timeoutId     = setTimeout(
      () => handleSlotTimeoutRef.current(poolIdx),
      CHARGE_MS + ringMs,
    );
    return { poolIdx, appearTime: now, timeoutId, displayNumber, ringMs };
  }

  function addNextSlot(now: number) {
    if (gameEndRef.current) return;
    const next = poolIdxRef.current;
    if (next >= NUM_TARGETS) return;
    poolIdxRef.current++;
    activeSlotsRef.current.push(createSlot(next, now));
  }

  // ── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let n = 3;
    const id = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(id);
        setCountdown(0);
        const now = Date.now();
        startTimeRef.current = now;
        // Fill initial slots
        poolIdxRef.current = 0;
        realSlotCounterRef.current = 0;
        activeSlotsRef.current = [];
        for (let i = 0; i < SLOT_COUNT && i < NUM_TARGETS; i++) {
          poolIdxRef.current = i + 1;
          activeSlotsRef.current.push(createSlot(i, now));
        }
        poolIdxRef.current = SLOT_COUNT;
        setPhase('playing');
        phaseRef.current = 'playing';
      } else {
        setCountdown(n);
      }
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Game clock (50 ms tick) ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => {
      const wall   = Date.now() - startTimeRef.current;
      const left   = Math.max(0, GAME_DURATION_MS - wall);
      const leftSecs = left / 1000;
      setTimeLeft(leftSecs);
      timeLeftRef.current  = leftSecs;
      setHitDisplay(hitCountRef.current);
      setScoreDisplay(scoreRef.current);
      if (left <= 0) endGame();
    }, 50);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (config.solo) return;
    socket.on('reflex:opponent-hit', ({ targetIndex }: { targetIndex: number }) => {
      setOpponentHits(h => h + 1);
      void targetIndex;
    });
    socket.on('reflex:result', (data: any) => {
      phaseRef.current = 'done'; setPhase('done');
      onResult({
        won:            data.winnerId === socket.id,
        myTimeMs:       myFinalTimeRef.current,
        myScore:        data.myScore        ?? myFinalScoreRef.current,
        myHits:         data.myHits         ?? hitCountRef.current,
        opponentTimeMs: data.opponentTimeMs ?? null,
        opponentScore:  data.opponentScore  ?? null,
        opponentHits:   data.opponentHits   ?? null,
        winnerName:     data.winnerName,
        players:        data.players        ?? undefined,
      });
    });
    return () => { socket.off('reflex:opponent-hit'); socket.off('reflex:result'); };
  }, [socket, onResult, config.solo]);

  // ── End game ──────────────────────────────────────────────────────────────
  function endGame() {
    if (gameEndRef.current || phaseRef.current === 'done' || phaseRef.current === 'waiting') return;
    gameEndRef.current = true;
    // Cancel all active slot timeouts
    for (const s of activeSlotsRef.current) clearTimeout(s.timeoutId);
    activeSlotsRef.current = [];

    const score = scoreRef.current;
    myFinalScoreRef.current  = score;
    myFinalTimeRef.current   = GAME_DURATION_MS;
    if (config.solo) {
      phaseRef.current = 'done'; setPhase('done');
      onResult({ won: true, myTimeMs: GAME_DURATION_MS, myScore: score, myHits: hitCountRef.current, opponentTimeMs: null, opponentScore: null, opponentHits: null, winnerName: config.playerName });
    } else {
      setPhase('waiting'); phaseRef.current = 'waiting';
      socket.emit('reflex:finish', { roomCode: config.roomCode, totalTimeMs: GAME_DURATION_MS, hits: hitsRef.current });
    }
  }

  // ── Click handler ─────────────────────────────────────────────────────────
  const handleClick = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== 'playing') return;
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const cx     = (e.clientX - rect.left) * (CW / rect.width);
    const cy     = (e.clientY - rect.top)  * (CH / rect.height);
    const now    = Date.now();

    // Find closest slot within hit tolerance
    let bestSlot: ActiveSlot | null = null;
    let bestDist = Infinity;
    for (const slot of activeSlotsRef.current) {
      const t    = targets[slot.poolIdx];
      const dist = Math.hypot(cx - t.x, cy - t.y);
      if (dist <= HIT_TOLERANCE && dist < bestDist) {
        bestDist = dist; bestSlot = slot;
      }
    }

    if (!bestSlot) {
      // Miss on empty canvas
      streakRef.current = 0; setStreak(0);
      multiplierRef.current = 1; setMultiplier(1);
      effectsRef.current.push({ x: cx, y: cy, type: 'miss', startTime: now });
      return;
    }

    const elapsed = now - bestSlot.appearTime;

    // Too early (still charging)
    if (elapsed < CHARGE_MS) {
      flashRef.current = { startTime: now, color: '#ef4444', alpha: 0.22, duration: 200 };
      triggerShake();
      return;
    }

    const t        = targets[bestSlot.poolIdx];
    const slotIdx  = activeSlotsRef.current.indexOf(bestSlot);
    if (slotIdx !== -1) activeSlotsRef.current.splice(slotIdx, 1);
    clearTimeout(bestSlot.timeoutId);

    if (t.isDecoy) {
      // Clicked a decoy — chain break
      const prevStreak = streakRef.current;
      streakRef.current = 0; setStreak(0);
      multiplierRef.current = 1; setMultiplier(1);
      if (prevStreak >= 3) setChainBroken(now);
      effectsRef.current.push({ x: t.x, y: t.y, type: 'decoy', startTime: now });
      flashRef.current = { startTime: now, color: '#ef4444', alpha: 0.22, duration: 200 };
      triggerShake();
      addNextSlot(now);
      return;
    }

    // Valid hit
    streakRef.current++;
    setStreak(streakRef.current);
    const mult = getMultiplier(streakRef.current);
    const prevMult = multiplierRef.current;
    multiplierRef.current = mult;
    if (mult !== prevMult) setMultiplier(mult);

    const rawPts = calcPoints(elapsed - CHARGE_MS, bestSlot.ringMs);
    const pts    = Math.round(rawPts * mult);
    hitCountRef.current++;
    scoreRef.current += pts;
    hitsRef.current.push({ targetIndex: bestSlot.poolIdx, reactionMs: elapsed });

    if (!config.solo) {
      socket.emit('reflex:hit', { roomCode: config.roomCode, targetIndex: bestSlot.poolIdx, reactionMs: elapsed });
    }

    const hitColor = getTargetColor(bestSlot.poolIdx);
    ghostsRef.current.push({ x: t.x, y: t.y, color: hitColor, startTime: now });
    if (ghostsRef.current.length > 12) ghostsRef.current.shift();

    const fx = { x: t.x, y: t.y, type: 'hit' as const, startTime: now };
    (fx as any).color = hitColor;
    effectsRef.current.push(fx);

    floatersRef.current.push({ x: t.x, y: t.y, startTime: now, color: hitColor, pts, mult });
    flashRef.current = { startTime: now, color: '#ffffff', alpha: 0.15, duration: 80 };
    addNextSlot(now);
  }, [targets, socket, config]);

  // ── Render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let frame: number;

    const draw = () => {
      const now          = Date.now();
      const timerProgress = 1 - timeLeftRef.current / (GAME_DURATION_MS / 1000);
      drawBackground(ctx, timeLeftRef.current, hitCountRef.current, timerProgress);

      // Ambient particles
      for (const p of particlesRef.current) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = CW + 10;
        if (p.x > CW + 10) p.x = -10;
        if (p.y < -10) p.y = CH + 10;
        if (p.y > CH + 10) p.y = -10;
        const pulse = 0.45 + 0.55 * Math.sin(now * 0.0018 + p.phase);
        ctx.save(); ctx.globalAlpha = 0.18 * pulse;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.fill(); ctx.restore();
      }

      // Ghost circles
      ghostsRef.current = ghostsRef.current.filter(g => now - g.startTime < GHOST_DUR);
      for (const g of ghostsRef.current) {
        const gt = (now - g.startTime) / GHOST_DUR;
        ctx.save(); ctx.globalAlpha = 0.35 * (1 - gt);
        ctx.beginPath(); ctx.arc(g.x, g.y, TARGET_R, 0, Math.PI * 2);
        ctx.strokeStyle = g.color; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      }

      // Active slots
      if (phaseRef.current === 'playing') {
        const snapshot = [...activeSlotsRef.current];
        for (const slot of snapshot) {
          const t       = targets[slot.poolIdx];
          const elapsed = now - slot.appearTime;
          drawTarget(
            ctx, t, elapsed,
            streakRef.current,
            getTargetColor(slot.poolIdx),
            slot.displayNumber,
            t.isDecoy,
            slot.ringMs,
          );
        }
      }

      drawFlash(ctx, flashRef.current, now);
      if (flashRef.current && now - flashRef.current.startTime > (flashRef.current.duration ?? 160)) {
        flashRef.current = null;
      }

      effectsRef.current = effectsRef.current.filter(fx => now - fx.startTime < 900);
      for (const fx of effectsRef.current) drawEffect(ctx, fx, now);

      floatersRef.current = floatersRef.current.filter(f => now - f.startTime < 700);
      drawFloaters(ctx, floatersRef.current, now);

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [targets]);

  // ── HUD values ────────────────────────────────────────────────────────────
  const timerDanger = timeLeft <= 5;
  const timerPct    = timeLeft / (GAME_DURATION_MS / 1000);
  const multColor   = multiplierColor(multiplier);
  const multLabel   = multiplier >= 3 ? '×3 GODLIKE' : multiplier >= 2 ? '×2 ON FIRE' : multiplier >= 1.5 ? '×1.5 CHAIN' : '×1';
  const streakLabel = streak >= 8 ? 'GODLIKE' : streak >= 5 ? 'ON FIRE' : streak >= 3 ? 'HOT' : null;
  const sColor      = streakColor(streak);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#03030a', userSelect: 'none' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 56,
        background: 'rgba(0,0,0,0.6)',
        borderBottom: `1px solid ${timerDanger ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.07)'}`,
        backdropFilter: 'blur(8px)', flexShrink: 0, transition: 'border-color 0.3s',
      }}>

        {/* Left: score + streak */}
        <div style={{ minWidth: 140, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{
              fontSize: '1.65rem', fontWeight: 900, letterSpacing: '-0.02em',
              color: streak >= 3 ? sColor : '#fff',
              fontVariantNumeric: 'tabular-nums',
              textShadow: streak >= 3 ? `0 0 20px ${sColor}88` : 'none',
              transition: 'color 0.2s, text-shadow 0.2s',
            }}>
              {scoreDisplay}
            </span>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>
              pts
            </span>
          </div>
          <span style={{
            fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: streakLabel ? sColor : 'rgba(255,255,255,0.22)',
            textShadow: streakLabel ? `0 0 8px ${sColor}` : 'none',
            transition: 'color 0.2s',
          }}>
            {streakLabel ? `${streak}× ${streakLabel}` : `${hitDisplay} hits`}
          </span>
        </div>

        {/* Center: timer + multiplier */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{
              fontSize: '2.1rem', fontWeight: 900, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
              color: timerDanger ? '#ef4444' : '#fff',
              textShadow: timerDanger ? '0 0 28px #ef444488' : 'none',
              transition: 'color 0.3s, text-shadow 0.3s',
            }}>
              {timeLeft.toFixed(1)}
            </span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em' }}>s</span>
          </div>
          {/* Multiplier badge */}
          <div key={multiplier} style={{
            fontSize: multiplier > 1 ? '0.78rem' : '0.62rem',
            fontWeight: 900,
            letterSpacing: multiplier > 1 ? '0.08em' : '0.05em',
            color: multColor,
            textShadow: multiplier > 1 ? `0 0 12px ${multColor}` : 'none',
            animation: multiplier > 1 ? 'multPop 0.35s ease-out' : 'none',
            transition: 'color 0.2s',
          }}>
            {multLabel}
          </div>
        </div>

        {/* Right: opponent */}
        <div style={{ minWidth: 140, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          {config.solo ? (
            <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.18)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Solo Practice
            </span>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{
                  fontSize: '1.65rem', fontWeight: 900, letterSpacing: '-0.02em',
                  color: config.opponentColor, fontVariantNumeric: 'tabular-nums',
                }}>
                  {opponentHits}
                </span>
                <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>
                  hits
                </span>
              </div>
              <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.22)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {config.opponentName}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Full-width timer bar ── */}
      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{
          height: '100%', width: `${timerPct * 100}%`,
          background: timerDanger ? '#ef4444' : '#22d3ee',
          boxShadow: timerDanger ? '0 0 8px #ef4444' : '0 0 8px rgba(34,211,238,0.6)',
          transition: 'background 0.3s, box-shadow 0.3s',
        }} />
      </div>

      {/* ── Canvas area ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03030a' }}>

        <div ref={canvasWrapRef} style={{ position: 'relative', lineHeight: 0, flexShrink: 0 }}>
          <canvas
            ref={canvasRef}
            width={CW} height={CH}
            style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', display: 'block', cursor: phase === 'playing' ? 'crosshair' : 'default' }}
            onClick={handleClick}
          />

          {/* Edge glow at high chain */}
          {multiplier >= 2 && (
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              boxShadow: multiplier >= 3
                ? 'inset 0 0 80px rgba(255,215,0,0.4)'
                : 'inset 0 0 80px rgba(168,85,247,0.35)',
            }} />
          )}

          {/* Chain broken overlay */}
          {chainBroken > 0 && (
            <div key={chainBroken} style={{
              position: 'absolute', top: 18, left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '1.3rem', fontWeight: 900, letterSpacing: '0.08em',
              color: '#ef4444',
              textShadow: '0 0 18px #ef4444, 0 0 36px rgba(239,68,68,0.5)',
              whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none',
              animation: 'chainBrokenIn 0.8s ease-out forwards',
            }}>
              CHAIN BROKEN
            </div>
          )}

          {/* CHAIN text overlay at high multiplier */}
          {multiplier >= 3 && (
            <div key={`chain-${streak}`} style={{
              position: 'absolute', bottom: 18, left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '1.5rem', fontWeight: 900, letterSpacing: '0.06em',
              color: '#ffd700',
              textShadow: '0 0 22px #ffd700, 0 0 44px rgba(255,215,0,0.5)',
              whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none',
              animation: 'reflex-chain-in 0.72s ease-out forwards',
            }}>
              ×3 GODLIKE
            </div>
          )}
        </div>

        {/* Countdown overlay */}
        {phase === 'countdown' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(3,3,10,0.75)', backdropFilter: 'blur(4px)',
          }}>
            <div style={{
              fontSize: countdown === 0 ? '5rem' : '7rem',
              fontWeight: 800, letterSpacing: '-0.04em',
              color: countdown === 0 ? '#00ff88' : '#22d3ee',
              textShadow: `0 0 60px ${countdown === 0 ? '#00ff88' : '#22d3ee'}`,
              animation: 'popIn 0.3s ease-out',
            }}>
              {countdown > 0 ? countdown : 'GO!'}
            </div>
            <style>{`@keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
          </div>
        )}

        {/* Waiting overlay */}
        {phase === 'waiting' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16,
            background: 'rgba(3,3,10,0.8)', backdropFilter: 'blur(6px)',
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              {scoreDisplay} <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>PTS</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>{hitDisplay} hits</div>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em', marginTop: 4 }}>
              Waiting for opponent…
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#22d3ee',
                  animation: `dotPulse 1.2s ${i * 0.2}s ease-in-out infinite`,
                }} />
              ))}
            </div>
            <style>{`@keyframes dotPulse { 0%,100%{opacity:0.2;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
          </div>
        )}
      </div>

      <style>{`
        @keyframes multPop {
          0%   { transform: scale(1.5); opacity: 0.4; }
          60%  { transform: scale(0.95); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes chainBrokenIn {
          0%   { opacity: 0; transform: translateX(-50%) scale(1.4); }
          20%  { opacity: 1; transform: translateX(-50%) scale(1); }
          70%  { opacity: 1; transform: translateX(-50%) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.9); }
        }
        @keyframes reflex-chain-in {
          0%   { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.6); }
          28%  { opacity: 1; transform: translateX(-50%) translateY(-4px) scale(1.1); }
          50%  { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
          75%  { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.88); }
        }
        @keyframes reflex-shake {
          0%,100% { transform: translateX(0) rotate(0deg); }
          18%     { transform: translateX(-8px) rotate(-0.6deg); }
          36%     { transform: translateX(7px) rotate(0.5deg); }
          54%     { transform: translateX(-5px) rotate(-0.3deg); }
          72%     { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}
