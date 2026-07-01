import { useEffect, useMemo, useState, CSSProperties } from 'react';
import { ResultData, GameConfig } from '../types';

const CSS = `
@keyframes ts-card-in { 0%{opacity:0;transform:scale(.82) translateY(28px)} 65%{opacity:1;transform:scale(1.03) translateY(-5px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
@keyframes ts-stat-in { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
@keyframes ts-score-in { 0%{opacity:0;transform:scale(.5)} 70%{opacity:1;transform:scale(1.1)} 100%{opacity:1;transform:scale(1)} }
@keyframes ts-hl { 0%,100%{filter:drop-shadow(0 0 20px currentColor) brightness(1)} 50%{filter:drop-shadow(0 0 55px currentColor) brightness(1.4)} }
@keyframes ts-pt { 0%{opacity:1;transform:translate(-50%,-50%) scale(1)} 100%{opacity:0;transform:translate(calc(-50% + var(--px)),calc(-50% + var(--py))) scale(0.1) rotate(var(--pr))} }
@keyframes rainbow-shift { from{background-position:0% 50%} to{background-position:200% 50%} }
@keyframes ts-blob-a { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-35px,30px) scale(1.2)} }
@keyframes ts-blob-b { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(30px,-25px) scale(.85)} }
@property --border-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
@keyframes spin-border { to{--border-angle:360deg} }
.ts-result-win {
  padding: 1.5px; border-radius: 22px;
  background: conic-gradient(from var(--border-angle),#00ff88,#22d3ee,#ffd700,#ff0080,#8844ff,#00ff88);
  animation: spin-border 3s linear infinite;
}
.ts-result-lose {
  padding: 1.5px; border-radius: 22px;
  background: conic-gradient(from var(--border-angle),#ff3300,#ff0080,#8800ff,#0044ff,#ff3300);
  animation: spin-border 4s linear infinite;
}
.ts-win-text {
  background: linear-gradient(135deg,#00ff88,#22d3ee,#ffd700,#ff0080,#8844ff,#00ff88);
  background-size: 250% 100%;
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  animation: rainbow-shift 1.8s linear infinite;
}
.ts-rainbow-text {
  background: linear-gradient(90deg,#00ff88,#22d3ee,#8844ff,#ff0080,#ffd700,#00ff88);
  background-size: 250% 100%;
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  animation: rainbow-shift 2.5s linear infinite;
}
.ts-play-btn {
  background: linear-gradient(135deg,#00ff88,#22d3ee,#8844ff,#ff0080,#ffd700,#00ff88);
  background-size: 250% 100%;
  animation: rainbow-shift 2s linear infinite;
  border: none;
}
.ts-play-btn:hover { filter: brightness(1.15); transform: translateY(-2px) scale(1.02) !important; }
`;

const PALETTE = ['#00ff88','#22d3ee','#ffd700','#ff0080','#8844ff','#ffffff'];

function makeParticles(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + (Math.random() - .5) * .8;
    const d = 60 + Math.random() * 180;
    return {
      px: `${Math.cos(a) * d}px`, py: `${Math.sin(a) * d}px`,
      pr: `${(Math.random() - .5) * 900}deg`,
      w: 3 + Math.random() * 9, h: 2 + Math.random() * 6,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      delay: Math.random() * .5, dur: .4 + Math.random() * .6,
      br: Math.random() > .4 ? '50%' : '2px',
    };
  });
}

function Particles({ n }: { n: number }) {
  const pts = useMemo(() => makeParticles(n), [n]);
  return (
    <div style={{ position: 'absolute', left: '50%', top: '30%', pointerEvents: 'none', zIndex: 0 }}>
      {pts.map((p, i) => (
        <div key={i} style={{ position: 'absolute', width: p.w, height: p.h, borderRadius: p.br, background: p.color, '--px': p.px, '--py': p.py, '--pr': p.pr, animation: `ts-pt ${p.dur}s ${p.delay}s ease-out both` } as CSSProperties} />
      ))}
    </div>
  );
}

function fmtMs(ms: number | null) {
  if (ms === null || ms === undefined) return '—';
  const s = Math.floor(ms / 1000);
  const d = Math.floor((ms % 1000) / 10);
  return `${s}.${d.toString().padStart(2, '0')}s`;
}

