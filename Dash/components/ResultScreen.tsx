import { useEffect, useMemo, useState, CSSProperties } from 'react';
import { ResultData } from '../types';

const CSS = `
@keyframes dash-card-in { 0%{opacity:0;transform:scale(.82) translateY(28px)} 65%{opacity:1;transform:scale(1.03) translateY(-5px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
@keyframes dash-hl { 0%,100%{filter:drop-shadow(0 0 20px currentColor) brightness(1)} 50%{filter:drop-shadow(0 0 55px currentColor) brightness(1.4)} }
@keyframes dash-stat { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
@keyframes dash-btn-glow { 0%,100%{box-shadow:0 0 22px var(--bc),0 4px 14px var(--bc)} 50%{box-shadow:0 0 55px var(--bc),0 0 100px var(--bc)66} }
@keyframes dash-pt { 0%{opacity:1;transform:translate(-50%,-50%) scale(1)} 100%{opacity:0;transform:translate(calc(-50% + var(--px)),calc(-50% + var(--py))) scale(0.1) rotate(var(--pr))} }
@keyframes dash-score-in { 0%{opacity:0;transform:scale(.5)} 70%{opacity:1;transform:scale(1.1)} 100%{opacity:1;transform:scale(1)} }
@keyframes rainbow-shift { from{background-position:0% 50%} to{background-position:200% 50%} }
@keyframes result-blob-a { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-35px,30px) scale(1.2)} }
@keyframes result-blob-b { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(30px,-25px) scale(.85)} }
@property --border-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
@keyframes spin-border { to{--border-angle:360deg} }
.result-card-win {
  padding: 1.5px; border-radius: 22px;
  background: conic-gradient(from var(--border-angle),#ff0080,#ff6600,#ffd700,#00ff88,#00ccff,#8844ff,#ff0080);
  animation: spin-border 3s linear infinite;
}
.result-card-lose {
  padding: 1.5px; border-radius: 22px;
  background: conic-gradient(from var(--border-angle),#ff3300,#ff0080,#8800ff,#0044ff,#ff3300);
  animation: spin-border 4s linear infinite;
}
.result-win-text {
  background: linear-gradient(135deg,#ff0080,#ff6600,#ffd700,#00ff88,#22d3ee,#8844ff,#ff0080);
  background-size: 250% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: rainbow-shift 1.8s linear infinite;
  filter: drop-shadow(0 0 30px rgba(255,215,0,.5));
}
.result-time-rainbow {
  background: linear-gradient(90deg,#00ff88,#22d3ee,#8844ff,#ff0080,#ffd700,#00ff88);
  background-size: 250% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: rainbow-shift 2.5s linear infinite;
}
.result-play-btn {
  background: linear-gradient(135deg,#ff0080,#ff6600,#ffd700,#00ff88,#22d3ee,#8844ff,#ff0080);
  background-size: 250% 100%;
  animation: rainbow-shift 2s linear infinite;
  border: none;
}
.result-play-btn:hover { filter: brightness(1.15) saturate(1.1); transform: translateY(-2px) scale(1.02) !important; }
`;

const PARTICLE_PALETTE = ['#ff0080', '#ff6600', '#ffd700', '#00ff88', '#22d3ee', '#8844ff', '#ffffff'];

function fmt(ms: number | null) {
  if (ms === null || ms === undefined) return '—';
  const s = Math.floor(ms / 1000);
  const d = Math.floor((ms % 1000) / 10);
  return `${s}.${d.toString().padStart(2, '0')}s`;
}

function makeParticles(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
    const d = 60 + Math.random() * 180;
    return {
      px: `${Math.cos(a) * d}px`, py: `${Math.sin(a) * d}px`,
      pr: `${(Math.random() - 0.5) * 900}deg`,
      w: 3 + Math.random() * 10, h: 2 + Math.random() * 7,
      color: PARTICLE_PALETTE[Math.floor(Math.random() * PARTICLE_PALETTE.length)],
      delay: Math.random() * 0.5, dur: 0.45 + Math.random() * 0.65,
      br: Math.random() > 0.4 ? '50%' : '2px',
    };
  });
}

function Particles({ n }: { n: number }) {
  const pts = useMemo(() => makeParticles(n), []);
  return (
    <div style={{ position: 'absolute', left: '50%', top: '35%', pointerEvents: 'none', zIndex: 0 }}>
      {pts.map((p, i) => (
        <div key={i} style={{ position: 'absolute', width: p.w, height: p.h, borderRadius: p.br, background: p.color, '--px': p.px, '--py': p.py, '--pr': p.pr, animation: `dash-pt ${p.dur}s ${p.delay}s ease-out both` } as CSSProperties} />
      ))}
    </div>
  );
}

interface Props {
  result: ResultData;
  onPlayAgain: () => void;
  solo?: boolean;
}

