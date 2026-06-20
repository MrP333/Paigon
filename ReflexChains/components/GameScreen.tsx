import { useEffect, useRef, useState, useMemo, useCallback, type MouseEvent } from 'react';
import { Socket } from 'socket.io-client';
import { GameConfig, ResultData, Target, HitRecord, CanvasEffect } from '../types';

// ── Constants ────────────────────────────────────────────────────────────────
const CW = 900;
const CH = 540;
const NUM_TARGETS = 150;
const GAME_DURATION_MS = 30000;
const TARGET_R = 30;
const DECOY_R = 26;
const CHARGE_MS = 120;
const TIME_LIMIT_MS = 1200;
const DELAY_EXPAND_MS = 900;
const DELAY_CLICK_MS = 1400;
const TIMEOUT_PENALTY_MS = 800;
const DECOY_PENALTY_MS = 600;
const EARLY_PENALTY_MS = 700;
const DELAY_GATE_R = TARGET_R * 2.8;

type TargetKind = 'approach' | 'delay';

interface Floater { x: number; y: number; startTime: number; color: string; }

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

// ── Streak color ramp ─────────────────────────────────────────────────────────
function streakColor(streak: number): string {
  if (streak >= 10) return '#ffd700';
  if (streak >= 6)  return '#a855f7';
  if (streak >= 3)  return '#22d3ee';
  return '#00ff88';
}

// ── Target generation ─────────────────────────────────────────────────────────
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
    } while (tries < 60 && targets.some(t => Math.hypot(t.x - x, t.y - y) < 140));
    targets.push({ x, y, index: i });
  }
  return targets;
}

function generateKinds(roomCode: string): TargetKind[] {
  const rng = mulberry32(hashCode(roomCode + ':kinds'));
  return Array.from({ length: NUM_TARGETS }, (_, i) => {
    if (i < 3) return 'approach';
    const delayChance = i < 6 ? 0.25 : 0.45;
    return rng() < delayChance ? 'delay' : 'approach';
  });
}

interface Decoy { x: number; y: number; }

function generateDecoys(roomCode: string, targets: Target[]): Decoy[][] {
  const rng = mulberry32(hashCode(roomCode + ':decoys'));
  const PAD = 80;
  return targets.map((t, i) => {
    if (i < 2) return [];
    const count = i < 5 ? 1 : (rng() < 0.6 ? 2 : 1);
    const decoys: Decoy[] = [];
    for (let d = 0; d < count; d++) {
      let x = 0, y = 0, tries = 0;
      do {
        x = PAD + rng() * (CW - PAD * 2);
        y = PAD + rng() * (CH - PAD * 2);
        tries++;
      } while (tries < 80 && (
        Math.hypot(t.x - x, t.y - y) < 130 ||
        decoys.some(dec => Math.hypot(dec.x - x, dec.y - y) < 110)
      ));
      decoys.push({ x, y });
    }
    return decoys;
  });
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function drawBackground(ctx: CanvasRenderingContext2D, timeLeft: number, hitCount: number) {
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.0015);
  const danger = timeLeft <= 5;

  ctx.fillStyle = '#03030a';
  ctx.fillRect(0, 0, CW, CH);

  // Center radial glow — builds with hit count, shifts red when danger
  const glowIntensity = Math.min(0.03 + hitCount * 0.004, 0.16) + 0.03 * pulse;
  const grad = ctx.createRadialGradient(CW / 2, CH / 2, 0, CW / 2, CH / 2, CW * 0.55);
  grad.addColorStop(0, danger ? `rgba(239,68,68,${glowIntensity})` : `rgba(34,211,238,${glowIntensity})`);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CW, CH);

  // Grid dots
  ctx.fillStyle = danger ? 'rgba(239,68,68,0.2)' : 'rgba(34,211,238,0.13)';
  for (let x = 36; x < CW; x += 36) {
    for (let y = 36; y < CH; y += 36) {
      ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Red edge vignette when danger
  if (danger) {
    const vigAlpha = 0.07 + 0.10 * pulse;
    const vgrad = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.22, CW / 2, CH / 2, CW * 0.72);
    vgrad.addColorStop(0, 'transparent');
    vgrad.addColorStop(1, `rgba(239,68,68,${vigAlpha})`);
    ctx.fillStyle = vgrad;
    ctx.fillRect(0, 0, CW, CH);
  }
}

