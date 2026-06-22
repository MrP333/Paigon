import { useEffect, useRef, useState, useMemo } from 'react';
import { Socket } from 'socket.io-client';
import { GameConfig, ResultData, RoundResult } from '../types';

const TOTAL_ROUNDS = 5;
const ROUND_TIMEOUT_MS = 30_000;
const CORRECT_PAUSE_MS = 600;
const WRONG_FLASH_MS   = 450;

const CARD_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#e11d48','#7c3aed'];

// ── Seeded RNG ─────────────────────────────────────────────────────────────────
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

// ── Round configs ─────────────────────────────────────────────────────────────
interface RoundDef {
  cardCount: number;
  stdSides: number;
  oddType: 'extra-side' | 'displaced';
  oddSides?: number;
  displaceAmount?: number;
}

const ROUND_DEFS: RoundDef[] = [
  { cardCount: 3, stdSides: 5, oddType: 'extra-side',  oddSides: 6 },
  { cardCount: 4, stdSides: 6, oddType: 'extra-side',  oddSides: 7 },
  { cardCount: 5, stdSides: 7, oddType: 'extra-side',  oddSides: 8 },
  { cardCount: 5, stdSides: 8, oddType: 'displaced',   displaceAmount: -0.22 },
  { cardCount: 5, stdSides: 9, oddType: 'displaced',   displaceAmount: -0.17 },
];

interface RoundConfig {
  def: RoundDef;
  rotation: number;
  oddIdx: number;
  bgColors: string[];
  displaceVertex: number;
}

function generateRounds(roomCode: string): RoundConfig[] {
  const rng = mulberry32(hashCode(roomCode + ':odd'));
  return ROUND_DEFS.map((def) => {
    const rotation = rng() * Math.PI * 2;
    const oddIdx = Math.floor(rng() * def.cardCount);
    const usedColors = new Set<string>();
    const bgColors: string[] = [];
    for (let c = 0; c < def.cardCount; c++) {
      let color: string;
      let tries = 0;
      do { color = CARD_COLORS[Math.floor(rng() * CARD_COLORS.length)]; tries++; }
      while (usedColors.has(color) && tries < 20);
      usedColors.add(color);
      bgColors.push(color);
    }
    const displaceVertex = Math.floor(rng() * def.stdSides);
    return { def, rotation, oddIdx, bgColors, displaceVertex };
  });
}

// ── SVG polygon ───────────────────────────────────────────────────────────────
function polygonPts(sides: number, cx: number, cy: number, r: number, rotation: number, displaceVertex = -1, displaceAmt = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (2 * Math.PI * i) / sides;
    const radius = i === displaceVertex ? r * (1 + displaceAmt) : r;
    pts.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// ── Shape card ────────────────────────────────────────────────────────────────
interface CardProps {
  bgColor: string;
  sides: number;
  rotation: number;
  displaceVertex?: number;
  displaceAmt?: number;
  state: 'idle' | 'correct' | 'wrong';
  onClick: () => void;
  disabled: boolean;
}

function ShapeCard({ bgColor, sides, rotation, displaceVertex = -1, displaceAmt = 0, state, onClick, disabled }: CardProps) {
  const borderColor =
    state === 'correct' ? '#00ff88' :
    state === 'wrong'   ? '#ef4444' :
    'rgba(255,255,255,0.12)';
  const glow =
    state === 'correct' ? '0 0 28px rgba(0,255,136,0.55)' :
    state === 'wrong'   ? '0 0 28px rgba(239,68,68,0.5)'  :
    'none';
  const scale =
    state === 'wrong'   ? 'scale(0.93)' :
    state === 'correct' ? 'scale(1.03)' :
    'scale(1)';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        aspectRatio: '0.75',
        borderRadius: 14,
        background: bgColor,
        border: `2px solid ${borderColor}`,
        boxShadow: glow,
        cursor: disabled ? 'default' : 'pointer',
        padding: 0,
        overflow: 'hidden',
        transition: 'border-color 0.12s, box-shadow 0.12s, transform 0.1s',
        transform: scale,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg viewBox="0 0 100 100" style={{ width: '72%', height: '72%' }}>
        <polygon
          points={polygonPts(sides, 50, 50, 34, rotation, displaceVertex, displaceAmt)}
          fill="white"
          stroke="white"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      {state === 'correct' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,255,136,0.18)' }}>
          <span style={{ fontSize: '2rem', lineHeight: 1 }}>✓</span>
        </div>
      )}
      {state === 'wrong' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.22)' }}>
          <span style={{ fontSize: '2rem', lineHeight: 1 }}>✗</span>
        </div>
      )}
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  config: GameConfig;
  socket: Socket;
  onResult: (r: ResultData) => void;
}

