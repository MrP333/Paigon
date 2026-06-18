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
@keyframes paigon-dot-pop {
  0%   { transform:scale(0); opacity:0; }
  60%  { transform:scale(1.4); opacity:1; }
  100% { transform:scale(1); opacity:1; }
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

const NUM_TARGETS = 10;

function fmtTime(ms: number | null) {
  if (ms === null) return '—';
  return (ms / 1000).toFixed(2) + 's';
}
function fmtScore(s: number | null) {
  if (s === null) return '—';
  return s.toLocaleString();
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

function useCountUp(target: number | null, delay = 400) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === null) return;
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

function StatRow({ label, value, highlight, delay = 0 }: { label: string; value: string; highlight?: boolean; delay?: number }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
      animation: `paigon-stat 0.35s ${delay}s both`,
    }}>
      <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
        {label}
      </span>
      <span style={{ fontSize: '0.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: highlight ? '#22d3ee' : 'rgba(255,255,255,0.75)' }}>
        {value}
      </span>
    </div>
  );
}

export default function ResultScreen({ result, onPlayAgain, solo }: Props) {
  const { won, myTimeMs, myScore, myHits, opponentTimeMs, opponentScore, opponentHits, winnerName } = result;

  useEffect(() => {
    if (document.getElementById('paigon-result-css')) return;
    const el = document.createElement('style');
    el.id = 'paigon-result-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  const accent    = won ? '#00ff88' : '#ff6b6b';
  const accentDim = won ? 'rgba(0,255,136,0.12)' : 'rgba(255,107,107,0.08)';
  const borderCol = won ? 'rgba(0,255,136,0.22)' : 'rgba(255,107,107,0.18)';

  const animatedScore = useCountUp(myScore, 500);

  // ── Solo ─────────────────────────────────────────────────────────────────────
  if (solo) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse 85% 65% at 50% 38%, rgba(34,211,238,0.08) 0%, transparent 70%), #03030a',
        position: 'relative', overflow: 'hidden',
      }}>
        <Particles c1="#22d3ee" c2="#00ff88" n={24} />

        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: 'repeating-linear-gradient(transparent,transparent 2px,rgba(0,0,0,0.025) 2px,rgba(0,0,0,0.025) 4px)',
        }} />

        <div style={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: 420, padding: '44px 40px', margin: '0 16px',
          background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.2)',
          borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 28, textAlign: 'center',
          boxShadow: '0 0 80px rgba(34,211,238,0.08)',
          animation: 'paigon-card-in 0.55s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>
          <div>
            <div style={{
              fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.22em',
              color: 'rgba(34,211,238,0.5)', textTransform: 'uppercase', marginBottom: 10,
              animation: 'paigon-stat 0.35s 0.2s both',
            }}>
              Solo Practice
            </div>
            <div style={{
              fontSize: '3.5rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg, #22d3ee 0%, #00ff88 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              animation: 'paigon-score-in 0.5s 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
            }}>
              {animatedScore.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: 6, letterSpacing: '0.06em', animation: 'paigon-stat 0.35s 0.5s both' }}>
              points
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.025)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', padding: '16px 20px', animation: 'paigon-stat 0.35s 0.55s both' }}>
            <StatRow label="Targets hit" value={`${myHits} / ${NUM_TARGETS}`} highlight delay={0.6} />
            <StatRow label="Time" value={fmtTime(myTimeMs)} delay={0.65} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 7, animation: `paigon-stat 0.35s 0.7s both` }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
                Score formula
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
                hits×1000 − time/10
              </span>
            </div>
          </div>

          <button
            onClick={onPlayAgain}
            style={{
              width: '100%', padding: '14px',
              background: '#22d3ee', color: '#03030a',
              border: 'none', borderRadius: 12,
              fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.04em',
              cursor: 'pointer', fontFamily: 'inherit',
              '--bc': 'rgba(34,211,238,0.7)',
              animation: 'paigon-btn-glow 2.2s 1.2s ease-in-out infinite, paigon-stat 0.35s 0.75s both',
              transition: 'transform 0.12s',
            } as CSSProperties}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)'; }}
            onMouseOut={e => { e.currentTarget.style.transform = ''; }}
          >
            Try Again →
          </button>
          <p style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.15)', margin: 0, animation: 'paigon-stat 0.35s 0.85s both' }}>
            Ready to beat a real opponent? Hit Find Match.
          </p>
        </div>
      </div>
    );
  }

  // ── Multiplayer ───────────────────────────────────────────────────────────────
  const myRow  = { label: 'You',                        score: myScore,       hits: myHits,       timeMs: myTimeMs,       winner: won  };
  const oppRow = { label: winnerName || 'Opponent',     score: opponentScore, hits: opponentHits, timeMs: opponentTimeMs, winner: !won };
  const rows   = won ? [myRow, oppRow] : [oppRow, myRow];

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `radial-gradient(ellipse 85% 65% at 50% 38%, ${won ? 'rgba(0,255,136,0.08)' : 'rgba(255,107,107,0.07)'} 0%, transparent 70%), #03030a`,
      position: 'relative', overflow: 'hidden',
    }}>
      <Particles c1={accent} c2={won ? '#22d3ee' : '#fb923c'} n={won ? 30 : 18} />

      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'repeating-linear-gradient(transparent,transparent 2px,rgba(0,0,0,0.025) 2px,rgba(0,0,0,0.025) 4px)',
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 460, padding: '44px 40px', margin: '0 16px',
        background: 'rgba(255,255,255,0.025)', border: `1px solid ${borderCol}`,
        borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 26, textAlign: 'center',
        boxShadow: `0 0 80px ${won ? 'rgba(0,255,136,0.08)' : 'rgba(255,107,107,0.06)'}`,
        animation: 'paigon-card-in 0.55s cubic-bezier(0.34,1.56,0.64,1) both',
      }}>

        {/* Banner */}
        <div>
          <div style={{
            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.22em',
            color: won ? 'rgba(0,255,136,0.55)' : 'rgba(255,107,107,0.55)',
            textTransform: 'uppercase', marginBottom: 10,
            animation: 'paigon-stat 0.35s 0.2s both',
          }}>
            {won ? 'Victory' : 'Defeated'}
          </div>
          <div style={{
            fontSize: '3rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em',
            background: won
              ? 'linear-gradient(135deg, #00ff88 0%, #22d3ee 100%)'
              : 'linear-gradient(135deg, #ff6b6b 0%, #fb923c 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            animation: `paigon-hl 2.5s 0.6s ease-in-out infinite, paigon-score-in 0.5s 0.3s cubic-bezier(0.34,1.56,0.64,1) both`,
          }}>
            {won ? 'YOU WIN' : 'YOU LOSE'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.25)', marginTop: 8, letterSpacing: '0.04em', animation: 'paigon-stat 0.35s 0.4s both' }}>
            {won ? 'Your score was higher' : `${winnerName} scored higher`}
          </div>
        </div>

        {/* Score cards */}
        <div style={{ display: 'flex', gap: 10 }}>
          {rows.map((r, i) => (
            <div key={i} style={{
              flex: 1, padding: '18px 14px', borderRadius: 14, textAlign: 'center',
              background: r.winner ? accentDim : 'rgba(255,255,255,0.02)',
              border: `1px solid ${r.winner ? borderCol : 'rgba(255,255,255,0.06)'}`,
              boxShadow: r.winner ? `0 0 24px ${accent}18` : 'none',
              animation: `paigon-stat 0.4s ${0.45 + i * 0.1}s both`,
            }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>
                {r.label}
              </div>
              <div style={{
                fontSize: '2.1rem', fontWeight: 900, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                color: r.winner ? accent : 'rgba(255,255,255,0.55)',
                textShadow: r.winner ? `0 0 30px ${accent}88` : 'none',
              }}>
                {fmtScore(r.score)}
              </div>
              <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em', marginTop: 3, marginBottom: 12 }}>pts</div>
              {/* Hits dots */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: 8 }}>
                {Array.from({ length: NUM_TARGETS }, (_, j) => (
                  <div key={j} style={{
                    width: 6, height: 6, borderRadius: 2,
                    background: j < (r.hits ?? 0) ? (r.winner ? accent : 'rgba(255,255,255,0.4)') : 'rgba(255,255,255,0.07)',
                    animation: j < (r.hits ?? 0) ? `paigon-dot-pop 0.3s ${0.6 + j * 0.05}s both` : undefined,
                  }} />
                ))}
              </div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
                {r.hits ?? '?'}/{NUM_TARGETS} hits · {fmtTime(r.timeMs)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.15)', letterSpacing: '0.06em', marginTop: -8, animation: 'paigon-stat 0.35s 0.7s both' }}>
          Score = hits × 1000 − time_ms / 10 · Wild misses add +0.2s penalty
        </div>

        <button
          onClick={onPlayAgain}
          style={{
            width: '100%', padding: '15px',
            background: accent, color: '#03030a',
            border: 'none', borderRadius: 12,
            fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.04em',
            cursor: 'pointer', fontFamily: 'inherit',
            '--bc': accent + 'aa',
            animation: 'paigon-btn-glow 2.2s 1.2s ease-in-out infinite, paigon-stat 0.35s 0.75s both',
            transition: 'transform 0.12s',
          } as CSSProperties}
          onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)'; }}
          onMouseOut={e => { e.currentTarget.style.transform = ''; }}
        >
          Play Again →
        </button>
      </div>
    </div>
  );
}