function drawApproachTarget(ctx: CanvasRenderingContext2D, t: Target, elapsed: number, streak: number) {
  const { x, y } = t;
  const TOTAL = CHARGE_MS + TIME_LIMIT_MS;
  const approachProgress = Math.min(elapsed / TOTAL, 1);
  const easedProgress = approachProgress * approachProgress;
  const approachR = TARGET_R + (TARGET_R * 2.6) * (1 - easedProgress);
  const isDanger = approachProgress > 0.65;
  const chargeProgress = Math.min(elapsed / CHARGE_MS, 1);
  const isClickable = elapsed >= CHARGE_MS;
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.004);
  const color = isClickable ? streakColor(streak) : '#22d3ee';
  const glowBoost = Math.min(streak * 0.018, 0.14);

  // Approach ring
  ctx.save();
  ctx.globalAlpha = 0.5 + 0.4 * approachProgress;
  ctx.beginPath(); ctx.arc(x, y, approachR, 0, Math.PI * 2);
  ctx.strokeStyle = isDanger ? '#ff6b6b' : color;
  ctx.lineWidth = isDanger ? 2.5 : 2;
  ctx.stroke();
  ctx.restore();

  // Glow layers — more intense on streak
  for (const [r, a] of [
    [TARGET_R * 3.0, 0.05 + 0.04 * pulse + glowBoost],
    [TARGET_R * 1.9, 0.11 + 0.06 * pulse + glowBoost],
  ] as [number, number][]) {
    ctx.save();
    ctx.globalAlpha = chargeProgress * a;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  }

  // Circle body
  ctx.save();
  ctx.globalAlpha = chargeProgress;
  ctx.beginPath(); ctx.arc(x, y, TARGET_R, 0, Math.PI * 2);
  ctx.fillStyle = `${color}1a`; ctx.fill();
  ctx.strokeStyle = isClickable ? color : `${color}66`;
  ctx.lineWidth = isClickable ? 2.5 : 2;
  ctx.stroke();
  ctx.restore();

  // Center dot
  ctx.save();
  ctx.globalAlpha = chargeProgress;
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = isClickable ? '#fff' : 'rgba(255,255,255,0.4)'; ctx.fill();
  ctx.restore();
}

