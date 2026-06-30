interface QueueCount { count: number; min: number; max: number; }
interface Props { onLeave: () => void; queueCount?: QueueCount; accentColor?: string; }

export default function WaitingScreen({ onLeave, queueCount, accentColor = '#a855f7' }: Props) {
  const joined = queueCount?.count ?? 1;
  const min = queueCount?.min ?? 3;
  const max = queueCount?.max ?? 5;
  const hasCount = !!queueCount;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 28,
      background: '#03030a',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Animated ring */}
      <div style={{ position: 'relative', width: 80, height: 80 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${accentColor}26` }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: accentColor, animation: 'spin 1s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', border: '2px solid transparent', borderTopColor: `${accentColor}66`, animation: 'spin 1.5s linear infinite reverse' }} />
      </div>

      {/* Status text */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: 8 }}>
          {hasCount && joined >= min ? 'Lobby Filling…' : 'Finding Players'}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>
          {hasCount
            ? `${joined} of ${min}–${max} players joined`
            : 'Waiting for other players…'}
        </div>
      </div>

      {/* Player dots indicator */}
      {hasCount && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {Array.from({ length: max }).map((_, i) => (
            <div key={i} style={{
              width: i < joined ? 10 : 8,
              height: i < joined ? 10 : 8,
              borderRadius: '50%',
              background: i < joined ? accentColor : 'rgba(255,255,255,0.1)',
              border: i < joined ? 'none' : '1px solid rgba(255,255,255,0.15)',
              transition: 'all 0.3s ease',
              boxShadow: i < joined ? `0 0 8px ${accentColor}80` : 'none',
            }} />
          ))}
        </div>
      )}

      <button
        onClick={onLeave}
        style={{
          background: 'none', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, padding: '10px 24px',
          color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
        }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
      >
        Cancel
      </button>
    </div>
  );
}
