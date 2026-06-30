import { useEffect, useRef, useState, useMemo, useCallback, CSSProperties } from 'react';
import { Socket } from 'socket.io-client';
import { GameConfig, ResultData } from '../types';

const GAME_DURATION_S = 30;
const ARM_DELAY_MS    = 250;
const LOCKOUT_MS      = [1500, 3000, 5000]; // progressive: 1st/2nd/3rd+ wrong in same set

const CARD_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e','#06b6d4',
  '#3b82f6','#8b5cf6','#ec4899','#14b8a6','#7c3aed',
  '#0891b2','#d97706',
];

// ── Seeded RNG ──────────────────────────────────────────────────────────────
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

// ── Shape definitions ────────────────────────────────────────────────────────
interface ShapeDef {
  sides: number;
  isStar?: boolean;
  innerFrac?: number;
  displaceAmt?: number;
  flipX?: boolean;
}

interface SetTemplate { stdDef: ShapeDef; oddDef: ShapeDef; }

const TIER1: SetTemplate[] = [
  { stdDef: { sides: 3 },                                   oddDef: { sides: 5 } },
  { stdDef: { sides: 4 },                                   oddDef: { sides: 7 } },
  { stdDef: { sides: 5 },                                   oddDef: { sides: 8 } },
  { stdDef: { sides: 6 },                                   oddDef: { sides: 3 } },
  { stdDef: { sides: 4 },                                   oddDef: { sides: 5, isStar: true, innerFrac: 0.40 } },
  { stdDef: { sides: 5, isStar: true, innerFrac: 0.40 },    oddDef: { sides: 4, isStar: true, innerFrac: 0.40 } },
];

const TIER2: SetTemplate[] = [
  { stdDef: { sides: 5 },                                   oddDef: { sides: 6 } },
  { stdDef: { sides: 6 },                                   oddDef: { sides: 7 } },
  { stdDef: { sides: 7 },                                   oddDef: { sides: 8 } },
  { stdDef: { sides: 5, isStar: true, innerFrac: 0.42 },    oddDef: { sides: 6, isStar: true, innerFrac: 0.42 } },
  { stdDef: { sides: 6 },                                   oddDef: { sides: 6, displaceAmt: -0.24 } },
  { stdDef: { sides: 5 },                                   oddDef: { sides: 5, displaceAmt: -0.26 } },
];

const TIER3: SetTemplate[] = [
  { stdDef: { sides: 8 },                                   oddDef: { sides: 8, displaceAmt: -0.10 } },
  { stdDef: { sides: 7 },                                   oddDef: { sides: 7, displaceAmt: -0.11 } },
  { stdDef: { sides: 9 },                                   oddDef: { sides: 9, displaceAmt: -0.09 } },
  { stdDef: { sides: 6 },                                   oddDef: { sides: 6, displaceAmt: -0.10 } },
  { stdDef: { sides: 5, isStar: true, innerFrac: 0.44 },    oddDef: { sides: 5, isStar: true, innerFrac: 0.36 } },
  { stdDef: { sides: 7, displaceAmt: -0.12, flipX: false }, oddDef: { sides: 7, displaceAmt: -0.12, flipX: true } },
];

// ── Set config ───────────────────────────────────────────────────────────────
interface SetConfig {
  stdDef: ShapeDef;
  oddDef: ShapeDef;
  oddIdx: number;
  rotations: number[];
  bgColors: string[];
  displaceVertex: number;
}

