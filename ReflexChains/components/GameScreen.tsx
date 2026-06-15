import { useEffect, useRef, useState, useMemo, useCallback, type MouseEvent } from 'react';
import { Socket } from 'socket.io-client';
import { GameConfig, ResultData, Target, HitRecord, CanvasEffect } from '../types';

// ── Constants ────────────────────────────────────────────────────────────────
const CW = 900;
const CH = 540;
const NUM_TARGETS = 10;
const TARGET_R = 30;
const DECOY_R = 26;
const CHARGE_MS = 120;
const TIME_LIMIT_MS = 1200;       // approach window (faster)
const DELAY_EXPAND_MS = 900;      // how long the delay ring takes to unlock
const DELAY_CLICK_MS = 1400;      // window to click after unlock
const TIMEOUT_PENALTY_MS = 800;
const DECOY_PENALTY_MS = 600;
const EARLY_PENALTY_MS = 700;     // clicking a delay target before it unlocks
const DELAY_GATE_R = TARGET_R * 2.8; // where the expanding ring must reach

type TargetKind = 'approach' | 'delay';

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

// ── Target kind generation (seeded — same for both players) ──────────────────
function generateKinds(roomCode: string): TargetKind[] {
  const rng = mulberry32(hashCode(roomCode + ':kinds'));
  return Array.from({ length: NUM_TARGETS }, (_, i) => {
    if (i < 3) return 'approach';          // warm-up: always approach
    const delayChance = i < 6 ? 0.25 : 0.45;
    return rng() < delayChance ? 'delay' : 'approach';
  });
}