interface Props {
  result: ResultData;
  onPlayAgain: () => void;
  solo?: boolean;
  config?: GameConfig | null;
}

export default function ResultScreen({ result, onPlayAgain, solo }: Props) {
  const { won, myWpm, myAccuracy, myFinishMs, players } = result;

  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 60); return () => clearTimeout(t); }, []);

  useEffect(() => {
    if (document.getElementById('ts-result-css')) return;
    const el = document.createElement('style'); el.id = 'ts-result-css'; el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  const cardClass = won ? 'ts-result-win' : 'ts-result-lose';

  if (solo) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#08080f', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,255,136,.12) 0%, transparent 65%)', top: -160, left: -120, animation: 'ts-blob-a 9s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,.09) 0%, transparent 65%)', bottom: -130, right: -100, animation: 'ts-blob-b 11s ease-in-out infinite' }} />
        </div>
        <Particles n={24} />

        <div className="ts-result-win" style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, margin: '0 16px', opacity: show ? 1 : 0, transition: 'opacity .3s', animation: show ? 'ts-card-in .55s cubic-bezier(.34,1.56,.64,1) both' : 'none' }}>
          <div style={{ background: 'rgba(6,6,14,.94)', borderRadius: '20.5px', padding: '40px 36px', display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'center' }}>

            <div>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(0,255,136,.55)', textTransform: 'uppercase', marginBottom: 8, animation: 'ts-stat-in .35s .2s both' }}>Solo Practice</div>
              <div className="ts-rainbow-text" style={{ fontSize: '3.4rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em', animation: 'ts-score-in .5s .35s cubic-bezier(.34,1.56,.64,1) both' }}>
                {myWpm} WPM
              </div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,.3)', marginTop: 4, letterSpacing: '0.06em', animation: 'ts-stat-in .35s .45s both' }}>words per minute</div>
            </div>

            <div style={{ display: 'flex', gap: 12, animation: 'ts-stat-in .35s .5s both' }}>
              <div style={{ flex: 1, padding: '14px 12px', borderRadius: 12, background: 'rgba(0,255,136,.06)', border: '1px solid rgba(0,255,136,.18)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#00ff88', lineHeight: 1 }}>{myAccuracy}%</div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,.3)', marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Accuracy</div>
              </div>
              <div style={{ flex: 1, padding: '14px 12px', borderRadius: 12, background: 'rgba(34,211,238,.06)', border: '1px solid rgba(34,211,238,.18)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#22d3ee', lineHeight: 1 }}>{fmtMs(myFinishMs)}</div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,.3)', marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Time</div>
              </div>
            </div>

            <button onClick={onPlayAgain} className="ts-play-btn" style={{ width: '100%', padding: '14px', color: '#06060e', borderRadius: 12, fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.04em', cursor: 'pointer', fontFamily: 'inherit', transition: 'transform .12s', animation: 'ts-stat-in .35s .65s both' }}>
              Practice Again →
            </button>
            <p style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,.14)', margin: 0 }}>Ready to race real opponents? Hit Find Match.</p>
          </div>
        </div>
      </div>
    );
  }

  const RANK_COLORS = ['#ffd700', '#22d3ee', '#ff8c00', '#ff0080'];

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#08080f', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', width: 550, height: 550, borderRadius: '50%', background: `radial-gradient(circle, ${won ? 'rgba(0,255,136,.11)' : 'rgba(255,0,128,.08)'} 0%, transparent 65%)`, top: -180, left: -130, animation: 'ts-blob-a 9s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', width: 450, height: 450, borderRadius: '50%', background: `radial-gradient(circle, ${won ? 'rgba(34,211,238,.09)' : 'rgba(136,0,255,.07)'} 0%, transparent 65%)`, bottom: -140, right: -110, animation: 'ts-blob-b 11s ease-in-out infinite' }} />
      </div>

      <Particles n={won ? 42 : 20} />

      <div className={cardClass} style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 500, margin: '0 16px', opacity: show ? 1 : 0, transition: 'opacity .3s', animation: show ? 'ts-card-in .55s cubic-bezier(.34,1.56,.64,1) both' : 'none' }}>
        <div style={{ background: 'rgba(6,6,14,.94)', borderRadius: '20.5px', padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 18, textAlign: 'center', maxHeight: '90vh', overflowY: 'auto' }}>

          {/* Win / Lose header */}
          <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', color: won ? 'rgba(0,255,136,.55)' : 'rgba(255,0,128,.55)', textTransform: 'uppercase', marginBottom: 8, animation: 'ts-stat-in .35s .15s both' }}>
              {won ? 'Victory' : 'Defeated'}
            </div>
            {won ? (
              <div className="ts-win-text" style={{ fontSize: '2.8rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em', animation: 'ts-score-in .5s .25s cubic-bezier(.34,1.56,.64,1) both' }}>
                YOU WIN
              </div>
            ) : (
              <div style={{ fontSize: '2.8rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em', background: 'linear-gradient(135deg,#ff4444,#ff0080)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'ts-hl 2.8s .5s ease-in-out infinite, ts-score-in .5s .25s cubic-bezier(.34,1.56,.64,1) both' }}>
                YOU LOSE
              </div>
            )}
          </div>

          {/* My stats summary */}
          <div style={{ display: 'flex', gap: 10, animation: 'ts-stat-in .35s .35s both' }}>
            <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'rgba(0,255,136,.05)', border: '1px solid rgba(0,255,136,.15)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#00ff88', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{myWpm}</div>
              <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,.28)', marginTop: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>WPM</div>
            </div>
            <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'rgba(34,211,238,.05)', border: '1px solid rgba(34,211,238,.15)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#22d3ee', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{myAccuracy}%</div>
              <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,.28)', marginTop: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Acc</div>
            </div>
            <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: 'rgba(255,255,255,.7)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtMs(myFinishMs)}</div>
              <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,.28)', marginTop: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Time</div>
            </div>
          </div>

          {/* Leaderboard */}
          {players.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, animation: 'ts-stat-in .35s .45s both' }}>
              <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.18)', marginBottom: 2, display: 'grid', gridTemplateColumns: '24px 10px 1fr 52px 46px 52px', gap: '0 10px', textAlign: 'right' }}>
                <span style={{ textAlign: 'center' }}>#</span>
                <span />
                <span style={{ textAlign: 'left' }}>Player</span>
                <span>WPM</span>
                <span>Acc</span>
                <span>Time</span>
              </div>
              {players.map((p, i) => {
                const rankCol = RANK_COLORS[(p.rank - 1) % RANK_COLORS.length];
                const rowBg = p.won
                  ? 'rgba(0,255,136,.06)'
                  : p.isMe ? 'rgba(34,211,238,.04)' : 'rgba(255,255,255,.02)';
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 10px 1fr 52px 46px 52px', gap: '0 10px', alignItems: 'center', padding: '9px 12px', borderRadius: 10, background: rowBg, border: `1px solid ${rankCol}22`, animation: `ts-stat-in .35s ${.5 + i * .07}s both` }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, fontFamily: 'monospace', color: rankCol, textAlign: 'center', textShadow: `0 0 8px ${rankCol}66` }}>#{p.rank}</span>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, boxShadow: `0 0 6px ${p.color}` }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: p.won ? '#00ff88' : p.isMe ? '#22d3ee' : 'rgba(255,255,255,.5)', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}{p.isMe ? ' (you)' : ''}
                    </span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: rankCol, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.finishMs !== null ? p.wpm : '—'}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,.45)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.finishMs !== null ? `${p.accuracy}%` : '—'}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: p.won ? '#00ff88' : 'rgba(255,255,255,.4)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMs(p.finishMs)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,.14)', letterSpacing: '0.06em', marginTop: -4, animation: 'ts-stat-in .35s .7s both' }}>
            Ranked by finish time · same passage for all players
          </div>

          <button onClick={onPlayAgain} className="ts-play-btn" style={{ width: '100%', padding: '14px', color: '#06060e', borderRadius: 12, fontSize: '0.92rem', fontWeight: 800, letterSpacing: '0.04em', cursor: 'pointer', fontFamily: 'inherit', transition: 'transform .12s', animation: 'ts-stat-in .35s .75s both' }}>
            Play Again →
          </button>
        </div>
      </div>
    </div>
  );
}