function generateSet(roomCode: string, setIdx: number, elapsedS: number): SetConfig {
  const rng = mulberry32(hashCode(roomCode + ':set:' + setIdx));

  // Layer 4: oddIdx is the FIRST rng call — server mirrors this to validate
  const oddIdx = Math.floor(rng() * 6);

  const templates = elapsedS < 10 ? TIER1 : elapsedS < 20 ? TIER2 : TIER3;
  const { stdDef, oddDef } = templates[Math.floor(rng() * templates.length)];

  const baseRot = rng() * Math.PI * 2;
  const isHard  = elapsedS >= 20;
  const rotations = Array.from({ length: 6 }, () => baseRot + (isHard ? (rng() - 0.5) * 0.30 : 0));

  const maxSides       = Math.max(stdDef.sides, oddDef.sides);
  const displaceVertex = Math.floor(rng() * maxSides);

  const usedColors = new Set<string>();
  const bgColors: string[] = [];
  for (let c = 0; c < 6; c++) {
    let color: string; let tries = 0;
    do { color = CARD_COLORS[Math.floor(rng() * CARD_COLORS.length)]; tries++; }
    while (usedColors.has(color) && tries < 20);
    usedColors.add(color);
    bgColors.push(color);
  }

  return { stdDef, oddDef, oddIdx, rotations, bgColors, displaceVertex };
}

// ── SVG shape points ─────────────────────────────────────────────────────────
function shapePts(def: ShapeDef, cx: number, cy: number, r: number, rotation: number, displaceVertex: number): string {
  const { sides, isStar = false, innerFrac = 0.45, displaceAmt = 0, flipX = false } = def;
  const totalPts = isStar ? sides * 2 : sides;
  const pts: string[] = [];
  for (let i = 0; i < totalPts; i++) {
    const angle = rotation + (2 * Math.PI * i) / totalPts;
    let radius: number;
    if (isStar) {
      radius = i % 2 === 0 ? r : r * innerFrac;
    } else {
      radius = (displaceAmt !== 0 && i === displaceVertex) ? r * (1 + displaceAmt) : r;
    }
    const rawX = cx + radius * Math.cos(angle);
    const x    = flipX ? (2 * cx - rawX) : rawX;
    const y    = cy + radius * Math.sin(angle);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

// ── Burst particles ──────────────────────────────────────────────────────────
const BURST_COLORS = ['#00ff88','#a855f7','#fff','#00ffaa','#c084fc','#34d399'];
function BurstParticles() {
  const pts = useMemo(() => Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.55;
    const d = 65 + Math.random() * 140;
    return {
      px: `${Math.cos(a) * d}px`, py: `${Math.sin(a) * d}px`,
      pr: `${(Math.random() - 0.5) * 720}deg`,
      w: 3 + Math.random() * 10, h: 3 + Math.random() * 6,
      color: BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)],
      delay: Math.random() * 0.08, dur: 0.32 + Math.random() * 0.35,
      br: Math.random() > 0.45 ? '50%' : '2px',
    };
  }), []);
  return (
    <div style={{ position: 'absolute', left: '50%', top: '50%', pointerEvents: 'none', zIndex: 30 }}>
      {pts.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', width: p.w, height: p.h, background: p.color, borderRadius: p.br,
          '--px': p.px, '--py': p.py, '--pr': p.pr,
          animation: `burstPt ${p.dur}s ${p.delay}s ease-out both`,
        } as CSSProperties} />
      ))}
    </div>
  );
}

// ── Shape card ───────────────────────────────────────────────────────────────
type CardState = 'idle' | 'correct' | 'wrong' | 'shattering';

const SHATTER_DIRS = [
  { dx: -260, dy: -150 }, { dx: 0, dy: -210 }, { dx: 260, dy: -150 },
  { dx: -260, dy: 150 },  { dx: 0, dy: 210 },  { dx: 260, dy: 150 },
];

interface CardProps {
  bgColor: string;
  shapeDef: ShapeDef;
  rotation: number;
  displaceVertex: number;
  state: CardState;
  onClick: () => void;
  disabled: boolean;
  cardIdx: number;
}

