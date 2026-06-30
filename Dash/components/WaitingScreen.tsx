const DOT_COLORS = ['#00ff88', '#22d3ee', '#ffd700', '#ff8c00', '#ff0080'];

interface QueueCount { count: number; min: number; max: number; }
interface Props { onLeave: () => void; queueCount?: QueueCount; }

export default function WaitingScreen({ onLeave, queueCount }: Props) {
  const joined = queueCount?.count ?? 1;
  const min = queueCount?.min ?? 3;
  const max = queueCount?.max ?? 5;
  const hasCount = !!queueCount;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, background: '#03030a', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes spin-cw  { to { transform: rotate(360deg) } }
        @keyframes spin-ccw { to { transform: rotate(-360deg) } }
        @keyframes ring-hue { from { filter: hue-rotate(0deg) } to { filter: hue-rotate(360deg) } }
        @keyframes blob-wait-a { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-40px,30px) scale(1.2)} }
        @keyframes blob-wait-b { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(35px,-25px) scale(.85)} }
        @keyframes dot-pop { 0%{transform:scale(.7);opacity:.3} 100%{transform:scale(1);opacity:1} }
        @keyframes rainbow-shift { from{background-position:0% 50%} to{background-position:200% 50%} }
      `}</style>

      {/* Background blobs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,255,136,.13) 0%, transparent 70%)', top: -180, left: -120, animation: 'blob-wait-a 9s ease-in-out infinite, ring-hue 12s linear infinite' }} />
        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,180,255,.11) 0%, transparent 70%)', bottom: -140, right: -100, animation: 'blob-wait-b 10s ease-in-out infinite, ring-hue 9s linear infinite reverse' }} />
        <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,0,128,.09) 0%, transparent 70%)', top: '45%', left: '60%', animation: 'blob-wait-a 11s ease-in-out infinite reverse, ring-hue 8s linear infinite' }} />
      </div>

      {/* Multi-color spinner */}
      <div style={{ position: 'relative', width: 100, height: 100 }}>
        {/* Static rings */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(0,255,136,.1)' }} />
        <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', border: '2px solid rgba(0,180,255,.1)' }} />
        <div style={{ position: 'absolute', inset: 24, borderRadius: '50%', border: '2px solid rgba(255,0,128,.1)' }} />
        {/* Spinning arcs */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid transparent', borderTopColor: '#00ff88', borderRightColor: 'rgba(0,255,136,.4)', animation: 'spin-cw 1s linear infinite', filter: 'drop-shadow(0 0 6px #00ff88)' }} />
        <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', border: '2.5px solid transparent', borderTopColor: '#22d3ee', borderRightColor: 'rgba(34,211,238,.4)', animation: 'spin-ccw 1.4s linear infinite', filter: 'drop-shadow(0 0 6px #22d3ee)' }} />
        <div style={{ position: 'absolute', inset: 24, borderRadius: '50%', border: '2.5px solid transparent', borderTopColor: '#ff0080', borderRightColor: 'rgba(255,0,128,.4)', animation: 'spin-cw 1.8s linear infinite', filter: 'drop-shadow(0 0 6px #ff0080)' }} />
        {/* Center dot */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffd700', boxShadow: '0 0 12px #ffd700, 0 0 24px rgba(255,215,0,.4)', animation: 'ring-hue 3s linear infinite' }} />
        </div>
      </div>

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg,#ff0080,#ffd700,#00ff88,#22d3ee,#ff0080)', backgroundSize: '250% 100%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'rainbow-shift 2.5s linear infinite' }}>
          {hasCount && joined >= min ? 'Lobby Filling…' : 'Finding Runners'}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,.35)', letterSpacing: '0.05em' }}>
          {hasCount ? `${joined} of ${min}–${max} players joined` : 'Waiting for other players…'}
        </div>
      </div>

      {hasCount && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative', zIndex: 1 }}>
          {Array.from({ length: max }).map((_, i) => {
            const filled = i < joined;
            const col = DOT_COLORS[i % DOT_COLORS.length];
            return (
              <div key={i} style={{
                width: filled ? 12 : 8, height: filled ? 12 : 8,
                borderRadius: '50%',
                background: filled ? col : 'rgba(255,255,255,.1)',
                border: filled ? 'none' : '1px solid rgba(255,255,255,.15)',
                transition: 'all .3s ease',
                boxShadow: filled ? `0 0 10px ${col}, 0 0 20px ${col}66` : 'none',
                animation: filled ? `dot-pop .3s ease both` : 'none',
                animationDelay: `${i * 0.05}s`,
              }} />
            );
          })}
        </div>
      )}

      <button onClick={onLeave} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '10px 24px', color: 'rgba(255,255,255,.4)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', position: 'relative', zIndex: 1 }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,0,128,.35)'; e.currentTarget.style.color = 'rgba(255,80,150,.8)'; }}
        onMouseOut={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; e.currentTarget.style.color = 'rgba(255,255,255,.4)'; }}>
        Cancel
      </button>
    </div>
  );
}
