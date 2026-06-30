import { ResultData } from '../types';
import { useEffect, useMemo, useState, useRef, CSSProperties } from 'react';

const CSS = `
@keyframes paigon-card-in {
  0%   { opacity:0; transform:scale(0.82) translateY(28px); }
  65%  { opacity:1; transform:scale(1.03) translateY(-5px); }
  100% { opacity:1; transform:scale(1) translateY(0); }
}
@keyframes paigon-hl {
  0%,100% { filter:brightness(1) drop-shadow(0 0 18px currentColor); }
  50%      { filter:brightness(1.35) drop-shadow(0 0 40px currentColor) drop-shadow(0 0 80px currentColor); }
}
@keyframes paigon-stat {
  from { opacity:0; transform:translateX(-12px); }
  to   { opacity:1; transform:translateX(0); }
}
@keyframes paigon-pt {
  0%   { opacity:1; transform:translate(-50%,-50%) scale(1); }
  100% { opacity:0; transform:translate(calc(-50% + var(--px)),calc(-50% + var(--py))) scale(0.1) rotate(var(--pr)); }
}
@keyframes paigon-btn-glow {
  0%,100% { box-shadow:0 0 22px var(--bc),0 4px 14px var(--bc); }
  50%      { box-shadow:0 0 55px var(--bc),0 0 100px var(--bc)66; }
}
@keyframes paigon-round-pop {
  0%   { opacity:0; transform:scale(0.5) translateY(10px); }
  70%  { opacity:1; transform:scale(1.12) translateY(-2px); }
  100% { opacity:1; transform:scale(1) translateY(0); }
}
@keyframes paigon-score-in {
  0%   { opacity:0; transform:scale(0.6); }
  70%  { opacity:1; transform:scale(1.08); }
  100% { opacity:1; transform:scale(1); }
}
@keyframes paigon-tick-flash {
  0%   { transform:scale(1.45); color:#00ff88; text-shadow:0 0 24px rgba(0,255,136,0.9); }
  100% { transform:scale(1);    color:inherit;  text-shadow:none; }
}
`;

interface Props {
  result: ResultData;
  onPlayAgain: () => void;
  solo?: boolean;
}

function fmtMs(ms: number) { return (ms / 1000).toFixed(2) + 's'; }
function fmtAvg(totalMs: number, correct: number) {
  if (correct === 0) return '—';
  return Math.round(totalMs / correct) + 'ms';
}
function fmtAccuracy(correct: number, attempted: number) {
  if (attempted === 0) return '—';
  return Math.round((correct / attempted) * 100) + '%';
}

interface PInfo { px: string; py: string; pr: string; w: number; h: number; color: string; delay: number; dur: number; br: string; }
function makeParticles(c1: string, c2: string, n: number): PInfo[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
    const d = 75 + Math.random() * 145;
    const pal = [c1, c2, '#fff', c1 + 'bb'];
    return {
      px: `${Math.cos(a) * d}px`, py: `${Math.sin(a) * d}px`,
      pr: `${(Math.random() - 0.5) * 720}deg`,
      w: 3 + Math.random() * 9, h: 3 + Math.random() * 6,
      color: pal[Math.floor(Math.random() * pal.length)],
      delay: Math.random() * 0.35, dur: 0.5 + Math.random() * 0.55,
      br: Math.random() > 0.45 ? '50%' : '2px',
    };
  });
}

function Particles({ c1, c2, n = 28 }: { c1: string; c2: string; n?: number }) {
  const pts = useMemo(() => makeParticles(c1, c2, n), []);
  return (
    <div style={{ position: 'absolute', left: '50%', top: '35%', pointerEvents: 'none', zIndex: 0 }}>
      {pts.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', width: p.w, height: p.h, borderRadius: p.br, background: p.color,
          '--px': p.px, '--py': p.py, '--pr': p.pr,
          animation: `paigon-pt ${p.dur}s ${p.delay}s ease-out both`,
        } as CSSProperties} />
      ))}
    </div>
  );
}

// Smoothly counts a number from 0 to target over `duration` ms after `delay` ms
function useCountUp(target: number, delay = 500, duration = 1500) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const start = performance.now();
      function tick() {
        const p = Math.min((performance.now() - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.floor(eased * target));
        if (p < 1) requestAnimationFrame(tick);
        else setVal(target);
      }
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(t);
  }, [target]);
  return val;
}

// Ticks an integer from 0 to target, one per stepMs, after initialDelay
function useTickUp(target: number, stepMs = 260, initialDelay = 500) {
  const [val, setVal] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setVal(0);
    setFlashKey(0);
    if (target === 0) return;
    for (let i = 1; i <= target; i++) {
      const t = setTimeout(() => {
        setVal(i);
        setFlashKey(k => k + 1);
      }, initialDelay + (i - 1) * stepMs);
      timeoutsRef.current.push(t);
    }
    return () => timeoutsRef.current.forEach(clearTimeout);
  }, [target]);

  return { val, flashKey };
}