export default function GameScreen({ config, socket, onResult }: Props) {
  const [phase, setPhase] = useState<'countdown' | 'roundAnnounce' | 'playing' | 'roundResult' | 'waiting' | 'done'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [roundIdx, setRoundIdx] = useState(0);
  const [clickedCard, setClickedCard]   = useState<number | null>(null);
  const [wrongCard, setWrongCard]       = useState<number | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [opponentCorrect, setOpponentCorrect] = useState(0);
  const [flashScreen, setFlashScreen]   = useState<'correct' | 'wrong' | null>(null);
  const [timeLeft, setTimeLeft]         = useState(30);
  const [hint, setHint]                 = useState('');

  const roundResultsRef = useRef<RoundResult[]>([]);
  const roundStartRef   = useRef(0);
  const gameEndRef      = useRef(false);
  const phaseRef        = useRef<string>('countdown');
  const afkTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const rounds = useMemo(() => generateRounds(config.roomCode), [config.roomCode]);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  function clearTimers() {
    if (afkTimerRef.current)  clearTimeout(afkTimerRef.current);
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
  }

  // ── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let n = 3;
    const id = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(id);
        setCountdown(0);
        setPhase('roundAnnounce');
        phaseRef.current = 'roundAnnounce';
        setTimeout(() => startRound(0), 1100);
      } else {
        setCountdown(n);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Socket ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (config.solo) return;
    socket.on('odd:opponent-round', ({ correct }: { correct: boolean }) => {
      if (correct) setOpponentCorrect(c => c + 1);
    });
    socket.on('odd:result', (data: any) => {
      clearTimers();
      phaseRef.current = 'done';
      setPhase('done');
      const results = roundResultsRef.current;
      const myCorrect = results.filter(r => r.correct).length;
      const myTotalMs = results.reduce((s, r) => s + r.reactionMs, 0);
      onResult({
        won: data.won, myScore: myCorrect * 100000 - myTotalMs,
        myCorrect, myTotalMs, roundResults: results,
        opponentScore: data.opponentScore ?? null,
        opponentCorrect: data.opponentCorrect ?? null,
        winnerName: data.winnerName,
      });
    });
    return () => { socket.off('odd:opponent-round'); socket.off('odd:result'); };
  }, [socket, onResult, config.solo]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => () => clearTimers(), []);

  function startRound(idx: number) {
    setRoundIdx(idx);
    setClickedCard(null);
    setWrongCard(null);
    setTimeLeft(30);
    setHint('');
    setPhase('playing');
    phaseRef.current = 'playing';
    roundStartRef.current = Date.now();

    clearTimers();

    // 1-second countdown tick
    tickIntervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        const next = t - 1;
        if (next <= 0) clearInterval(tickIntervalRef.current!);
        return Math.max(0, next);
      });
    }, 1000);

    // 30-second AFK timeout → end the whole game
    afkTimerRef.current = setTimeout(() => {
      if (phaseRef.current !== 'playing') return;
      clearInterval(tickIntervalRef.current!);
      const result: RoundResult = { correct: false, reactionMs: ROUND_TIMEOUT_MS };
      const newResults = [...roundResultsRef.current, result];
      roundResultsRef.current = newResults;
      setRoundResults([...newResults]);
      finishGame(newResults);
    }, ROUND_TIMEOUT_MS);
  }

  function handleCardClick(rIdx: number, cardIdx: number) {
    if (phaseRef.current !== 'playing') return;
    const round = rounds[rIdx];
    const correct = cardIdx === round.oddIdx;

    if (!correct) {
      // Flash wrong card, stay in playing phase
      setWrongCard(cardIdx);
      setHint('✗  Not that one — try again');
      setFlashScreen('wrong');
      setTimeout(() => setFlashScreen(null), 200);
      setTimeout(() => { setWrongCard(null); setHint(''); }, WRONG_FLASH_MS);
      return;
    }

    // Correct answer — clear AFK timer
    clearTimers();
    const reactionMs = Math.min(Date.now() - roundStartRef.current, ROUND_TIMEOUT_MS);

    setClickedCard(cardIdx);
    setPhase('roundResult');
    phaseRef.current = 'roundResult';
    setFlashScreen('correct');
    setTimeout(() => setFlashScreen(null), 220);

    const result: RoundResult = { correct: true, reactionMs };
    const newResults = [...roundResultsRef.current, result];
    roundResultsRef.current = newResults;
    setRoundResults([...newResults]);

    if (!config.solo) {
      socket.emit('odd:round', { roomCode: config.roomCode, correct: true });
    }

    setTimeout(() => {
      const nextIdx = rIdx + 1;
      if (nextIdx >= TOTAL_ROUNDS) {
        finishGame(newResults);
      } else {
        setPhase('roundAnnounce');
        phaseRef.current = 'roundAnnounce';
        setTimeout(() => startRound(nextIdx), 1100);
      }
    }, CORRECT_PAUSE_MS);
  }

  function finishGame(results: RoundResult[]) {
    if (gameEndRef.current) return;
    gameEndRef.current = true;
    clearTimers();
    const myCorrect = results.filter(r => r.correct).length;
    const myTotalMs = results.reduce((s, r) => s + r.reactionMs, 0);
    const myScore = myCorrect * 100000 - myTotalMs;

    if (config.solo) {
      phaseRef.current = 'done';
      setPhase('done');
      onResult({
        won: true, myScore, myCorrect, myTotalMs,
        roundResults: results,
        opponentScore: null, opponentCorrect: null,
        winnerName: config.playerName,
      });
    } else {
      setPhase('waiting');
      phaseRef.current = 'waiting';
      socket.emit('odd:finish', { roomCode: config.roomCode, score: myScore, correct: myCorrect, totalMs: myTotalMs });
    }
  }

  const currentRound = rounds[roundIdx];
  const def = currentRound.def;
  const correctCount = roundResults.filter(r => r.correct).length;
  const isDanger = timeLeft <= 10 && phase === 'playing';

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: '#03030a', userSelect: 'none', position: 'relative',
    }}>
      <style>{`
        @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes dotPulse { 0%,100%{opacity:0.2;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }
        @keyframes hintFade { 0%{opacity:0;transform:translateY(4px)} 15%{opacity:1;transform:translateY(0)} 80%{opacity:1} 100%{opacity:0} }
        @keyframes timerPulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes roundSlam { 0% { transform: scale(1.6); opacity: 0; } 60% { transform: scale(0.95); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes roundLabel { from { opacity: 0; letter-spacing: 0.55em; } to { opacity: 1; letter-spacing: 0.35em; } }
      `}</style>

      {/* Flash overlay */}
      {flashScreen && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none',
          background: flashScreen === 'correct' ? 'rgba(0,255,136,0.1)' : 'rgba(239,68,68,0.12)',
        }} />
      )}

      {/* Round announce — full-screen splash */}
      {phase === 'roundAnnounce' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 40,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
          background: 'radial-gradient(ellipse 70% 55% at 50% 50%, rgba(168,85,247,0.08) 0%, transparent 70%), #03030a',
          pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'rgba(168,85,247,0.55)',
            animation: 'roundLabel 0.4s ease-out both',
            letterSpacing: '0.35em',
          }}>
            {roundIdx === 0 ? 'Get Ready' : `Round ${roundIdx} Complete`}
          </div>
          <div style={{
            fontSize: 'clamp(5rem,18vw,9rem)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1,
            color: '#a855f7',
            textShadow: '0 0 80px rgba(168,85,247,0.7), 0 0 160px rgba(168,85,247,0.25)',
            animation: 'roundSlam 0.38s cubic-bezier(0.22,1,0.36,1) both',
          }}>
            ROUND {roundIdx + 1}
          </div>
          <div style={{
            fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.06em',
            animation: 'roundLabel 0.5s 0.1s ease-out both',
          }}>
            {roundIdx >= 3 ? 'Same shape · one vertex is displaced' : `${def.cardCount} cards · find the odd shape`}
          </div>
        </div>
      )}

      {/* HUD */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 52, flexShrink: 0,
        background: 'rgba(0,0,0,0.6)',
        borderBottom: `1px solid ${isDanger ? 'rgba(239,68,68,0.3)' : 'rgba(168,85,247,0.12)'}`,
        backdropFilter: 'blur(8px)',
        transition: 'border-color 0.3s',
      }}>
        {/* Correct count */}
        <div style={{ minWidth: 120, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#a855f7', fontVariantNumeric: 'tabular-nums' }}>
              {correctCount}
            </span>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              / 5 correct
            </span>
          </div>
        </div>

        {/* Round dots + timer */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {Array.from({ length: TOTAL_ROUNDS }, (_, i) => {
              const rr = roundResults[i];
              const isCurrent = i === roundIdx && (phase === 'playing' || phase === 'roundResult');
              return (
                <div key={i} style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: rr ? (rr.correct ? '#00ff88' : '#ef4444') : isCurrent ? '#a855f7' : 'rgba(255,255,255,0.12)',
                  boxShadow: isCurrent ? '0 0 8px #a855f788' : 'none',
                  transition: 'all 0.2s',
                }} />
              );
            })}
          </div>
          {/* Timer */}
          {(phase === 'playing' || phase === 'roundResult') && (
            <div style={{
              fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em',
              color: isDanger ? '#ef4444' : 'rgba(255,255,255,0.3)',
              fontVariantNumeric: 'tabular-nums',
              animation: isDanger && timeLeft <= 5 ? 'timerPulse 0.6s ease-in-out infinite' : 'none',
              transition: 'color 0.3s',
            }}>
              {timeLeft}s
            </div>
          )}
        </div>

        {/* Opponent / mode */}
        <div style={{ minWidth: 120, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          {config.solo ? (
            <span style={{ fontSize: '0.62rem', color: 'rgba(168,85,247,0.4)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Solo Practice
            </span>
          ) : (
            <>
              <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {config.opponentName}
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: config.opponentColor, fontVariantNumeric: 'tabular-nums' }}>
                  {opponentCorrect}
                </span>
                <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>/ 5</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Timer bar */}
      {(phase === 'playing') && (
        <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{
            height: '100%',
            width: `${(timeLeft / 30) * 100}%`,
            background: isDanger ? '#ef4444' : '#a855f7',
            transition: 'width 1s linear, background 0.3s',
            boxShadow: isDanger ? '0 0 8px #ef4444' : '0 0 8px #a855f766',
          }} />
        </div>
      )}

      {/* Main play area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '0 24px' }}>

        {/* Countdown */}
        {phase === 'countdown' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{
              fontSize: countdown === 0 ? '5rem' : '7rem',
              fontWeight: 800, letterSpacing: '-0.04em',
              color: countdown === 0 ? '#a855f7' : '#fff',
              textShadow: `0 0 60px ${countdown === 0 ? '#a855f7' : 'rgba(255,255,255,0.3)'}`,
              animation: 'popIn 0.3s ease-out',
            }}>
              {countdown > 0 ? countdown : 'GO!'}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)' }}>Spot the odd shape — you must find it to advance</p>
          </div>
        )}

        {/* Round announce — renders inline so layout stays intact; actual content is an absolute overlay */}

        {/* Playing / result */}
        {(phase === 'playing' || phase === 'roundResult') && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.28em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
                Round {roundIdx + 1} of {TOTAL_ROUNDS}
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.04em', color: phase === 'roundResult' ? '#00ff88' : 'rgba(255,255,255,0.5)' }}>
                {phase === 'roundResult' ? '✓  Correct!' : 'Click the odd shape'}
              </span>
              {/* Wrong hint (brief) */}
              {hint && phase === 'playing' && (
                <span style={{
                  fontSize: '0.75rem', fontWeight: 600, color: '#ef4444',
                  animation: 'hintFade 0.45s ease forwards',
                }}>
                  {hint}
                </span>
              )}
            </div>

            <div style={{
              display: 'flex', gap: 12, width: '100%',
              maxWidth: def.cardCount === 3 ? 520 : def.cardCount === 4 ? 660 : 780,
            }}>
              {Array.from({ length: def.cardCount }, (_, cardIdx) => {
                const isOdd = cardIdx === currentRound.oddIdx;
                let cardState: 'idle' | 'correct' | 'wrong' = 'idle';
                if (phase === 'roundResult' && clickedCard === cardIdx) cardState = 'correct';
                if (phase === 'playing' && wrongCard === cardIdx) cardState = 'wrong';

                const sides = isOdd
                  ? (def.oddType === 'extra-side' ? (def.oddSides ?? def.stdSides + 1) : def.stdSides)
                  : def.stdSides;
                const displaceVertex = isOdd && def.oddType === 'displaced' ? currentRound.displaceVertex : -1;
                const displaceAmt    = isOdd && def.oddType === 'displaced' ? (def.displaceAmount ?? 0) : 0;

                return (
                  <ShapeCard
                    key={cardIdx}
                    bgColor={currentRound.bgColors[cardIdx]}
                    sides={sides}
                    rotation={currentRound.rotation}
                    displaceVertex={displaceVertex}
                    displaceAmt={displaceAmt}
                    state={cardState}
                    onClick={() => handleCardClick(roundIdx, cardIdx)}
                    disabled={phase !== 'playing'}
                  />
                );
              })}
            </div>
          </>
        )}

        {/* Waiting */}
        {phase === 'waiting' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a855f7' }}>
              {correctCount} / 5 correct
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
