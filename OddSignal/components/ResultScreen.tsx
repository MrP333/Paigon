import { ResultData } from '../types';
import { useEffect, useMemo, useState, CSSProperties } from 'react';

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
`;

interface Props {
  result: ResultData;
  onPlayAgain: () => void;
  solo?: boolean;
}

function fmtMs(ms: number) {
  return (ms / 1000).toFixed(2) + 's';
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

function useCountUp(target: number, delay = 500) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const dur = 900;
      const start = performance.now();
      function tick() {
        const p = Math.min((performance.now() - start) / dur, 1);
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

export default function ResultScreen({ result, onPlayAgain, solo }: Props) {
  const won = result.won;
  const accent = won ? '#a855f7' : '#ef4444';
  const accentAlt = won ? '#ec4899' : '#f97316';

  useEffect(() => {
    if (document.getElementById('paigon-result-css')) return;
    const el = document.createElement('style');
    el.id = 'paigon-result-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  const animatedScore = useCountUp(result.myScore, 600);

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

        {/* Round breakdown */}
        <div>
          <div style={{
            fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.22em',
            color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: 10,
            animation: 'paigon-stat 0.35s 0.45s both',
          }}>
            Round breakdown
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {result.roundResults.map((r, i) => (
              <div key={i} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '9px 4px', borderRadius: 10,
                background: r.correct ? 'rgba(168,85,247,0.1)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${r.correct ? 'rgba(168,85,247,0.28)' : 'rgba(239,68,68,0.2)'}`,
                boxShadow: r.correct ? '0 0 12px rgba(168,85,247,0.15)' : 'none',
                animation: `paigon-round-pop 0.4s ${0.5 + i * 0.08}s cubic-bezier(0.34,1.56,0.64,1) both`,
              }}>
                <span style={{ fontSize: '0.52rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>R{i + 1}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 900, color: r.correct ? '#a855f7' : '#ff6b6b' }}>
                  {r.correct ? '✓' : '✗'}
                </span>
                <span style={{ fontSize: '0.58rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtMs(r.reactionMs)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>
          {[
            { label: 'Correct',    value: `${result.myCorrect} / 5`,              highlight: false, d: 0.85 },
            { label: 'Total time', value: fmtMs(result.myTotalMs),                highlight: false, d: 0.9  },
            { label: 'Your score', value: animatedScore.toLocaleString(),          highlight: true,  d: 0.95 },
            ...(!solo && result.opponentScore !== null
              ? [{ label: 'Opp. score', value: result.opponentScore!.toLocaleString(), highlight: false, d: 1.0 }]
              : []),
          ].map(({ label, value, highlight, d }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
              animation: `paigon-stat 0.35s ${d}s both`,
            }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>{label}</span>
              <span style={{
                fontSize: '0.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                color: highlight ? accent : 'rgba(255,255,255,0.75)',
                textShadow: highlight ? `0 0 20px ${accent}88` : 'none',
              }}>{value}</span>
            </div>
          ))}
        </div>

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