function ShapeCard({ bgColor, shapeDef, rotation, displaceVertex, state, onClick, disabled, cardIdx }: CardProps) {
  const dir = SHATTER_DIRS[cardIdx] ?? { dx: 0, dy: 100 };
  const borderColor =
    state === 'correct'    ? '#00ff88' :
    state === 'wrong'      ? '#ef4444' :
    state === 'shattering' ? 'rgba(239,68,68,0.3)' :
    'rgba(255,255,255,0.12)';
  const glow =
    state === 'correct' ? '0 0 32px rgba(0,255,136,0.8), 0 0 64px rgba(0,255,136,0.3)' :
    state === 'wrong'   ? '0 0 28px rgba(239,68,68,0.5)' : 'none';
  const anim =
    state === 'shattering' ? 'shatterFly2d 0.65s cubic-bezier(0.4,0,1,1) forwards' :
    state === 'correct'    ? 'correctExpand 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none';

  return (
    <button onClick={onClick} disabled={disabled} style={{
      aspectRatio: '1',
      borderRadius: 12,
      background: bgColor,
      border: `2px solid ${borderColor}`,
      boxShadow: glow,
      cursor: disabled ? 'default' : 'pointer',
      padding: 0,
      overflow: 'hidden',
      transition: (state === 'shattering' || state === 'correct') ? 'none' : 'border-color 0.12s, box-shadow 0.12s',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: anim,
      '--sdx': `${dir.dx}px`,
      '--sdy': `${dir.dy}px`,
    } as CSSProperties}>
      <svg viewBox="0 0 100 100" style={{ width: '66%', height: '66%' }}>
        <polygon
          points={shapePts(shapeDef, 50, 50, 33, rotation, displaceVertex)}
          fill="white" stroke="white" strokeWidth="1" strokeLinejoin="round"
        />
      </svg>
      {state === 'correct' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,255,136,0.18)' }}>
          <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>✓</span>
        </div>
      )}
      {state === 'wrong' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.22)' }}>
          <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>✗</span>
        </div>
      )}
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props { config: GameConfig; socket: Socket; onResult: (r: ResultData) => void; }

