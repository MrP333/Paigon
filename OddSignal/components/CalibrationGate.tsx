import { useState } from 'react';

const PURPLE = '#a855f7';

const CSS = `
@keyframes os-pulse {
  0%,100% { box-shadow: 0 0 32px rgba(168,85,247,0.35), 0 0 0 0 rgba(168,85,247,0.2); }
  50%      { box-shadow: 0 0 52px rgba(168,85,247,0.55), 0 0 0 18px rgba(168,85,247,0); }
}
@keyframes os-check-pop { from{transform:scale(0.2) rotate(-15deg);opacity:0} to{transform:scale(1) rotate(0);opacity:1} }
@keyframes os-label-in  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
@keyframes os-cursor-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
`;

export default function CalibrationGate({ onComplete }: { onComplete: () => void }) {
  const [clicked, setClicked] = useState(false);

  function handleClick() {
    if (clicked) return;
    setClicked(true);
    setTimeout(() => {
      const el = document.getElementById('os-gate-root');
      if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.6s ease-out'; }
      setTimeout(onComplete, 620);
    }, 480);
  }

  return (
    <div
      id="os-gate-root"
      onClick={handleClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#03030a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Space Grotesk', sans-serif",
        cursor: clicked ? 'default' : 'pointer',
        userSelect: 'none',
      }}
    >
      <style>{CSS}</style>

      {/* Radial glow */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(168,85,247,0.07) 0%, transparent 70%)' }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>

        {/* Label */}
        <div style={{ fontSize: '0.57rem', fontWeight: 700, letterSpacing: '0.26em', color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase' }}>
          Paigon · Odd Signal
        </div>

        {!clicked ? (
          <>
            {/* Click target */}
            <div style={{
              width: 88, height: 88, borderRadius: '50%',
              background: 'rgba(168,85,247,0.1)',
              border: `2px solid ${PURPLE}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'os-pulse 1.8s ease-in-out infinite',
            }}>
              {/* Cursor SVG */}
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ animation: 'os-cursor-bob 1.4s ease-in-out infinite' }}>
                <path d="M8 4L8 22L13 17L16 24L18.5 23L15.5 16L22 16L8 4Z" fill={PURPLE} stroke="rgba(168,85,247,0.4)" strokeWidth="1" />
              </svg>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.01em', marginBottom: 6 }}>
                Click anywhere to begin
              </div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.32)', fontWeight: 500 }}>
                Confirm your mouse is ready
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Checkmark */}
            <div style={{
              width: 88, height: 88, borderRadius: '50%',
              background: 'rgba(0,255,136,0.1)',
              border: '2.5px solid #00ff88',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 50px rgba(0,255,136,0.3)',
              animation: 'os-check-pop 0.38s cubic-bezier(0.34,1.56,0.64,1)',
            }}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <path d="M8 18L15.5 25.5L28 11" stroke="#00ff88" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'rgba(0,255,136,0.8)', letterSpacing: '0.04em', animation: 'os-label-in 0.3s ease-out' }}>
              Ready
            </div>
          </>
        )}
      </div>
    </div>
  );
}
