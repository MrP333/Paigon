interface Props { onLeave: () => void; }

export default function WaitingScreen({ onLeave }: Props) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 32,
      background: '#03030a',
    }}>
      {/* Animated ring */}
      <div style={{ position: 'relative', width: 80, height: 80 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid rgba(34,211,238,0.15)',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: '#22d3ee',
          animation: 'spin 1s linear infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 10, borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: 'rgba(34,211,238,0.4)',
          animation: 'spin 1.5s linear infinite reverse',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: 8 }}>
          Finding Opponent
        </div>
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>
          Matching you with another player…
        </div>
      </div>

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
