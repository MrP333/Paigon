import { ResultData } from '../types';
import { useEffect, useMemo, useState } from 'react';

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
@keyframes paigon-shake {
  0%,100%{transform:translateX(0)}20%{transform:translateX(-9px)}40%{transform:translateX(9px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}
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
@keyframes paigon-scale-in {
  from { opacity:0; transform:scale(0.88); }
  to   { opacity:1; transform:scale(1); }
}
@keyframes paigon-flash {
  0%   { opacity:0.55; }
  100% { opacity:0; }
}
@keyframes paigon-scanline {
  0%   { top:-2px; opacity:0; }
  3%   { opacity:0.6; }
  97%  { opacity:0.6; }
  100% { top:100%; opacity:0; }
}
`;

interface Props {
  result: ResultData;
  playerName: string;
  solo: boolean;
  stakeId: string;
  onPlayAgain: () => void;
}

function fmt(ms: number | null) {
  if (ms === null) return '—';
  return (ms / 1000).toFixed(2) + 's';
}
function pcLabel(cents: number) {
  const pc = cents / 10;
  return (Number.isInteger(pc) ? pc.toString() : pc.toFixed(1)) + ' PC';
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
    <div style={{ position: 'absolute', left: '50%', top: '38%', pointerEvents: 'none', zIndex: 0 }}>
      {pts.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', width: p.w, height: p.h, borderRadius: p.br, background: p.color,
          '--px': p.px, '--py': p.py, '--pr': p.pr,
          animation: `paigon-pt ${p.dur}s ${p.delay}s ease-out both`,
        } as React.CSSProperties} />
      ))}
    </div>
  );
}

function useCountUp(target: number | null, delay = 500) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === null) return;
    const n = target;
    const t = setTimeout(() => {
      const dur = 1000;
      const start = performance.now();
      function tick() {
        const p = Math.min((performance.now() - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.floor(eased * n));
        if (p < 1) requestAnimationFrame(tick);
        else setVal(n);
      }
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(t);
  }, [target]);
  return val;
}

export default function ResultScreen({ result, playerName, solo, stakeId, onPlayAgain }: Props) {
  const { won, draw, myTimeMs, opponentTimeMs, winnerName, payoutCents, entryCents } = result;
  const isPaid = stakeId && stakeId !== 'free' && (entryCents ?? 0) > 0;

  useEffect(() => {
    if (document.getElementById('paigon-result-css')) return;
    const el = document.createElement('style');
    el.id = 'paigon-result-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  // Animate crossing time count-up (counts up to the actual ms value)
  const animatedMyTime  = useCountUp(myTimeMs,       600);
  const animatedOppTime = useCountUp(opponentTimeMs, 700);

  let headline: string, hc: string, sub: string, isWin: boolean;
  if (solo) {
    if (myTimeMs !== null) {
      headline = 'CROSSED'; hc = '#00ff88'; sub = "You made it across No Man's Land"; isWin = true;
    } else {
      headline = 'K.I.A.'; hc = '#ff3333'; sub = "You were cut down — try again"; isWin = false;
    }
  } else if (draw) {
    headline = 'DRAW'; hc = '#ffaa00'; sub = "Both soldiers fell in No Man's Land"; isWin = false;
  } else if (won) {
    headline = 'VICTORY'; hc = '#00ff88'; sub = 'First to the enemy trench'; isWin = true;
  } else {
    headline = 'DEFEATED'; hc = '#ff3333';
    sub = myTimeMs === null ? "You were cut down in No Man's Land" : `${winnerName} crossed first`;
    isWin = false;
  }

  const hlAnim = headline === 'K.I.A.' || headline === 'DEFEATED'
    ? 'paigon-shake 0.55s 0.45s both'
    : `paigon-hl 2.5s 0.7s ease-in-out infinite`;

  const bgGlow = isWin
    ? 'radial-gradient(ellipse 100% 80% at 50% 30%, rgba(0,255,136,0.11) 0%, transparent 65%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(251,191,36,0.06) 0%, transparent 55%), #03030a'
    : draw
    ? 'radial-gradient(ellipse 90% 70% at 50% 35%, rgba(255,170,0,0.09) 0%, transparent 65%), #03030a'
    : 'radial-gradient(ellipse 100% 80% at 50% 30%, rgba(255,40,40,0.1) 0%, transparent 65%), radial-gradient(ellipse 50% 35% at 20% 80%, rgba(200,30,30,0.06) 0%, transparent 50%), #03030a';

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: bgGlow, position: 'relative', overflow: 'hidden',
    }}>
      <Particles c1={hc} c2={isWin ? '#ffd700' : draw ? '#ffaa00' : '#ff6b6b'} n={isWin ? 36 : draw ? 16 : 20} />

      {/* Scanline */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 1, pointerEvents: 'none', zIndex: 0,
        background: `linear-gradient(90deg, transparent, ${hc}55 40%, ${hc}99 50%, ${hc}55 60%, transparent)`,
        animation: 'paigon-scanline 4s linear infinite',
      }} />

      {/* Screen flash on load */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: isWin ? 'rgba(0,255,136,0.06)' : 'rgba(255,40,40,0.06)',
        animation: 'paigon-flash 0.6s 0.15s both',
      }} />

      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'repeating-linear-gradient(transparent,transparent 2px,rgba(0,0,0,0.022) 2px,rgba(0,0,0,0.022) 4px)',
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        animation: 'paigon-card-in 0.55s cubic-bezier(0.34,1.56,0.64,1) both',
        padding: '0 20px', maxWidth: 480, width: '100%',
      }}>
        <div style={{
          fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.32em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.15)', marginBottom: 16,
          animation: 'paigon-stat 0.4s 0.2s both',
        }}>
          No Man's Land · Result
        </div>

        {/* Main headline */}
        <div style={{
          fontSize: 'clamp(3.2rem,11vw,5.5rem)', fontWeight: 900,
          letterSpacing: '0.1em', color: hc,
          textShadow: `0 0 80px ${hc}66, 0 0 160px ${hc}33`,
          animation: hlAnim, marginBottom: 6, lineHeight: 1,
        }}>
          {headline}
        </div>

        <div style={{
          fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', marginBottom: 24,
          animation: 'paigon-stat 0.4s 0.35s both', letterSpacing: '0.04em',
        }}>
          {sub}
        </div>

        {/* Payout row */}
        {isPaid && !solo && (
          <div style={{
            marginBottom: 20, padding: '12px 28px', borderRadius: 14,
            border: `1px solid ${won ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.07)'}`,
            background: won ? 'rgba(0,255,136,0.07)' : 'rgba(255,255,255,0.025)',
            display: 'flex', gap: 28, textAlign: 'center',
            boxShadow: won ? '0 0 40px rgba(0,255,136,0.12)' : 'none',
            animation: 'paigon-scale-in 0.4s 0.45s both',
          }}>
            {won && payoutCents ? (
              <div>
                <div style={{ fontSize: '0.54rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 5 }}>Won</div>
                <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#00ff88', textShadow: '0 0 32px rgba(0,255,136,0.6)', letterSpacing: '-0.02em' }}>+{pcLabel(payoutCents)}</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '0.54rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 5 }}>Lost</div>
                <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#ff4444', textShadow: '0 0 28px rgba(255,68,68,0.45)', letterSpacing: '-0.02em' }}>-{pcLabel(entryCents ?? 0)}</div>
              </div>
            )}
            {entryCents ? (
              <div>
                <div style={{ fontSize: '0.54rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 5 }}>Staked</div>
                <div style={{ fontSize: '1.9rem', fontWeight: 900, color: 'rgba(255,255,255,0.4)', letterSpacing: '-0.02em' }}>{pcLabel(entryCents)}</div>
              </div>
            ) : null}
          </div>
        )}

        {/* Time cards — legacy 2-player layout */}
        {!result.players && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 28, width: '100%', justifyContent: 'center', animation: 'paigon-stat 0.4s 0.5s both' }}>
            <div style={{
              flex: 1, maxWidth: 180,
              background: won || (solo && myTimeMs !== null) ? `${hc}0d` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${won || (solo && myTimeMs !== null) ? hc + '40' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 14, padding: '16px 20px', textAlign: 'center',
              boxShadow: won || (solo && myTimeMs !== null) ? `0 0 28px ${hc}18` : 'none',
            }}>
              <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 10 }}>
                {solo ? 'Your Time' : playerName}
              </div>
              <div style={{
                fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                color: myTimeMs !== null ? (won || solo ? hc : 'rgba(255,255,255,0.7)') : '#ff4444',
                textShadow: myTimeMs !== null && (won || solo) ? `0 0 24px ${hc}88` : 'none',
              }}>
                {myTimeMs !== null ? fmt(animatedMyTime) : 'KIA'}
              </div>
              {myTimeMs !== null && (won || solo) && (
                <div style={{ fontSize: '0.58rem', color: hc, fontWeight: 700, marginTop: 6, letterSpacing: '0.08em', opacity: 0.7 }}>
                  ★ FASTEST
                </div>
              )}
            </div>

            {!solo && (
              <div style={{
                flex: 1, maxWidth: 180,
                background: !won && !draw ? `rgba(0,255,136,0.06)` : 'rgba(255,255,255,0.025)',
                border: `1px solid ${!won && !draw ? 'rgba(0,255,136,0.25)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 14, padding: '16px 20px', textAlign: 'center',
                boxShadow: !won && !draw ? '0 0 24px rgba(0,255,136,0.1)' : 'none',
              }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 10 }}>
                  {winnerName || 'Opponent'}
                </div>
                <div style={{
                  fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                  color: opponentTimeMs !== null ? (!won && !draw ? '#00ff88' : 'rgba(255,255,255,0.5)') : 'rgba(255,255,255,0.3)',
                  textShadow: !won && !draw && opponentTimeMs !== null ? '0 0 24px rgba(0,255,136,0.7)' : 'none',
                }}>
                  {opponentTimeMs !== null ? fmt(animatedOppTime) : 'KIA'}
                </div>
                {!won && !draw && opponentTimeMs !== null && (
                  <div style={{ fontSize: '0.58rem', color: '#00ff88', fontWeight: 700, marginTop: 6, letterSpacing: '0.08em', opacity: 0.7 }}>
                    ★ FASTEST
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Leaderboard (N-player) */}
        {!solo && result.players && result.players.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginBottom: 28, animation: 'paigon-stat 0.4s 0.5s both' }}>
            <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: 4, textAlign: 'left' }}>
              Final Standings
            </div>
            {result.players.map((p, i) => {
              const isMe = myTimeMs !== null
                ? (p.crossed && p.timeMs === myTimeMs)
                : (!p.crossed && p.name === playerName);
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 10,
                  background: p.won ? 'rgba(0,255,136,0.06)' : isMe ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${p.won ? 'rgba(0,255,136,0.25)' : isMe ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
                  animation: `paigon-stat 0.35s ${0.55 + i * 0.07}s both`,
                }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, fontFamily: 'monospace', color: p.won ? '#00ff88' : 'rgba(255,255,255,0.25)', width: 18, textAlign: 'center' }}>
                    #{p.rank}
                  </span>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: 'left', fontSize: '0.8rem', fontWeight: 700, color: p.won ? '#00ff88' : isMe ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)' }}>
                    {p.name}{isMe ? ' (you)' : ''}
                  </span>
                  {p.won && (
                    <span style={{ fontSize: '0.58rem', color: '#00ff88', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.7 }}>★ FASTEST</span>
                  )}
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: p.crossed ? (p.won ? '#00ff88' : 'rgba(255,255,255,0.5)') : '#ff4444', minWidth: 44, textAlign: 'right' }}>
                    {p.timeMs !== null ? fmt(p.timeMs) : 'KIA'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={onPlayAgain}
          style={{
            padding: '13px 52px', borderRadius: 12, border: 'none',
            background: hc, color: isWin ? '#000' : '#fff',
            fontSize: '0.92rem', fontWeight: 800, letterSpacing: '0.06em',
            cursor: 'pointer', fontFamily: 'inherit',
            '--bc': hc + 'aa',
            animation: 'paigon-btn-glow 2.2s 1.1s ease-in-out infinite, paigon-stat 0.4s 0.68s both',
            transition: 'transform 0.12s',
          } as React.CSSProperties}
          onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.04)'; }}
          onMouseOut={e => { e.currentTarget.style.transform = ''; }}
        >
          {isWin ? 'Play Again →' : 'Try Again →'}
        </button>
      </div>
    </div>
  );
}