function drawDelayTarget(ctx: CanvasRenderingContext2D, t: Target, elapsed: number) {
  const { x, y } = t;
  const isUnlocked = elapsed >= CHARGE_MS + DELAY_EXPAND_MS;
  const chargeProgress = Math.min(elapsed / CHARGE_MS, 1);
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
  const expandProgress = Math.min(Math.max(elapsed - CHARGE_MS, 0) / DELAY_EXPAND_MS, 1);
  const expandR = TARGET_R + (DELAY_GATE_R - TARGET_R) * expandProgress;

  ctx.save();
  ctx.globalAlpha = chargeProgress * 0.35;
  ctx.beginPath(); ctx.arc(x, y, DELAY_GATE_R, 0, Math.PI * 2);
  ctx.strokeStyle = '#fb923c';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  if (!isUnlocked) {
    ctx.save();
    ctx.globalAlpha = chargeProgress * (0.6 + 0.3 * pulse);
    ctx.beginPath(); ctx.arc(x, y, expandR, 0, Math.PI * 2);
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();
  }

  for (const [r, a] of [
    [TARGET_R * 2.8, 0.06 + 0.04 * pulse],
    [TARGET_R * 1.8, 0.1 + 0.06 * pulse],
  ] as [number, number][]) {
    ctx.save();
    ctx.globalAlpha = chargeProgress * a;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fb923c'; ctx.fill();
    ctx.restore();
  }

  const bodyAlpha = isUnlocked ? 1 : chargeProgress;
  ctx.save();
  ctx.globalAlpha = bodyAlpha;
  ctx.beginPath(); ctx.arc(x, y, TARGET_R, 0, Math.PI * 2);
  ctx.fillStyle = isUnlocked ? 'rgba(251,146,60,0.22)' : 'rgba(251,146,60,0.1)'; ctx.fill();
  ctx.strokeStyle = isUnlocked ? '#fb923c' : 'rgba(251,146,60,0.55)';
  ctx.lineWidth = isUnlocked ? 2.5 : 2;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = isUnlocked ? 1 : chargeProgress * 0.4;
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = isUnlocked ? '#fff' : 'rgba(251,146,60,0.5)'; ctx.fill();
  ctx.restore();

  if (!isUnlocked && chargeProgress > 0.5) {
    ctx.save();
    ctx.globalAlpha = chargeProgress * 0.55;
    ctx.fillStyle = '#fb923c';
    ctx.font = `bold 9px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('WAIT', x, y - TARGET_R - 10);
    ctx.restore();
  }

  if (isUnlocked) {
    const afterUnlock = elapsed - (CHARGE_MS + DELAY_EXPAND_MS);
    const clickProgress = Math.min(afterUnlock / DELAY_CLICK_MS, 1);
    const isDanger = clickProgress > 0.6;
    const afterR = TARGET_R + (TARGET_R * 1.6) * (1 - clickProgress * clickProgress);
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.35 * clickProgress;
    ctx.beginPath(); ctx.arc(x, y, afterR, 0, Math.PI * 2);
    ctx.strokeStyle = isDanger ? '#ff6b6b' : '#fb923c';
    ctx.lineWidth = isDanger ? 2.5 : 2;
    ctx.stroke();
    ctx.restore();
  }
}

function drawDecoy(ctx: CanvasRenderingContext2D, d: Decoy, elapsed: number) {
  const { x, y } = d;
  const chargeProgress = Math.min(elapsed / CHARGE_MS, 1);
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.005 + x);

  for (const [r, a] of [
    [DECOY_R * 2.6, 0.07 + 0.05 * pulse],
    [DECOY_R * 1.7, 0.13 + 0.07 * pulse],
  ] as [number, number][]) {
    ctx.save();
    ctx.globalAlpha = chargeProgress * a;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4444'; ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = chargeProgress;
  ctx.beginPath(); ctx.arc(x, y, DECOY_R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,68,68,0.1)'; ctx.fill();
  ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = chargeProgress * 0.95;
  ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  const s = 7;
  ctx.beginPath();
  ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
  ctx.stroke();
  ctx.restore();
}

function drawEffect(ctx: CanvasRenderingContext2D, fx: CanvasEffect, now: number) {
  const age = now - fx.startTime;
  const color = (fx as any).color ?? '#00ff88';

  if (fx.type === 'hit') {
    const dur = 620;
    if (age > dur) return;
    const t = age / dur;

    // Three expanding rings
    const rings: [number, number, number, number][] = [
      [TARGET_R,      TARGET_R * 3.4, 0,    0.9],
      [8,             TARGET_R * 2.4, 0.05, 0.65],
      [3,             TARGET_R * 1.6, 0.10, 0.45],
    ];
    for (const [sr, er, delay, alpha] of rings) {
      const rt = Math.max(0, t - delay) / (1 - delay);
      if (rt <= 0) continue;
      const ease = 1 - Math.pow(1 - rt, 3);
      ctx.save();
      ctx.globalAlpha = alpha * (1 - rt);
      ctx.beginPath(); ctx.arc(fx.x, fx.y, sr + (er - sr) * ease, 0, Math.PI * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
    }

    // Center flash
    ctx.save();
    ctx.globalAlpha = 0.25 * (1 - t);
    ctx.beginPath(); ctx.arc(fx.x, fx.y, TARGET_R, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.restore();

    // 8 outward particles
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = TARGET_R * 1.4 + TARGET_R * 2.8 * (1 - Math.pow(1 - t, 2));
      const px = fx.x + Math.cos(angle) * dist;
      const py = fx.y + Math.sin(angle) * dist;
      ctx.save();
      ctx.globalAlpha = 0.8 * (1 - t);
      ctx.beginPath(); ctx.arc(px, py, Math.max(0.5, 2.8 - t * 2.5), 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.restore();
    }

  } else if (fx.type === 'decoy') {
    const dur = 450;
    if (age > dur) return;
    const t = age / dur;
    const ease = 1 - Math.pow(1 - t, 3);
    ctx.save();
    ctx.globalAlpha = 0.9 * (1 - t);
    ctx.beginPath(); ctx.arc(fx.x, fx.y, DECOY_R + (DECOY_R * 2.5 - DECOY_R) * ease, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.2 * (1 - t);
    ctx.beginPath(); ctx.arc(fx.x, fx.y, DECOY_R, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4444'; ctx.fill();
    ctx.restore();

  } else if (fx.type === 'early') {
    const dur = 380;
    if (age > dur) return;
    const t = age / dur;
    const ease = 1 - Math.pow(1 - t, 3);
    ctx.save();
    ctx.globalAlpha = 0.85 * (1 - t);
    ctx.beginPath(); ctx.arc(fx.x, fx.y, TARGET_R + (TARGET_R * 2 - TARGET_R) * ease, 0, Math.PI * 2);
    ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.18 * (1 - t);
    ctx.beginPath(); ctx.arc(fx.x, fx.y, TARGET_R, 0, Math.PI * 2);
    ctx.fillStyle = '#fb923c'; ctx.fill();
    ctx.restore();

  } else {
    const dur = 300;
    if (age > dur) return;
    const t = age / dur;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.7;
    ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const s = 10 * (1 - t);
    ctx.beginPath();
    ctx.moveTo(fx.x - s, fx.y - s); ctx.lineTo(fx.x + s, fx.y + s);
    ctx.moveTo(fx.x + s, fx.y - s); ctx.lineTo(fx.x - s, fx.y + s);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFloaters(ctx: CanvasRenderingContext2D, floaters: Floater[], now: number) {
  const dur = 700;
  for (const f of floaters) {
    const age = now - f.startTime;
    if (age > dur) continue;
    const t = age / dur;
    const ease = 1 - Math.pow(1 - t, 2);
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.95;
    ctx.fillStyle = f.color;
    ctx.font = `bold ${Math.round(15 - t * 3)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 8;
    ctx.fillText('+1', f.x, f.y - 48 * ease);
    ctx.restore();
  }
}

function drawFlash(ctx: CanvasRenderingContext2D, flash: { startTime: number; color: string } | null, now: number) {
  if (!flash) return;
  const age = now - flash.startTime;
  if (age > 160) return;
  const t = age / 160;
  ctx.save();
  ctx.globalAlpha = 0.13 * (1 - t);
  ctx.fillStyle = flash.color;
  ctx.fillRect(0, 0, CW, CH);
  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  config: GameConfig;
  socket: Socket;
  onResult: (r: ResultData) => void;
}

export default function GameScreen({ config, socket, onResult }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [countdown, setCountdown] = useState(3);
  const [phase, setPhase] = useState<'countdown' | 'playing' | 'waiting' | 'done'>('countdown');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [opponentHits, setOpponentHits] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_MS / 1000);
  const [hitDisplay, setHitDisplay] = useState(0);
  const [penaltyMs, setPenaltyMs] = useState(0);
  const [streak, setStreak] = useState(0);

  const phaseRef        = useRef<string>('countdown');
  const currentIdxRef   = useRef(0);
  const appearTimeRef   = useRef(0);
  const startTimeRef    = useRef(0);
  const penaltyRef      = useRef(0);
  const effectsRef      = useRef<CanvasEffect[]>([]);
  const hitsRef         = useRef<HitRecord[]>([]);
  const hitCountRef     = useRef(0);
  const myFinalTimeRef  = useRef(0);
  const myFinalScoreRef = useRef(0);
  const timeoutRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameEndRef      = useRef(false);
  const streakRef       = useRef(0);
  const floatersRef     = useRef<Floater[]>([]);
  const flashRef        = useRef<{ startTime: number; color: string } | null>(null);
  const timeLeftRef     = useRef(GAME_DURATION_MS / 1000);

  const targets   = useMemo(() => generateTargets(config.roomCode), [config.roomCode]);
  const kinds     = useMemo(() => generateKinds(config.roomCode), [config.roomCode]);
  const decoys    = useMemo(() => generateDecoys(config.roomCode, targets), [config.roomCode, targets]);
  const decoysRef = useRef(decoys); decoysRef.current = decoys;
  const kindsRef  = useRef(kinds);  kindsRef.current  = kinds;

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);

  // ── Countdown ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let n = 3;
    const id = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(id);
        setCountdown(0);
        const now = Date.now();
        startTimeRef.current = now;
        appearTimeRef.current = now;
        setPhase('playing');
        phaseRef.current = 'playing';
        scheduleTimeout(now);
      } else {
        setCountdown(n);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── 30-second game clock ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => {
      const wall = Date.now() - startTimeRef.current;
      const left = Math.max(0, GAME_DURATION_MS - wall);
      const leftSecs = left / 1000;
      setTimeLeft(leftSecs);
      timeLeftRef.current = leftSecs;
      setHitDisplay(hitCountRef.current);
      if (left <= 0) endGame();
    }, 50);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Socket listeners ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (config.solo) return;
    socket.on('reflex:opponent-hit', ({ targetIndex }: { targetIndex: number }) => {
      setOpponentHits(targetIndex + 1);
    });
    socket.on('reflex:result', (data: any) => {
      phaseRef.current = 'done';
      setPhase('done');
      onResult({
        won: data.winnerId === socket.id,
        myTimeMs: myFinalTimeRef.current,
        myScore: data.myScore ?? myFinalScoreRef.current,
        myHits: data.myHits ?? hitCountRef.current,
        opponentTimeMs: data.opponentTimeMs ?? null,
        opponentScore: data.opponentScore ?? null,
        opponentHits: data.opponentHits ?? null,
        winnerName: data.winnerName,
      });
    });
    return () => { socket.off('reflex:opponent-hit'); socket.off('reflex:result'); };
  }, [socket, onResult, config.solo]);

  // ── End game ──────────────────────────────────────────────────────────────────
  function endGame() {
    if (gameEndRef.current || phaseRef.current === 'done' || phaseRef.current === 'waiting') return;
    gameEndRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const total = GAME_DURATION_MS;
    myFinalTimeRef.current = total;
    const score = hitCountRef.current * 1000 - Math.floor(total / 10);
    myFinalScoreRef.current = score;
    if (config.solo) {
      phaseRef.current = 'done'; setPhase('done');
      onResult({
        won: true,
        myTimeMs: total,
        myScore: score,
        myHits: hitCountRef.current,
        opponentTimeMs: null,
        opponentScore: null,
        opponentHits: null,
        winnerName: config.playerName,
      });
    } else {
      setPhase('waiting'); phaseRef.current = 'waiting';
      socket.emit('reflex:finish', { roomCode: config.roomCode, totalTimeMs: total, hits: hitsRef.current });
    }
  }

  // ── Timeout scheduling ────────────────────────────────────────────────────────
  function timeoutDuration(kind: TargetKind) {
    return kind === 'delay'
      ? CHARGE_MS + DELAY_EXPAND_MS + DELAY_CLICK_MS
      : CHARGE_MS + TIME_LIMIT_MS;
  }

  function scheduleTimeout(_appearTime: number) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const kind = kindsRef.current[currentIdxRef.current];
    timeoutRef.current = setTimeout(() => {
      if (phaseRef.current !== 'playing') return;
      penaltyRef.current += TIMEOUT_PENALTY_MS;
      setPenaltyMs((p: number) => p + TIMEOUT_PENALTY_MS);
      streakRef.current = 0;
      setStreak(0);
      const t = targets[currentIdxRef.current];
      if (t) effectsRef.current.push({ x: t.x, y: t.y, type: 'miss', startTime: Date.now() });
      advanceTarget(Date.now());
    }, timeoutDuration(kind));
  }

  function advanceTarget(now: number) {
    if (gameEndRef.current) return;
    const nextIdx = currentIdxRef.current + 1;
    currentIdxRef.current = nextIdx;
    setCurrentIdx(nextIdx);
    appearTimeRef.current = now;
    scheduleTimeout(now);
  }

  // ── Click handler ─────────────────────────────────────────────────────────────
  const handleClick = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== 'playing') return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (CW / rect.width);
    const cy = (e.clientY - rect.top)  * (CH / rect.height);
    const now = Date.now();
    const elapsed = now - appearTimeRef.current;

    if (elapsed < CHARGE_MS) {
      flashRef.current = { startTime: now, color: '#fb923c' };
      return;
    }

    const currentDecoys = decoysRef.current[currentIdxRef.current] || [];
    const hitDecoy = currentDecoys.find((d: Decoy) => Math.hypot(cx - d.x, cy - d.y) <= DECOY_R + 8);
    if (hitDecoy) {
      penaltyRef.current += DECOY_PENALTY_MS;
      setPenaltyMs((p: number) => p + DECOY_PENALTY_MS);
      streakRef.current = 0;
      setStreak(0);
      effectsRef.current.push({ x: hitDecoy.x, y: hitDecoy.y, type: 'decoy', startTime: now });
      return;
    }

    const t = targets[currentIdxRef.current];
    if (!t) return;
    if (Math.hypot(cx - t.x, cy - t.y) > TARGET_R + 10) {
      penaltyRef.current += 200;
      setPenaltyMs((p: number) => p + 200);
      streakRef.current = 0;
      setStreak(0);
      effectsRef.current.push({ x: cx, y: cy, type: 'miss', startTime: now });
      return;
    }

    const kind = kindsRef.current[currentIdxRef.current];
    if (kind === 'delay' && elapsed < CHARGE_MS + DELAY_EXPAND_MS) {
      penaltyRef.current += EARLY_PENALTY_MS;
      setPenaltyMs((p: number) => p + EARLY_PENALTY_MS);
      streakRef.current = 0;
      setStreak(0);
      effectsRef.current.push({ x: t.x, y: t.y, type: 'early', startTime: now });
      return;
    }

    // Valid hit
    streakRef.current++;
    setStreak(streakRef.current);
    const hitColor = streakColor(streakRef.current);
    hitCountRef.current++;
    hitsRef.current.push({ targetIndex: currentIdxRef.current, reactionMs: elapsed });
    if (!config.solo) {
      socket.emit('reflex:hit', { roomCode: config.roomCode, targetIndex: currentIdxRef.current, reactionMs: elapsed });
    }
    const fx = { x: t.x, y: t.y, type: 'hit' as const, startTime: now };
    (fx as any).color = hitColor;
    effectsRef.current.push(fx);
    floatersRef.current.push({ x: t.x, y: t.y, startTime: now, color: hitColor });
    flashRef.current = { startTime: now, color: hitColor };
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    advanceTarget(now);
  }, [targets, kinds, socket, config]);

  // ── Render loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let frame: number;

    const draw = () => {
      const now = Date.now();
      drawBackground(ctx, timeLeftRef.current, hitCountRef.current);

      if (phaseRef.current === 'playing' && currentIdxRef.current < targets.length) {
        const elapsed = now - appearTimeRef.current;
        const kind = kindsRef.current[currentIdxRef.current];
        for (const d of decoysRef.current[currentIdxRef.current] || []) {
          drawDecoy(ctx, d, elapsed);
        }
        if (kind === 'delay') {
          drawDelayTarget(ctx, targets[currentIdxRef.current], elapsed);
        } else {
          drawApproachTarget(ctx, targets[currentIdxRef.current], elapsed, streakRef.current);
        }
      }

      drawFlash(ctx, flashRef.current, now);
      if (flashRef.current && now - flashRef.current.startTime > 160) flashRef.current = null;

      effectsRef.current = effectsRef.current.filter((fx: CanvasEffect) => now - fx.startTime < 700);
      for (const fx of effectsRef.current) drawEffect(ctx, fx, now);

      floatersRef.current = floatersRef.current.filter((f: Floater) => now - f.startTime < 700);
      drawFloaters(ctx, floatersRef.current, now);

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [targets]);

  // ── HUD ───────────────────────────────────────────────────────────────────────
  const currentKind = kinds[currentIdx] ?? 'approach';
  const timerDanger = timeLeft <= 5;
  const timerPct    = timeLeft / (GAME_DURATION_MS / 1000);
  const sColor      = streakColor(streak);
  const streakLabel = streak >= 10 ? 'GODLIKE' : streak >= 6 ? 'ON FIRE' : streak >= 3 ? 'HOT' : null;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#03030a', userSelect: 'none' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 52,
        background: 'rgba(0,0,0,0.6)',
        borderBottom: `1px solid ${timerDanger ? 'rgba(239,68,68,0.35)' : 'rgba(34,211,238,0.1)'}`,
        backdropFilter: 'blur(8px)', flexShrink: 0,
        transition: 'border-color 0.3s',
      }}>

        {/* Left: hit count + streak badge */}
        <div style={{ minWidth: 130, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{
              fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.02em',
              color: streak >= 3 ? sColor : '#22d3ee',
              fontVariantNumeric: 'tabular-nums',
              textShadow: streak >= 3 ? `0 0 18px ${sColor}99` : 'none',
              transition: 'color 0.2s, text-shadow 0.2s',
            }}>
              {hitDisplay}
            </span>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
              HITS
            </span>
          </div>
          {streakLabel ? (
            <span style={{
              fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: sColor, textShadow: `0 0 10px ${sColor}`,
              animation: 'streakPop 0.18s ease-out',
            }}>
              {streak}× {streakLabel}
            </span>
          ) : penaltyMs > 0 ? (
            <span style={{ fontSize: '0.6rem', color: '#ff6b6b', fontWeight: 600 }}>
              -{(penaltyMs / 1000).toFixed(1)}s pen
            </span>
          ) : null}
        </div>

        {/* Center: timer + kind label */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{
              fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
              color: timerDanger ? '#ef4444' : '#fff',
              textShadow: timerDanger ? '0 0 24px #ef444499' : 'none',
              transition: 'color 0.3s',
            }}>
              {timeLeft.toFixed(1)}
            </span>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>s</span>
          </div>
          <div style={{ width: 120, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.1)' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              width: `${timerPct * 100}%`,
              background: timerDanger ? '#ef4444' : '#22d3ee',
              boxShadow: timerDanger ? '0 0 8px #ef4444' : 'none',
              transition: 'background 0.3s, box-shadow 0.3s',
            }} />
          </div>
          {phase === 'playing' && (
            <span style={{
              fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: currentKind === 'delay' ? '#fb923c' : '#22d3ee', opacity: 0.8,
            }}>
              {currentKind === 'delay' ? '⏳ WAIT' : '⚡ CLICK'}
            </span>
          )}
        </div>

        {/* Right: opponent / solo */}
        <div style={{ minWidth: 130, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          {config.solo ? (
            <span style={{ fontSize: '0.62rem', color: 'rgba(34,211,238,0.35)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Solo Practice
            </span>
          ) : (
            <>
              <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {config.opponentName}
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: config.opponentColor, fontVariantNumeric: 'tabular-nums' }}>
                  {opponentHits}
                </span>
                <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>HITS</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03030a' }}>
        <canvas
          ref={canvasRef}
          width={CW} height={CH}
          style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', display: 'block', cursor: phase === 'playing' ? 'crosshair' : 'default' }}
          onClick={handleClick}
        />

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

        {phase === 'waiting' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16,
            background: 'rgba(3,3,10,0.8)', backdropFilter: 'blur(6px)',
          }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#00ff88' }}>
              {hitDisplay} hits
            </div>
            <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>
              Waiting for opponent to finish…
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

      <style>{`@keyframes streakPop { from { transform: scale(1.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