export default function ResultScreen({ result, onPlayAgain, solo }: Props) {
  const won       = result.won;
  const accent    = won ? '#a855f7' : '#ef4444';
  const accentAlt = won ? '#ec4899' : '#f97316';

  useEffect(() => {
    if (document.getElementById('paigon-result-css')) return;
    const el = document.createElement('style');
    el.id = 'paigon-result-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  const animatedScore   = useCountUp(result.myScore, 600, 1500);
  const { val: animCorrect, flashKey: correctFlash } = useTickUp(result.myCorrect, 260, 550);
  const myAttempted     = result.myAttempted ?? result.myCorrect;

  const bgGlow = won
    ? 'radial-gradient(ellipse 85% 65% at 50% 38%, rgba(168,85,247,0.1) 0%, transparent 70%), #03030a'
    : 'radial-gradient(ellipse 85% 65% at 50% 38%, rgba(239,68,68,0.07) 0%, transparent 70%), #03030a';

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: bgGlow, position: 'relative', overflow: 'hidden',
    }}>
      <Particles c1={accent} c2={accentAlt} n={won ? 32 : 18} />

      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'repeating-linear-gradient(transparent,transparent 2px,rgba(0,0,0,0.025) 2px,rgba(0,0,0,0.025) 4px)',
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 400, padding: '40px 32px', margin: '0 16px',
        background: `${accent}0a`,
        border: `1px solid ${accent}33`,
        borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 22,
        boxShadow: `0 0 80px ${accent}10`,
        animation: 'paigon-card-in 0.55s cubic-bezier(0.34,1.56,0.64,1) both',
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.28em',
            color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', marginBottom: 10,
            animation: 'paigon-stat 0.35s 0.2s both',
          }}>
            Odd Signal
          </div>
          <div style={{
            fontSize: '2.6rem', fontWeight: 900, letterSpacing: '0.06em', lineHeight: 1,
            background: won
              ? 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)'
              : 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            animation: `paigon-hl 2.5s 0.6s ease-in-out infinite, paigon-score-in 0.5s 0.3s cubic-bezier(0.34,1.56,0.64,1) both`,
          }}>
            {solo ? 'COMPLETE' : (won ? 'YOU WIN' : 'YOU LOSE')}
          </div>
          {!solo && (
            <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'rgba(255,255,255,0.32)', animation: 'paigon-stat 0.35s 0.4s both' }}>
              {won
                ? `You outperformed ${result.winnerName === 'You' ? 'your opponent' : result.winnerName}`
                : `${result.winnerName} had better instincts`}
            </div>
          )}
        </div>

        {/* Blitz stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>
          {[
            {
              label: 'Correct',
              renderValue: () => (
                <span key={correctFlash} style={{
                  fontSize: '0.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  color: 'rgba(255,255,255,0.75)', display: 'inline-block',
                  animation: correctFlash > 0 ? 'paigon-tick-flash 0.28s ease-out both' : 'none',
                }}>
                  {animCorrect} / {myAttempted}
                </span>
              ),
              d: 0.75,
            },
            {
              label: 'Accuracy',
              renderValue: () => (
                <span style={{ fontSize: '0.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.75)' }}>
                  {fmtAccuracy(result.myCorrect, myAttempted)}
                </span>
              ),
              d: 0.82,
            },
            {
              label: 'Avg reaction',
              renderValue: () => (
                <span style={{ fontSize: '0.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.75)' }}>
                  {fmtAvg(result.myTotalMs, result.myCorrect)}
                </span>
              ),
              d: 0.89,
            },
            {
              label: 'Score',
              renderValue: () => (
                <span style={{
                  fontSize: '0.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  color: accent, textShadow: `0 0 20px ${accent}88`,
                }}>
                  {animatedScore.toLocaleString()}
                </span>
              ),
              d: 0.96,
            },
            ...(!solo && !result.players && result.opponentScore !== null
              ? [{
                  label: 'Opp. score',
                  renderValue: () => <span style={{ fontSize: '0.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.75)' }}>{result.opponentScore!.toLocaleString()}</span>,
                  d: 1.03,
                }]
              : []),
          ].map(({ label, renderValue, d }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
              animation: `paigon-stat 0.35s ${d}s both`,
            }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>{label}</span>
              {renderValue()}
            </div>
          ))}
        </div>

        {/* Leaderboard (N-player) */}
        {!solo && result.players && result.players.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, animation: 'paigon-stat 0.35s 1.0s both' }}>
            <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: 4 }}>
              Final Standings
            </div>
            {result.players.map((p, i) => {
              const isMe = p.score === result.myScore && p.correct === result.myCorrect;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 10,
                  background: p.won ? `${accent}0d` : isMe ? 'rgba(168,85,247,0.05)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${p.won ? accent + '33' : isMe ? accent + '20' : 'rgba(255,255,255,0.06)'}`,
                  animation: `paigon-stat 0.35s ${1.05 + i * 0.07}s both`,
                }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, fontFamily: 'monospace', color: p.won ? accent : 'rgba(255,255,255,0.25)', width: 18, textAlign: 'center' }}>
                    #{p.rank}
                  </span>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: 'left', fontSize: '0.8rem', fontWeight: 700, color: p.won ? accent : isMe ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.45)' }}>
                    {p.name}{isMe ? ' (you)' : ''}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
                    {p.correct}/{p.attempted ?? p.correct} · {fmtAvg(p.timeMs, p.correct)}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: p.won ? accent : 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums', minWidth: 44, textAlign: 'right' }}>
                    {p.score.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={onPlayAgain}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            background: `${accent}22`, border: `1px solid ${accent}44`,
            color: accent, fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.05em',
            cursor: 'pointer', fontFamily: 'inherit',
            '--bc': accent + '99',
            animation: 'paigon-btn-glow 2.2s 1.2s ease-in-out infinite, paigon-stat 0.35s 1.05s both',
            transition: 'transform 0.12s, background 0.15s',
          } as CSSProperties}
          onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)'; e.currentTarget.style.background = `${accent}33`; }}
          onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = `${accent}22`; }}
        >
          PLAY AGAIN →
        </button>
      </div>
    </div>
  );
}
