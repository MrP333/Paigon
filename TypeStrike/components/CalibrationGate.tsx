import { useState, useEffect, useRef } from 'react';

const RAINBOW = 'linear-gradient(135deg,#ff0080,#ff6600,#ffd700,#00ff88,#00ccff,#8844ff,#ff0080)';

const WORDS = ['flame', 'swift', 'blaze', 'crisp', 'glide', 'pixel', 'neon', 'sharp', 'brave', 'quick'];

const CSS = `
@keyframes ts-rainbow { from{background-position:0% 50%} to{background-position:200% 50%} }
@keyframes ts-glow {
  0%,100%{filter:drop-shadow(0 0 20px rgba(0,255,136,.6))}
  50%{filter:drop-shadow(0 0 34px rgba(0,255,136,.9))}
}
@keyframes ts-blob-a { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-40px,30px) scale(1.2)} }
@keyframes ts-blob-b { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(35px,-25px) scale(.85)} }
@keyframes ts-card-in { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
@keyframes ts-ready-in { from{opacity:0;transform:scale(.88)} to{opacity:1;transform:scale(1)} }
@keyframes ts-cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
@keyframes ts-shake { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-6px)} 30%{transform:translateX(6px)} 45%{transform:translateX(-4px)} 60%{transform:translateX(4px)} 75%{transform:translateX(-2px)} 90%{transform:translateX(2px)} }
`;

export default function CalibrationGate({ onComplete }: { onComplete: () => void }) {
  const [typed, setTyped] = useState('');
  const [shaking, setShaking] = useState(false);
  const [done, setDone] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const word = useRef(WORDS[Math.floor(Math.random() * WORDS.length)]);
  const firedRef = useRef(false);

  useEffect(() => {
    if (document.getElementById('ts-calib-css')) return;
    const el = document.createElement('style'); el.id = 'ts-calib-css'; el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  // 15-second countdown
  useEffect(() => {
    const iv = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(iv);
          // Time's up — just pass them through
          if (!firedRef.current) {
            firedRef.current = true;
            setTimeout(() => { setFadingOut(true); setTimeout(onComplete, 600); }, 200);
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (firedRef.current) return;
      const target = word.current;

      if (e.key === 'Backspace') {
        setTyped(prev => prev.slice(0, -1));
        return;
      }
      if (e.key.length !== 1) return;
      e.preventDefault();

      const next = typed + e.key;

      if (!target.startsWith(next)) {
        setShaking(true);
        setTimeout(() => setShaking(false), 450);
        return;
      }

      setTyped(next);

      if (next === target) {
        firedRef.current = true;
        setDone(true);
        setTimeout(() => { setFadingOut(true); setTimeout(onComplete, 600); }, 550);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [typed, onComplete]);

  const target = word.current;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#08080f',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Space Grotesk', sans-serif",
      overflow: 'hidden',
      opacity: fadingOut ? 0 : 1,
      transition: fadingOut ? 'opacity 0.6s ease-out' : 'none',
      userSelect: 'none',
    }}>
      <style>{CSS}</style>

      {/* Background blobs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '12%', left: '18%', width: 440, height: 440, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,255,136,0.09) 0%, transparent 70%)', filter: 'blur(44px)', animation: 'ts-blob-a 13s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '18%', right: '12%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,200,255,0.07) 0%, transparent 70%)', filter: 'blur(44px)', animation: 'ts-blob-b 16s ease-in-out infinite' }} />
      </div>

      <div style={{ position: 'relative', width: '100%', maxWidth: 480, padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

        <div style={{ fontSize: '0.57rem', fontWeight: 700, letterSpacing: '0.26em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 14 }}>
          Paigon · TypeStrike
        </div>

        <div style={{
          fontSize: '2.0rem', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 8,
          background: RAINBOW, backgroundSize: '250% 100%',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          animation: 'ts-rainbow 2.2s linear infinite, ts-glow 4s ease-in-out infinite',
        }}>
          Keyboard Check
        </div>

        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)', fontWeight: 500, marginBottom: 38 }}>
          Type this word to continue.
        </div>

        {!done ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, animation: 'ts-card-in 0.3s ease-out' }}>

            {/* Word to type */}
            <div style={{ fontSize: '2.6rem', fontWeight: 900, letterSpacing: '0.35em', color: 'rgba(255,255,255,0.15)', textTransform: 'lowercase', position: 'relative' }}>
              {target.split('').map((ch, i) => {
                let col = 'rgba(255,255,255,0.15)';
                if (i < typed.length) col = '#00ff88';
                else if (i === typed.length) col = 'rgba(255,255,255,0.9)';
                return (
                  <span key={i} style={{ color: col, transition: 'color 0.1s', position: 'relative' }}>
                    {ch}
                    {i === typed.length && (
                      <span style={{ position: 'absolute', bottom: 2, left: 0, right: 0, height: 3, background: '#00ff88', borderRadius: 2, animation: 'ts-cursor-blink 0.9s ease-in-out infinite' }} />
                    )}
                  </span>
                );
              })}
            </div>

            {/* Typing input display */}
            <div
              style={{
                width: '100%', maxWidth: 320,
                padding: '14px 18px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.04)',
                border: `1.5px solid ${shaking ? 'rgba(255,68,68,0.6)' : 'rgba(0,255,136,0.25)'}`,
                boxShadow: shaking ? '0 0 20px rgba(255,68,68,0.3)' : '0 0 0 transparent',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                animation: shaking ? 'ts-shake 0.45s ease-in-out' : 'none',
                minHeight: 52,
                display: 'flex', alignItems: 'center',
                fontSize: '1.3rem', fontWeight: 700, letterSpacing: '0.12em',
                color: shaking ? '#ff4444' : '#00ff88',
                fontFamily: 'monospace',
              }}
            >
              {typed || <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem', fontFamily: "'Space Grotesk', sans-serif" }}>start typing…</span>}
              <span style={{ display: 'inline-block', width: 2, height: '1.2em', marginLeft: 2, background: '#00ff88', animation: 'ts-cursor-blink 0.9s ease-in-out infinite', borderRadius: 1 }} />
            </div>

            {/* Timer */}
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: timeLeft <= 5 ? 'rgba(255,68,68,0.7)' : 'rgba(255,255,255,0.2)', letterSpacing: '0.06em' }}>
              {timeLeft}s remaining
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, animation: 'ts-ready-in 0.45s cubic-bezier(0.34,1.56,0.64,1)' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'rgba(0,255,136,0.1)',
              border: '2.5px solid #00ff88',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 50px rgba(0,255,136,0.35)',
            }}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <path d="M8 18L15.5 25.5L28 11" stroke="#00ff88" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{
              fontSize: '1.55rem', fontWeight: 900, letterSpacing: '-0.01em',
              background: RAINBOW, backgroundSize: '250% 100%',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              animation: 'ts-rainbow 2.2s linear infinite',
            }}>
              Ready to type
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