// ── Decoy generation ──────────────────────────────────────────────────────────
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
function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#03030a';
  ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = 'rgba(34,211,238,0.12)';
  for (let x = 36; x < CW; x += 36) {
    for (let y = 36; y < CH; y += 36) {
      ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawApproachTarget(ctx: CanvasRenderingContext2D, t: Target, elapsed: number) {
  const { x, y } = t;
  const TOTAL = CHARGE_MS + TIME_LIMIT_MS;
  const approachProgress = Math.min(elapsed / TOTAL, 1);
  // Ease-in: ring accelerates as it closes in
  const easedProgress = approachProgress * approachProgress;
  const approachR = TARGET_R + (TARGET_R * 2.6) * (1 - easedProgress);
  const isDanger = approachProgress > 0.65;
  const chargeProgress = Math.min(elapsed / CHARGE_MS, 1);
  const isClickable = elapsed >= CHARGE_MS;
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.004);

  // Approach ring (shrinking)
  ctx.save();
  ctx.globalAlpha = 0.5 + 0.4 * approachProgress;
  ctx.beginPath(); ctx.arc(x, y, approachR, 0, Math.PI * 2);
  ctx.strokeStyle = isDanger ? '#ff6b6b' : '#22d3ee';
  ctx.lineWidth = isDanger ? 2.5 : 1.8;
  ctx.stroke();
  ctx.restore();

  // Glow
  for (const [r, a] of [[TARGET_R * 2.8, 0.06 + 0.04 * pulse], [TARGET_R * 1.9, 0.12 + 0.06 * pulse]] as [number, number][]) {
    ctx.save();
    ctx.globalAlpha = chargeProgress * a;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#22d3ee'; ctx.fill();
    ctx.restore();
  }

  // Circle body
  ctx.save();
  ctx.globalAlpha = chargeProgress;
  ctx.beginPath(); ctx.arc(x, y, TARGET_R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(34,211,238,0.12)'; ctx.fill();
  ctx.strokeStyle = isClickable ? '#22d3ee' : 'rgba(34,211,238,0.5)';
  ctx.lineWidth = 2; ctx.stroke();
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

  // Expanding ring — grows from TARGET_R to DELAY_GATE_R over DELAY_EXPAND_MS
  const expandProgress = Math.min(Math.max(elapsed - CHARGE_MS, 0) / DELAY_EXPAND_MS, 1);
  const expandR = TARGET_R + (DELAY_GATE_R - TARGET_R) * expandProgress;

  // Gate ring (static marker showing where ring must reach)
  ctx.save();
  ctx.globalAlpha = chargeProgress * 0.35;
  ctx.beginPath(); ctx.arc(x, y, DELAY_GATE_R, 0, Math.PI * 2);
  ctx.strokeStyle = '#fb923c';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Expanding ring
  if (!isUnlocked) {
    ctx.save();
    ctx.globalAlpha = chargeProgress * (0.6 + 0.3 * pulse);
    ctx.beginPath(); ctx.arc(x, y, expandR, 0, Math.PI * 2);
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();
  }

  // Glow (orange)
  for (const [r, a] of [[TARGET_R * 2.8, 0.06 + 0.04 * pulse], [TARGET_R * 1.8, 0.1 + 0.06 * pulse]] as [number, number][]) {
    ctx.save();
    ctx.globalAlpha = chargeProgress * a;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fb923c'; ctx.fill();
    ctx.restore();
  }

  // Circle body — orange tint, flashes bright on unlock
  const bodyAlpha = isUnlocked ? 1 : chargeProgress;
  ctx.save();
  ctx.globalAlpha = bodyAlpha;
  ctx.beginPath(); ctx.arc(x, y, TARGET_R, 0, Math.PI * 2);
  ctx.fillStyle = isUnlocked ? 'rgba(251,146,60,0.22)' : 'rgba(251,146,60,0.1)'; ctx.fill();
  ctx.strokeStyle = isUnlocked ? '#fb923c' : 'rgba(251,146,60,0.55)';
  ctx.lineWidth = isUnlocked ? 2.5 : 2;
  ctx.stroke();
  ctx.restore();

  // Center dot — lights up on unlock
  ctx.save();
  ctx.globalAlpha = isUnlocked ? 1 : chargeProgress * 0.4;
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = isUnlocked ? '#fff' : 'rgba(251,146,60,0.5)'; ctx.fill();
  ctx.restore();

  // "WAIT" label while locked
  if (!isUnlocked && chargeProgress > 0.5) {
    ctx.save();
    ctx.globalAlpha = chargeProgress * 0.55;
    ctx.fillStyle = '#fb923c';
    ctx.font = `bold 9px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('WAIT', x, y - TARGET_R - 10);
    ctx.restore();
  }

  // Unlock window countdown arc (after unlock, shrinks like approach)
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

  for (const [r, a] of [[DECOY_R * 2.6, 0.07 + 0.05 * pulse], [DECOY_R * 1.7, 0.13 + 0.07 * pulse]] as [number, number][]) {
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

  if (fx.type === 'hit') {
    const dur = 520;
    if (age > dur) return;
    const t = age / dur;
    const rings: [number, number, number, number][] = [
      [TARGET_R, TARGET_R * 2.8, 0,    0.8],
      [10,       TARGET_R * 2,   0.06, 0.5],
      [4,        TARGET_R * 1.4, 0.12, 0.35],
    ];
    for (const [sr, er, delay, alpha] of rings) {
      const rt = Math.max(0, t - delay) / (1 - delay);
      if (rt <= 0) continue;
      const ease = 1 - Math.pow(1 - rt, 3);
      ctx.save();
      ctx.globalAlpha = alpha * (1 - rt);
      ctx.beginPath(); ctx.arc(fx.x, fx.y, sr + (er - sr) * ease, 0, Math.PI * 2);
      ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 0.15 * (1 - t);
    ctx.beginPath(); ctx.arc(fx.x, fx.y, TARGET_R, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88'; ctx.fill();
    ctx.restore();

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
    // Orange flash — clicked delay target too early
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
  const [opponentProgress, setOpponentProgress] = useState(0);
  const [elapsedDisplay, setElapsedDisplay] = useState(0);
  const [penaltyMs, setPenaltyMs] = useState(0);

  const phaseRef       = useRef<string>('countdown');
  const currentIdxRef  = useRef(0);
  const appearTimeRef  = useRef(0);
  const startTimeRef   = useRef(0);
  const penaltyRef     = useRef(0);
  const effectsRef     = useRef<CanvasEffect[]>([]);
  const hitsRef        = useRef<HitRecord[]>([]);
  const hitCountRef    = useRef(0);       // authoritative hit count for scoring
  const myFinalTimeRef = useRef(0);
  const myFinalScoreRef = useRef(0);
  const timeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const targets  = useMemo(() => generateTargets(config.roomCode), [config.roomCode]);
  const kinds    = useMemo(() => generateKinds(config.roomCode), [config.roomCode]);
  const decoys   = useMemo(() => generateDecoys(config.roomCode, targets), [config.roomCode, targets]);
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

  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => {
      setElapsedDisplay(Date.now() - startTimeRef.current + penaltyRef.current);
    }, 50);
    return () => clearInterval(id);
  }, [phase]);

  // ── Socket listeners ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (config.solo) return;
    socket.on('reflex:opponent-hit', ({ targetIndex }: { targetIndex: number }) => {
      setOpponentProgress(targetIndex + 1);
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
      const t = targets[currentIdxRef.current];
      if (t) effectsRef.current.push({ x: t.x, y: t.y, type: 'miss', startTime: Date.now() });
      advanceTarget(Date.now());
    }, timeoutDuration(kind));
  }

  function advanceTarget(now: number) {
    const nextIdx = currentIdxRef.current + 1;
    if (nextIdx >= NUM_TARGETS) {
      const total = now - startTimeRef.current + penaltyRef.current;
      myFinalTimeRef.current = total;
      setElapsedDisplay(total);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
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
    } else {
      currentIdxRef.current = nextIdx;
      setCurrentIdx(nextIdx);
      appearTimeRef.current = now;
      scheduleTimeout(now);
    }
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

    if (elapsed < CHARGE_MS) return;

    // Check decoys
    const currentDecoys = decoysRef.current[currentIdxRef.current] || [];
    const hitDecoy = currentDecoys.find(d => Math.hypot(cx - d.x, cy - d.y) <= DECOY_R + 8);
    if (hitDecoy) {
      penaltyRef.current += DECOY_PENALTY_MS;
      setPenaltyMs((p: number) => p + DECOY_PENALTY_MS);
      effectsRef.current.push({ x: hitDecoy.x, y: hitDecoy.y, type: 'decoy', startTime: now });
      return;
    }

    const t = targets[currentIdxRef.current];
    if (Math.hypot(cx - t.x, cy - t.y) > TARGET_R + 10) {
      // Wild miss — clicking empty space. Penalise to prevent spam-clicking.
      penaltyRef.current += 200;
      setPenaltyMs((p: number) => p + 200);
      effectsRef.current.push({ x: cx, y: cy, type: 'miss', startTime: now });
      return;
    }

    const kind = kindsRef.current[currentIdxRef.current];

    // Delay target: check if unlocked yet
    if (kind === 'delay' && elapsed < CHARGE_MS + DELAY_EXPAND_MS) {
      penaltyRef.current += EARLY_PENALTY_MS;
      setPenaltyMs((p: number) => p + EARLY_PENALTY_MS);
      effectsRef.current.push({ x: t.x, y: t.y, type: 'early', startTime: now });
      return;
    }

    // Valid hit
    hitCountRef.current++;
    hitsRef.current.push({ targetIndex: currentIdxRef.current, reactionMs: elapsed });
    if (!config.solo) {
      socket.emit('reflex:hit', { roomCode: config.roomCode, targetIndex: currentIdxRef.current, reactionMs: elapsed });
    }
    effectsRef.current.push({ x: t.x, y: t.y, type: 'hit', startTime: now });
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
      drawBackground(ctx);

      if (phaseRef.current === 'playing' && currentIdxRef.current < targets.length) {
        const elapsed = now - appearTimeRef.current;
        const kind = kindsRef.current[currentIdxRef.current];

        for (const d of decoysRef.current[currentIdxRef.current] || []) {
          drawDecoy(ctx, d, elapsed);
        }
        if (kind === 'delay') {
          drawDelayTarget(ctx, targets[currentIdxRef.current], elapsed);
        } else {
          drawApproachTarget(ctx, targets[currentIdxRef.current], elapsed);
        }
      }

      effectsRef.current = effectsRef.current.filter(fx => now - fx.startTime < 600);
      for (const fx of effectsRef.current) drawEffect(ctx, fx, now);

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [targets]);

  // ── HUD ───────────────────────────────────────────────────────────────────────
  function fmtTime(ms: number) { return (ms / 1000).toFixed(2) + 's'; }
  const progressDots = Array.from({ length: NUM_TARGETS }, (_, i) => i < currentIdx);
  const oppDots      = Array.from({ length: NUM_TARGETS }, (_, i) => i < opponentProgress);

  const currentKind = kinds[currentIdx];
  // Live running score: hits so far × 1000 minus elapsed time cost
  const runningScore = hitsRef.current.length * 1000 - Math.floor(elapsedDisplay / 10);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#03030a', userSelect: 'none' }}>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 52,
        background: 'rgba(0,0,0,0.6)',
        borderBottom: '1px solid rgba(34,211,238,0.1)',
        backdropFilter: 'blur(8px)', flexShrink: 0,
      }}>
        <div style={{ minWidth: 140, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontVariantNumeric: 'tabular-nums',
              fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.01em',
              color: phase === 'waiting' ? '#00ff88' : '#22d3ee',
            }}>
              {fmtTime(elapsedDisplay)}
            </span>
            {penaltyMs > 0 && (
              <span style={{ fontSize: '0.68rem', color: '#ff6b6b', fontWeight: 600 }}>
                +{(penaltyMs / 1000).toFixed(1)}s pen
              </span>
            )}
          </div>
          {phase === 'playing' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>
                SCORE
              </span>
              <span style={{
                fontSize: '0.72rem', fontWeight: 800, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums',
                color: runningScore >= 0 ? 'rgba(0,255,136,0.7)' : 'rgba(255,107,107,0.7)',
              }}>
                {runningScore.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Current target kind indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {phase === 'playing' && (
            <span style={{
              fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: currentKind === 'delay' ? '#fb923c' : '#22d3ee',
              opacity: 0.7,
            }}>
              {currentKind === 'delay' ? '⏳ Wait…' : '⚡ Click!'}
            </span>
          )}
          <div style={{ display: 'flex', gap: 5 }}>
            {progressDots.map((done, i) => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: done
                  ? (kinds[i] === 'delay' ? '#fb923c' : '#22d3ee')
                  : 'rgba(255,255,255,0.12)',
                boxShadow: done ? `0 0 6px ${kinds[i] === 'delay' ? '#fb923c' : '#22d3ee'}` : 'none',
                transition: 'all 0.15s',
              }} />
            ))}
          </div>
          <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            You
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160, justifyContent: 'flex-end' }}>
          {config.solo ? (
            <span style={{ fontSize: '0.65rem', color: 'rgba(34,211,238,0.4)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Solo Practice
            </span>
          ) : (
            <>
              <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {config.opponentName}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                {oppDots.map((done, i) => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: done ? config.opponentColor : 'rgba(255,255,255,0.1)',
                    boxShadow: done ? `0 0 5px ${config.opponentColor}` : 'none',
                    transition: 'all 0.15s',
                  }} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          width={CW} height={CH}
          style={{ width: '100%', height: '100%', display: 'block', cursor: phase === 'playing' ? 'crosshair' : 'default' }}
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
              {fmtTime(elapsedDisplay)}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>
              Waiting for opponent to finish…
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#22d3ee',
                  animation: `pulse 1.2s ${i * 0.2}s ease-in-out infinite`,
                }} />
              ))}
            </div>
            <style>{`@keyframes pulse { 0%,100%{opacity:0.2;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
          </div>
        )}
      </div>
    </div>
  );
}