export default function ResultScreen({ result, onPlayAgain, solo }: Props) {
  const { won, myFinishTimeMs, winnerName } = result;

  useEffect(() => {
    if (document.getElementById('dash-result-css')) return;
    const el = document.createElement('style'); el.id = 'dash-result-css'; el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  if (solo) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03030a', position: 'relative', overflow: 'hidden' }}>
        {/* Background blobs */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,255,136,.14) 0%, transparent 65%)', top: -160, left: -120, animation: 'result-blob-a 9s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,.11) 0%, transparent 65%)', bottom: -130, right: -100, animation: 'result-blob-b 11s ease-in-out infinite' }} />
        </div>

        <Particles n={28} />

        <div className="result-card-win" style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, margin: '0 16px', animation: 'dash-card-in .55s cubic-bezier(.34,1.56,.64,1) both' }}>
          <div style={{ background: 'rgba(4,4,14,.92)', borderRadius: '20.5px', padding: '40px 36px', display: 'flex', flexDirection: 'column', gap: 22, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(0,255,136,.55)', textTransform: 'uppercase' as const, marginBottom: 10, animation: 'dash-stat .35s .2s both' }}>Solo Practice</div>
              <div className="result-time-rainbow" style={{ fontSize: '3.8rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em', animation: 'dash-score-in .5s .4s cubic-bezier(.34,1.56,.64,1) both' }}>
                {fmt(myFinishTimeMs)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,.3)', marginTop: 6, letterSpacing: '0.06em', animation: 'dash-stat .35s .5s both' }}>finish time</div>
            </div>

            <button onClick={onPlayAgain} className="result-play-btn" style={{ width: '100%', padding: '14px', color: '#03030a', borderRadius: 12, fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.04em', cursor: 'pointer', fontFamily: 'inherit', transition: 'transform .12s', animation: 'dash-stat .35s .75s both' }}
              onMouseOut={e => { e.currentTarget.style.transform = ''; }}>
              Run Again →
            </button>
            <p style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,.15)', margin: 0 }}>Ready to race real opponents? Hit Find Match.</p>
          </div>
        </div>
      </div>
    );
  }

  const players = result.players ?? [];
  const cardClass = won ? 'result-card-win' : 'result-card-lose';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03030a', position: 'relative', overflow: 'hidden' }}>
      {/* Background blobs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', width: 550, height: 550, borderRadius: '50%', background: `radial-gradient(circle, ${won ? 'rgba(0,255,136,.12)' : 'rgba(255,0,128,.09)'} 0%, transparent 65%)`, top: -180, left: -130, animation: 'result-blob-a 9s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', width: 450, height: 450, borderRadius: '50%', background: `radial-gradient(circle, ${won ? 'rgba(34,211,238,.10)' : 'rgba(136,0,255,.08)'} 0%, transparent 65%)`, bottom: -140, right: -110, animation: 'result-blob-b 11s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,215,0,.07) 0%, transparent 65%)', top: '40%', left: '55%', animation: 'result-blob-a 13s ease-in-out infinite reverse' }} />
      </div>

      <Particles n={won ? 44 : 22} />

      <div className={cardClass} style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 480, margin: '0 16px', animation: 'dash-card-in .55s cubic-bezier(.34,1.56,.64,1) both' }}>
        <div style={{ background: 'rgba(4,4,14,.92)', borderRadius: '20.5px', padding: '36px 32px', display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'center', maxHeight: '90vh', overflowY: 'auto' }}>

          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.22em', color: won ? 'rgba(0,255,136,.55)' : 'rgba(255,0,128,.55)', textTransform: 'uppercase' as const, marginBottom: 10, animation: 'dash-stat .35s .2s both' }}>
              {won ? 'Victory' : 'Defeated'}
            </div>
            {won ? (
              <div className="result-win-text" style={{ fontSize: '3rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em', animation: 'dash-score-in .5s .3s cubic-bezier(.34,1.56,.64,1) both' }}>
                YOU WIN
              </div>
            ) : (
              <div style={{ fontSize: '3rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em', background: 'linear-gradient(135deg, #ff4444 0%, #ff0080 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'dash-hl 2.8s .6s ease-in-out infinite, dash-score-in .5s .3s cubic-bezier(.34,1.56,.64,1) both', filter: 'drop-shadow(0 0 20px rgba(255,0,128,.5))' }}>
                YOU LOSE
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,.25)', marginTop: 8, letterSpacing: '0.04em', animation: 'dash-stat .35s .4s both' }}>
              {won ? (
                <span className="result-time-rainbow">{fmt(myFinishTimeMs)}</span>
              ) : (
                `${winnerName} finished first`
              )}
            </div>
          </div>

          {players.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, animation: 'dash-stat .35s .45s both' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,.2)', marginBottom: 4 }}>Final Standings</div>
              {players.map((p, i) => {
                const isMe = Math.abs((p.finishTimeMs ?? 0) - (myFinishTimeMs ?? 0)) < 50;
                const RANK_COLORS = ['#ffd700', '#22d3ee', '#ff8c00', '#ff0080'];
                const rankCol = RANK_COLORS[(p.rank - 1) % RANK_COLORS.length];
                const rowBg = p.won
                  ? 'rgba(0,255,136,.06)'
                  : isMe ? 'rgba(34,211,238,.05)' : 'rgba(255,255,255,.025)';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, background: rowBg, border: `1px solid ${rankCol}22`, animation: `dash-stat .35s ${0.5 + i * 0.07}s both` }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, fontFamily: 'monospace', color: rankCol, width: 18, flexShrink: 0, textAlign: 'center', textShadow: `0 0 8px ${rankCol}88` }}>#{p.rank}</span>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, flexShrink: 0, boxShadow: `0 0 8px ${p.color}` }} />
                    <span style={{ flex: 1, textAlign: 'left', fontSize: '0.82rem', fontWeight: 700, color: p.won ? '#00ff88' : isMe ? '#22d3ee' : 'rgba(255,255,255,.55)' }}>{p.name}{isMe ? ' (you)' : ''}</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: rankCol }}>{fmt(p.finishTimeMs)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,.15)', letterSpacing: '0.06em', marginTop: -4, animation: 'dash-stat .35s .7s both' }}>
            Ranked by finish time · faster = better
          </div>

          <button onClick={onPlayAgain} className="result-play-btn" style={{ width: '100%', padding: '15px', color: '#03030a', borderRadius: 12, fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.04em', cursor: 'pointer', fontFamily: 'inherit', transition: 'transform .12s', animation: 'dash-stat .35s .75s both' }}
            onMouseOut={e => { e.currentTarget.style.transform = ''; }}>
            Play Again →
          </button>
        </div>
      </div>
    </div>
  );
}