export default function GameScreen({ config, socket, onResult }: Props) {
  const [phase, setPhase]               = useState<'countdown' | 'playing' | 'lockout' | 'waiting' | 'done'>('countdown');
  const [countdown, setCountdown]       = useState(3);
  const [showGo, setShowGo]             = useState(false);
  const [timeLeft, setTimeLeft]         = useState(GAME_DURATION_S);
  const [setIdx, setSetIdx]             = useState(0);
  const [currentSet, setCurrentSet]     = useState<SetConfig | null>(null);
  const [wrongCard, setWrongCard]       = useState<number | null>(null);
  const [correctCard, setCorrectCard]   = useState<number | null>(null);
  const [burstKey, setBurstKey]         = useState(0);
  const [flashScreen, setFlashScreen]   = useState<'correct' | 'wrong' | null>(null);
  const [wrongXKey, setWrongXKey]       = useState(0);
  const [lockoutMs, setLockoutMs]       = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [opponentCorrect, setOpponentCorrect] = useState(0);

  const containerRef      = useRef<HTMLDivElement>(null);
  const phaseRef          = useRef<string>('countdown');
  const setIdxRef         = useRef(0);
  const setArmTimeRef     = useRef(0);
  const wrongCountInSet   = useRef(0);
  const correctCountRef   = useRef(0);
  const attemptedCountRef = useRef(0);
  const totalReactionMsRef= useRef(0);
  const setStartRef       = useRef(0);
  const gameEndRef        = useRef(false);
  const gameStartRef      = useRef(0);
  const tickRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockoutRafRef     = useRef<number>(0);
  const wrongXTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  function clearTimers() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (lockoutRafRef.current) { cancelAnimationFrame(lockoutRafRef.current); lockoutRafRef.current = 0; }
  }

  function triggerShake() {
    const el = containerRef.current;
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = 'cameraShake 0.44s ease-out';
    setTimeout(() => { if (el) el.style.animation = ''; }, 480);
  }

  function loadSet(idx: number, elapsed: number) {
    const set = generateSet(config.roomCode, idx, elapsed);
    setIdxRef.current = idx;
    setSetIdx(idx);
    setCurrentSet(set);
    setWrongCard(null);
    setCorrectCard(null);
    wrongCountInSet.current = 0;
    setStartRef.current = Date.now();
    setArmTimeRef.current = Date.now() + ARM_DELAY_MS;
    setPhase('playing');
    phaseRef.current = 'playing';
  }

  function startGame() {
    gameStartRef.current = Date.now();
    loadSet(0, 0);

    tickRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - gameStartRef.current) / 1000);
      const remaining = Math.max(0, GAME_DURATION_S - elapsed);
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(tickRef.current!);
        tickRef.current = null;
        if (phaseRef.current === 'playing' || phaseRef.current === 'lockout') {
          finishGame();
        }
      }
    }, 200);
  }

  // ── Countdown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let n = 3;
    const id = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(id);
        setCountdown(0);
        setShowGo(true);
        setTimeout(() => { setShowGo(false); startGame(); }, 900);
      } else {
        setCountdown(n);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Socket ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (config.solo) return;
    socket.on('odd:opponent-round', ({ correct }: { correct: boolean }) => {
      if (correct) setOpponentCorrect(c => c + 1);
    });
    socket.on('odd:result', (data: any) => {
      clearTimers();
      phaseRef.current = 'done';
      setPhase('done');
      const myCorrect   = data.myCorrect  ?? correctCountRef.current;
      const myAttempted = attemptedCountRef.current;
      const myTotalMs   = totalReactionMsRef.current;
      onResult({
        won: data.won,
        myScore: data.myScore ?? myCorrect * 100_000 - myTotalMs,
        myCorrect, myAttempted, myTotalMs,
        opponentScore: data.opponentScore ?? null,
        opponentCorrect: data.opponentCorrect ?? null,
        winnerName: data.winnerName,
        players: data.players ?? undefined,
      });
    });
    return () => { socket.off('odd:opponent-round'); socket.off('odd:result'); };
  }, [socket, onResult, config.solo]);

  useEffect(() => () => clearTimers(), []);

  // ── Handle click ────────────────────────────────────────────────────────────
  const handleCardClick = useCallback((cardIdx: number) => {
    if (phaseRef.current !== 'playing') return;
    if (!currentSet) return;
    if (Date.now() < setArmTimeRef.current) return; // Layer 2: arm delay

    attemptedCountRef.current += 1;
    const isCorrect = cardIdx === currentSet.oddIdx;

    if (!isCorrect) {
      // Wrong answer
      wrongCountInSet.current += 1;
      const lockDuration = LOCKOUT_MS[Math.min(wrongCountInSet.current - 1, LOCKOUT_MS.length - 1)];

      setWrongCard(cardIdx);
      setFlashScreen('wrong');
      triggerShake();
      if (wrongXTimerRef.current) clearTimeout(wrongXTimerRef.current);
      setWrongXKey(k => k + 1);
      wrongXTimerRef.current = setTimeout(() => setWrongXKey(0), 520);
      setTimeout(() => setFlashScreen(null), 220);

      // Start lockout
      phaseRef.current = 'lockout';
      setPhase('lockout');
      const end = Date.now() + lockDuration;
      setLockoutMs(lockDuration);

      const tick = () => {
        const remaining = end - Date.now();
        if (remaining <= 0) {
          setLockoutMs(0);
          setWrongCard(null);
          if (phaseRef.current === 'lockout') {
            phaseRef.current = 'playing';
            setPhase('playing');
          }
          return;
        }
        setLockoutMs(remaining);
        lockoutRafRef.current = requestAnimationFrame(tick);
      };
      lockoutRafRef.current = requestAnimationFrame(tick);
      return;
    }

    // Correct answer
    clearTimers();
    const reactionMs = Date.now() - setStartRef.current;
    correctCountRef.current += 1;
    totalReactionMsRef.current += reactionMs;
    setCorrectCount(correctCountRef.current);
    setCorrectCard(cardIdx);
    setFlashScreen('correct');
    setBurstKey(k => k + 1);
    setTimeout(() => setFlashScreen(null), 200);

    if (!config.solo) {
      socket.emit('odd:answer', { roomCode: config.roomCode, setIdx: setIdxRef.current, shapeIdx: cardIdx });
    }

    // Check if game time is up before advancing
    const elapsed = (Date.now() - gameStartRef.current) / 1000;
    if (elapsed >= GAME_DURATION_S) {
      finishGame();
      return;
    }

    // Advance immediately — instant next set
    const nextIdx = setIdxRef.current + 1;
    loadSet(nextIdx, elapsed);

    // Restart game tick
    tickRef.current = setInterval(() => {
      const e = Math.floor((Date.now() - gameStartRef.current) / 1000);
      const r = Math.max(0, GAME_DURATION_S - e);
      setTimeLeft(r);
      if (r <= 0) {
        clearInterval(tickRef.current!);
        tickRef.current = null;
        if (phaseRef.current === 'playing' || phaseRef.current === 'lockout') finishGame();
      }
    }, 200);
  }, [currentSet, config, socket]);

  function finishGame() {
    if (gameEndRef.current) return;
    gameEndRef.current = true;
    clearTimers();
    phaseRef.current = 'done';
    setPhase('done');

    const myCorrect   = correctCountRef.current;
    const myAttempted = attemptedCountRef.current;
    const myTotalMs   = totalReactionMsRef.current;
    const myScore     = myCorrect * 100_000 - myTotalMs;

    if (config.solo) {
      onResult({ won: true, myScore, myCorrect, myAttempted, myTotalMs, opponentScore: null, opponentCorrect: null, winnerName: config.playerName });
    } else {
      setPhase('waiting');
      phaseRef.current = 'waiting';
      setPhase('waiting');
      socket.emit('odd:finish', { roomCode: config.roomCode, correct: myCorrect, attempted: myAttempted, totalMs: myTotalMs });
    }
  }

  const isDanger  = timeLeft <= 10 && (phase === 'playing' || phase === 'lockout');
  const containerBg = isDanger ? '#190305' : '#03030a';

  return (
    <div ref={containerRef} style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: containerBg, userSelect: 'none', position: 'relative',
      transition: 'background 1.5s ease',
    }}>
      <style>{`
        @keyframes countdownSlam {
          0%   { transform:scale(2.2);  opacity:0; }
          18%  { transform:scale(0.92); opacity:1; }
          28%  { transform:scale(1);    opacity:1; }
          72%  { transform:scale(1);    opacity:1; }
          100% { transform:scale(0.62); opacity:0; }
        }
        @keyframes countdownGo {
          0%   { transform:scale(2.8);  opacity:0; }
          14%  { transform:scale(0.92); opacity:1; }
          30%  { transform:scale(1.05); opacity:1; }
          100% { transform:scale(1.05); opacity:1; }
        }
        @keyframes cameraShake {
          0%,100% { transform:translate(0,0) rotate(0); }
          10%     { transform:translate(-8px,-4px) rotate(-0.6deg); }
          22%     { transform:translate(9px,4px)   rotate(0.6deg); }
          34%     { transform:translate(-6px,3px)  rotate(-0.4deg); }
          46%     { transform:translate(5px,-5px)  rotate(0.4deg); }
          58%     { transform:translate(-3px,2px)  rotate(-0.2deg); }
          70%     { transform:translate(2px,-1px)  rotate(0.1deg); }
          84%     { transform:translate(-1px,1px)  rotate(0); }
        }
        @keyframes wrongXSlam {
          0%   { transform:scale(0.2)  rotate(-12deg); opacity:0; }
          22%  { transform:scale(1.15) rotate(2deg);   opacity:1; }
          38%  { transform:scale(1)    rotate(0);      opacity:1; }
          72%  { opacity:1; }
          100% { opacity:0; transform:scale(0.95) rotate(0); }
        }
        @keyframes shatterFly2d {
          0%   { transform:scale(1) translate(0,0) rotate(0); opacity:1; filter:brightness(1); }
          12%  { transform:scale(1.09) translate(0,-6px) rotate(0); opacity:1; filter:brightness(2); }
          100% { transform:scale(0.1) translate(var(--sdx),var(--sdy)) rotate(40deg); opacity:0; filter:brightness(0.4); }
        }
        @keyframes correctExpand {
          0%   { transform:scale(1.03); filter:brightness(1); }
          35%  { transform:scale(1.14); filter:brightness(1.5); }
          65%  { transform:scale(1.10); filter:brightness(1.2); }
          100% { transform:scale(1.08); filter:brightness(1.1); }
        }
        @keyframes burstPt {
          0%   { opacity:1; transform:translate(-50%,-50%) scale(1); }
          100% { opacity:0; transform:translate(calc(-50% + var(--px)),calc(-50% + var(--py))) scale(0.1) rotate(var(--pr)); }
        }
        @keyframes timerPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes dotPulse   { 0%,100%{opacity:0.2;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }
        @keyframes lockoutFade { 0%{opacity:0} 100%{opacity:1} }
      `}</style>

      {/* ── Wrong X overlay ─────────────────────────────────────────────────── */}
      {wrongXKey > 0 && (
        <div key={wrongXKey} style={{
          position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(239,68,68,0.04)',
        }}>
          <span style={{
            fontSize: 'clamp(7rem,20vw,12rem)', fontWeight: 900, color: '#ef4444', lineHeight: 1,
            textShadow: '0 0 60px rgba(239,68,68,0.9), 0 0 120px rgba(239,68,68,0.45)',
            animation: 'wrongXSlam 0.5s ease-out both',
          }}>✗</span>
        </div>
      )}

      {/* ── Screen flash ────────────────────────────────────────────────────── */}
      {flashScreen && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none',
          background: flashScreen === 'correct' ? 'rgba(0,255,136,0.10)' : 'rgba(239,68,68,0.18)',
        }} />
      )}

      {/* ── Danger vignette ─────────────────────────────────────────────────── */}
      {isDanger && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
          background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, rgba(239,68,68,0.14) 100%)',
          animation: 'lockoutFade 1.5s ease both',
        }} />
      )}

      {/* ── HUD ─────────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 52, flexShrink: 0,
        background: 'rgba(0,0,0,0.6)',
        borderBottom: `1px solid ${isDanger ? 'rgba(239,68,68,0.28)' : 'rgba(168,85,247,0.12)'}`,
        backdropFilter: 'blur(8px)',
        transition: 'border-color 0.3s',
        position: 'relative', zIndex: 10,
      }}>
        <div style={{ minWidth: 110, display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#a855f7', fontVariantNumeric: 'tabular-nums' }}>
            {correctCount}
          </span>
          <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            correct
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          <span style={{
            fontSize: '2.2rem', fontWeight: 900, lineHeight: 1,
            color: isDanger ? '#ef4444' : '#fff',
            fontVariantNumeric: 'tabular-nums',
            textShadow: isDanger ? '0 0 24px rgba(239,68,68,0.7)' : 'none',
            animation: isDanger && timeLeft <= 5 ? 'timerPulse 0.55s ease-in-out infinite' : 'none',
            transition: 'color 0.4s, text-shadow 0.4s',
          }}>
            {timeLeft}
          </span>
          <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.2)', marginTop: -1 }}>
            SECONDS
          </span>
        </div>

        <div style={{ minWidth: 110, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          {config.solo ? (
            <span style={{ fontSize: '0.6rem', color: 'rgba(168,85,247,0.4)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Solo Practice
            </span>
          ) : (
            <>
              <span style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {config.opponentName}
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: config.opponentColor, fontVariantNumeric: 'tabular-nums' }}>
                  {opponentCorrect}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Timer bar ───────────────────────────────────────────────────────── */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', flexShrink: 0, position: 'relative', zIndex: 10 }}>
        <div style={{
          height: '100%',
          width: `${(timeLeft / GAME_DURATION_S) * 100}%`,
          background: isDanger ? '#ef4444' : '#a855f7',
          transition: 'width 0.2s linear, background 0.4s',
          boxShadow: isDanger ? '0 0 8px #ef4444' : '0 0 8px #a855f766',
        }} />
      </div>

      {/* ── Main play area ───────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 18, padding: '12px 20px',
        position: 'relative', zIndex: 5,
        overflow: 'hidden',
      }}>

        {/* Countdown */}
        {phase === 'countdown' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            {!showGo ? (
              <div key={countdown} style={{
                fontSize: '7rem', fontWeight: 900, letterSpacing: '-0.04em',
                color: '#fff', textShadow: 'rgba(255,255,255,0.4)',
                animation: 'countdownSlam 0.95s ease-out both',
              }}>
                {countdown}
              </div>
            ) : (
              <div key="go" style={{
                fontSize: '8rem', fontWeight: 900, letterSpacing: '-0.04em',
                color: '#a855f7', textShadow: '0 0 80px rgba(168,85,247,0.9)',
                animation: 'countdownGo 0.9s cubic-bezier(0.16,1,0.3,1) both',
              }}>
                GO!
              </div>
            )}
            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)' }}>
              30 seconds · spot the odd shape · click it
            </p>
          </div>
        )}

        {/* Playing / lockout */}
        {(phase === 'playing' || phase === 'lockout') && currentSet && (
          <>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
              {phase === 'lockout' ? 'wrong answer — wait' : 'click the odd shape'}
            </div>

            <div style={{ position: 'relative', width: '100%', maxWidth: 680 }}>
              {/* Correct-pick burst */}
              {burstKey > 0 && (
                <div key={burstKey} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 25, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BurstParticles />
                </div>
              )}

              {/* 3×2 card grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {Array.from({ length: 6 }, (_, cardIdx) => {
                  const isOdd = cardIdx === currentSet.oddIdx;
                  const def   = isOdd ? currentSet.oddDef : currentSet.stdDef;
                  let cardState: CardState = 'idle';
                  if (phase === 'lockout') {
                    cardState = wrongCard === cardIdx ? 'wrong' : 'idle';
                  }
                  if (correctCard === cardIdx) cardState = 'correct';

                  return (
                    <ShapeCard
                      key={cardIdx}
                      bgColor={currentSet.bgColors[cardIdx]}
                      shapeDef={def}
                      rotation={currentSet.rotations[cardIdx]}
                      displaceVertex={currentSet.displaceVertex}
                      state={cardState}
                      onClick={() => handleCardClick(cardIdx)}
                      disabled={phase === 'lockout'}
                      cardIdx={cardIdx}
                    />
                  );
                })}
              </div>

              {/* Lockout overlay */}
              {phase === 'lockout' && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 20,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.72)', borderRadius: 12, gap: 8,
                  animation: 'lockoutFade 0.15s ease both',
                }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(239,68,68,0.7)', textTransform: 'uppercase' }}>
                    Locked out
                  </span>
                  <span style={{
                    fontSize: '2.8rem', fontWeight: 900, color: '#ef4444',
                    fontVariantNumeric: 'tabular-nums',
                    textShadow: '0 0 28px rgba(239,68,68,0.7)',
                  }}>
                    {(lockoutMs / 1000).toFixed(1)}s
                  </span>
                  {wrongCountInSet.current >= 2 && (
                    <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em' }}>
                      {wrongCountInSet.current === 2 ? '+1.5s next wrong' : '+2s next wrong'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Waiting */}
        {phase === 'waiting' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#a855f7' }}>
              {correctCount} correct
            </div>
            <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>
              Waiting for opponent to finish…
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#a855f7',
                  animation: `dotPulse 1.2s ${i * 0.2}s ease-in-out infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
