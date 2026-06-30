import { useState, useRef, useEffect } from 'react';

const HITS_NEEDED = 3;
const ATTEMPT_MS  = 3000;
const TR          = 28;    // target radius px
const PAD         = 140;   // safe boundary from edges
const CYAN        = '#22d3ee';

function randomPos(): { x: number; y: number } {
  return {
    x: PAD + Math.random() * (window.innerWidth  - PAD * 2),
    y: PAD + Math.random() * (window.innerHeight - PAD * 2),
  };
}

export default function CalibrationGate({ onComplete }: { onComplete: () => void }) {
  const [pos,      setPos]      = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [hits,     setHits]     = useState(0);
  const [ringKey,  setRingKey]  = useState(0);
  const [status,   setStatus]   = useState<'idle' | 'active' | 'hit' | 'fail' | 'done'>('idle');
  const [fadingOut, setFadingOut] = useState(false);

  const hitsRef   = useRef(0);
  const statusRef = useRef<string>('idle');
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kept in a ref so timeout callbacks always call the latest version
  const startRef = useRef<(p?: { x: number; y: number }) => void>(() => {});

  function startAttempt(newPos?: { x: number; y: number }) {
    const p = newPos ?? randomPos();
    setPos(p);
    setStatus('active');
    statusRef.current = 'active';
    setRingKey(k => k + 1);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (statusRef.current !== 'active') return;
      hitsRef.current = 0;
      setHits(0);
      setStatus('fail');
      statusRef.current = 'fail';
      if (nextRef.current) clearTimeout(nextRef.current);
      nextRef.current = setTimeout(() => startRef.current(), 1400);
    }, ATTEMPT_MS);
  }
  startRef.current = startAttempt;

  useEffect(() => {
    const id = setTimeout(
      () => startRef.current({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
      500,
    );
    return () => {
      clearTimeout(id);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (nextRef.current)  clearTimeout(nextRef.current);
    };
  }, []);

  function handleTargetClick() {
    if (statusRef.current !== 'active') return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const next = hitsRef.current + 1;
    hitsRef.current = next;
    setHits(next);

    if (next >= HITS_NEEDED) {
      setStatus('done');
      statusRef.current = 'done';
      if (nextRef.current) clearTimeout(nextRef.current);
      nextRef.current = setTimeout(() => {
        setFadingOut(true);
        setTimeout(onComplete, 680);
      }, 380);
    } else {
      setStatus('hit');
      statusRef.current = 'hit';
      if (nextRef.current) clearTimeout(nextRef.current);
      nextRef.current = setTimeout(() => startRef.current(), 260);
    }
  }

  const showTarget = status === 'active' || status === 'hit' || status === 'done';
  const isFlash    = status === 'hit' || status === 'done';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#03030a',
      fontFamily: "'Space Grotesk', sans-serif",
      opacity: fadingOut ? 0 : 1,
      transition: fadingOut ? 'opacity 0.68s ease-out' : 'none',
      userSelect: 'none',
    }}>

      {/* Dot grid background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(rgba(34,211,238,0.07) 1px, transparent 1px)',
        backgroundSize: '36px 36px',
      }} />

      {/* Subtle center glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 55% 45% at 50% 46%, rgba(34,211,238,0.04) 0%, transparent 70%)',
      }} />

      {/* Top-center header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 52, gap: 6, pointerEvents: 'none',
      }}>
        <div style={{
          fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.24em',
          color: 'rgba(34,211,238,0.45)', textTransform: 'uppercase',
        }}>
          Paigon · Reflex Chains
        </div>
        <div style={{ fontSize: '1.55rem', fontWeight: 900, letterSpacing: '-0.01em', color: '#fff' }}>
          Input Check
        </div>
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.32)', fontWeight: 500 }}>
          Click the target {HITS_NEEDED} times to continue
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          {Array.from({ length: HITS_NEEDED }).map((_, i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: '50%',
              background: i < hits ? CYAN : 'rgba(34,211,238,0.12)',
              border: `1px solid ${i < hits ? CYAN : 'rgba(34,211,238,0.25)'}`,
              boxShadow: i < hits ? `0 0 8px ${CYAN}` : 'none',
              transition: 'all 0.18s',
            }} />
          ))}
        </div>

        {/* "Too slow" message */}
        {status === 'fail' && (
          <div key={`fail-${Date.now()}`} style={{
            marginTop: 12,
            fontSize: '0.76rem', fontWeight: 800, letterSpacing: '0.1em',
            color: '#ef4444', textTransform: 'uppercase',
            animation: 'cfFadeIn 0.2s ease-out',
          }}>
            Too slow — try again
          </div>
        )}
      </div>

      {/* Moving target */}
      {showTarget && (
        <div
          onClick={handleTargetClick}
          style={{
            position: 'absolute',
            left: pos.x, top: pos.y,
            transform: 'translate(-50%, -50%)',
            width: TR * 2, height: TR * 2,
            cursor: 'crosshair',
          }}
        >
          {/* Approach ring — scales from 3.2× down to 1× over ATTEMPT_MS */}
          <div key={ringKey} style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: `2px solid rgba(34,211,238,0.72)`,
            animation: `cfRing ${ATTEMPT_MS}ms linear forwards`,
            pointerEvents: 'none',
          }} />

          {/* Echo ring (slightly behind, for depth) */}
          <div key={`echo-${ringKey}`} style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: `1px solid rgba(34,211,238,0.28)`,
            animation: `cfRingEcho ${ATTEMPT_MS}ms linear forwards`,
            pointerEvents: 'none',
          }} />

          {/* Outer glow */}
          <div style={{
            position: 'absolute',
            inset: -TR * 0.9,
            borderRadius: '50%',
            background: isFlash ? 'rgba(34,211,238,0.13)' : 'rgba(34,211,238,0.04)',
            transition: 'background 0.12s',
            pointerEvents: 'none',
          }} />

          {/* Inner glow */}
          <div style={{
            position: 'absolute',
            inset: -TR * 0.25,
            borderRadius: '50%',
            background: isFlash ? 'rgba(34,211,238,0.22)' : 'rgba(34,211,238,0.07)',
            transition: 'background 0.12s',
            pointerEvents: 'none',
          }} />

          {/* Circle body */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: isFlash ? 'rgba(34,211,238,0.3)' : 'rgba(34,211,238,0.1)',
            border: `2.5px solid ${CYAN}`,
            boxShadow: isFlash
              ? `0 0 28px ${CYAN}, 0 0 56px rgba(34,211,238,0.4)`
              : `0 0 14px rgba(34,211,238,0.22)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.1s, box-shadow 0.1s',
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: CYAN, boxShadow: `0 0 6px ${CYAN}`,
              opacity: isFlash ? 0 : 0.9, transition: 'opacity 0.1s',
            }} />
          </div>

          {/* Hit burst ring */}
          {isFlash && (
            <div key={`burst-${hits}`} style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: `2px solid ${CYAN}`,
              animation: 'cfBurst 0.42s ease-out forwards',
              pointerEvents: 'none',
            }} />
          )}
        </div>
      )}

      <style>{`
        @keyframes cfRing {
          from { transform: scale(3.2); opacity: 0.85; }
          88%  { opacity: 0.75; }
          to   { transform: scale(1);   opacity: 0; }
        }
        @keyframes cfRingEcho {
          from { transform: scale(3.55); opacity: 0.35; }
          85%  { opacity: 0.25; }
          to   { transform: scale(1.12); opacity: 0; }
        }
        @keyframes cfBurst {
          from { transform: scale(1);   opacity: 0.9; }
          to   { transform: scale(2.8); opacity: 0; }
        }
        @keyframes cfFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
