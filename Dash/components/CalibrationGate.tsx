import { useState, useEffect, useRef } from 'react';

type StepId = 'w' | 'space' | 'mouse';

const STEPS: { id: StepId; label: string; instruction: string }[] = [
  { id: 'w',     label: 'Movement', instruction: 'Press W to move forward'       },
  { id: 'space', label: 'Jump',     instruction: 'Press Space to jump'            },
  { id: 'mouse', label: 'Look',     instruction: 'Move your mouse to look around' },
];

const MOUSE_THRESHOLD = 50;
const RAINBOW = 'linear-gradient(135deg,#ff0080,#ff6600,#ffd700,#00ff88,#00ccff,#8844ff,#ff0080)';

const CSS = `
@keyframes dg-rainbow   { from{background-position:0% 50%} to{background-position:200% 50%} }
@keyframes dg-glow {
  0%,100%{filter:drop-shadow(0 0 20px rgba(255,0,128,.6))}
  25%    {filter:drop-shadow(0 0 28px rgba(255,200,0,.7))}
  50%    {filter:drop-shadow(0 0 24px rgba(0,255,136,.65))}
  75%    {filter:drop-shadow(0 0 26px rgba(0,180,255,.7))}
}
@keyframes dg-blob-a { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(-60px,40px) scale(1.2)} 70%{transform:translate(40px,-25px) scale(.85)} }
@keyframes dg-blob-b { 0%,100%{transform:translate(0,0) scale(1)} 35%{transform:translate(50px,-35px) scale(.9)} 65%{transform:translate(-30px,45px) scale(1.15)} }
@keyframes dg-blob-c { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-40px,-35px)} }
@keyframes dg-step-glow {
  0%,100%{box-shadow:0 0 28px rgba(255,0,128,.4),  inset 0 0 0 1px rgba(255,0,128,.3)}
  25%    {box-shadow:0 0 28px rgba(255,215,0,.4),   inset 0 0 0 1px rgba(255,215,0,.3)}
  50%    {box-shadow:0 0 28px rgba(0,255,136,.4),   inset 0 0 0 1px rgba(0,255,136,.3)}
  75%    {box-shadow:0 0 28px rgba(0,200,255,.4),   inset 0 0 0 1px rgba(0,200,255,.3)}
}
@keyframes dg-check-pop { from{transform:scale(0.2) rotate(-15deg);opacity:0} to{transform:scale(1) rotate(0deg);opacity:1} }
@keyframes dg-card-in   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
@keyframes dg-nudge-in  { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
@keyframes dg-ready-in  { from{opacity:0;transform:scale(.88)} to{opacity:1;transform:scale(1)} }
@keyframes dg-key-pulse { 0%,100%{opacity:.7;filter:none} 50%{opacity:1;filter:brightness(1.25)} }
`;

function KeyCap({ label, wide }: { label: string; wide?: boolean }) {
  return (
    <div style={{
      minWidth: wide ? 76 : 44, height: 38,
      borderRadius: 8,
      background: 'rgba(255,255,255,0.07)',
      border: '1.5px solid rgba(255,255,255,0.18)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', fontWeight: 800,
      fontSize: wide ? '0.68rem' : '0.92rem',
      letterSpacing: '0.06em',
      color: 'rgba(255,255,255,0.88)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      animation: 'dg-key-pulse 1.6s ease-in-out infinite',
      flexShrink: 0, padding: '0 10px',
    }}>
      {label}
    </div>
  );
}

function MouseGlyph({ pct }: { pct: number }) {
  const filled = 2 + 40 * (1 - pct / 100);
  return (
    <div style={{ width: 30, height: 42, flexShrink: 0, position: 'relative' }}>
      <svg width="30" height="42" viewBox="0 0 30 42" fill="none">
        <rect x="1.5" y="1.5" width="27" height="39" rx="13.5"
          stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"
          fill="rgba(255,255,255,0.04)" />
        {pct > 0 && (
          <clipPath id="mfill">
            <rect x="0" y={filled} width="30" height={42 - filled} />
          </clipPath>
        )}
        {pct > 0 && (
          <rect x="1.5" y="1.5" width="27" height="39" rx="13.5"
            fill="rgba(0,255,136,0.18)" clipPath="url(#mfill)" />
        )}
        <rect x="13" y="9" width="4" height="12" rx="2"
          fill={pct > 10 ? `rgba(0,255,136,${0.3 + pct / 100 * 0.6})` : 'rgba(255,255,255,0.14)'} />
      </svg>
    </div>
  );
}

export default function CalibrationGate({ onComplete }: { onComplete: () => void }) {
  const [stepIdx,   setStepIdx]   = useState(0);
  const [checked,   setChecked]   = useState<Set<StepId>>(new Set());
  const [allDone,   setAllDone]   = useState(false);
  const [showReady, setShowReady] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [mousePct,  setMousePct]  = useState(0);

  const firedRef  = useRef(false);
  const nudgeRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseAcc  = useRef(0);
  const advanceRef = useRef<() => void>(() => {});

  function clearNudge() {
    if (nudgeRef.current) clearTimeout(nudgeRef.current);
    setShowNudge(false);
  }

  advanceRef.current = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    clearNudge();

    const id = STEPS[stepIdx].id;
    setChecked(prev => new Set([...prev, id]));

    const nextIdx = stepIdx + 1;
    if (nextIdx >= STEPS.length) {
      setAllDone(true);
      setTimeout(() => setShowReady(true), 320);
      setTimeout(() => { setFadingOut(true); setTimeout(onComplete, 720); }, 1050);
    } else {
      setStepIdx(nextIdx);
    }
  };

  useEffect(() => {
    firedRef.current = false;
    mouseAcc.current = 0;
    setMousePct(0);
    clearNudge();
    nudgeRef.current = setTimeout(() => setShowNudge(true), 5000);

    const step = STEPS[stepIdx].id;

    if (step === 'w') {
      const fn = (e: KeyboardEvent) => { if (e.code === 'KeyW') advanceRef.current(); };
      window.addEventListener('keydown', fn);
      return () => { window.removeEventListener('keydown', fn); clearNudge(); };
    }

    if (step === 'space') {
      const fn = (e: KeyboardEvent) => {
        if (e.code === 'Space') { e.preventDefault(); advanceRef.current(); }
      };
      window.addEventListener('keydown', fn);
      return () => { window.removeEventListener('keydown', fn); clearNudge(); };
    }

    if (step === 'mouse') {
      const fn = (e: MouseEvent) => {
        mouseAcc.current += Math.abs(e.movementX) + Math.abs(e.movementY);
        setMousePct(Math.min(100, (mouseAcc.current / MOUSE_THRESHOLD) * 100));
        if (mouseAcc.current >= MOUSE_THRESHOLD) advanceRef.current();
      };
      window.addEventListener('mousemove', fn);
      return () => { window.removeEventListener('mousemove', fn); clearNudge(); };
    }

    return () => clearNudge();
  }, [stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#03030a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Space Grotesk', sans-serif",
      overflow: 'hidden',
      opacity: fadingOut ? 0 : 1,
      transition: fadingOut ? 'opacity 0.72s ease-out' : 'none',
      userSelect: 'none',
    }}>
      <style>{CSS}</style>

      {/* Animated color blobs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '12%', left: '18%',  width: 440, height: 440, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,0,128,0.11) 0%, transparent 70%)',  filter: 'blur(44px)', animation: 'dg-blob-a 13s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '18%', right: '12%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,200,255,0.09) 0%, transparent 70%)', filter: 'blur(44px)', animation: 'dg-blob-b 16s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '52%', left: '58%',  width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,255,136,0.07) 0%, transparent 70%)', filter: 'blur(38px)', animation: 'dg-blob-c 11s ease-in-out infinite' }} />
      </div>

      {/* Content column */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 490, padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Label */}
        <div style={{ fontSize: '0.57rem', fontWeight: 700, letterSpacing: '0.26em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 14 }}>
          Paigon · Dash
        </div>

        {/* Title */}
        <div style={{
          fontSize: '2.1rem', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 8,
          background: RAINBOW, backgroundSize: '250% 100%',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          animation: 'dg-rainbow 2.2s linear infinite, dg-glow 4s ease-in-out infinite',
        }}>
          Controls Check
        </div>

        {/* Subline */}
        <div style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.35)', fontWeight: 500, marginBottom: 34 }}>
          Quick test before you race.
        </div>

        {/* Step cards — hidden once allDone */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, opacity: allDone ? 0 : 1, transition: 'opacity 0.28s ease-out', pointerEvents: allDone ? 'none' : undefined }}>
          {STEPS.map((step, i) => {
            const isDone    = checked.has(step.id);
            const isActive  = !allDone && !isDone && i === stepIdx;
            const isPending = !isDone && !isActive;

            return (
              <div key={step.id} style={{
                borderRadius: 16,
                padding: isActive ? '14px 18px' : '10px 18px',
                display: 'flex', alignItems: 'center', gap: 14,
                background: isDone   ? 'rgba(0,255,136,0.04)'
                          : isActive ? 'rgba(255,255,255,0.04)'
                          : 'transparent',
                border: isDone   ? '1px solid rgba(0,255,136,0.16)'
                      : isActive ? '1px solid rgba(255,255,255,0.07)'
                      : '1px solid transparent',
                animation: isActive ? 'dg-step-glow 2.8s ease-in-out infinite, dg-card-in 0.28s ease-out'
                         : isDone   ? 'dg-card-in 0.25s ease-out'
                         : 'none',
                opacity: isPending ? 0.28 : 1,
                transition: 'opacity 0.3s, padding 0.2s',
              }}>

                {/* Icon */}
                {isDone ? (
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: 'rgba(0,255,136,0.14)',
                    border: '2px solid #00ff88',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    animation: 'dg-check-pop 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                  }}>
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                      <path d="M2.5 7.5L6 11L12.5 4" stroke="#00ff88" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                ) : isActive ? (
                  step.id === 'mouse'
                    ? <MouseGlyph pct={mousePct} />
                    : <KeyCap label={step.id === 'w' ? 'W' : 'SPACE'} wide={step.id === 'space'} />
                ) : (
                  <div style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.13)', flexShrink: 0 }} />
                )}

                {/* Text */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 2, color: isDone ? 'rgba(0,255,136,0.55)' : 'rgba(255,255,255,0.32)' }}>
                    {step.label}
                  </div>
                  {isActive && (
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                      {step.instruction}
                    </div>
                  )}
                  {isDone && (
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(0,255,136,0.5)' }}>Done</div>
                  )}
                </div>

                {isPending && (
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.18)', fontFamily: 'monospace' }}>{i + 1}</div>
                )}
              </div>
            );
          })}

          {/* Mouse progress bar */}
          {stepIdx === 2 && !allDone && (
            <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden', marginTop: 2 }}>
              <div style={{
                height: '100%', width: `${mousePct}%`,
                background: RAINBOW, backgroundSize: '250% 100%',
                animation: 'dg-rainbow 1.5s linear infinite',
                borderRadius: 4, transition: 'width 0.1s',
              }} />
            </div>
          )}

          {/* 5s nudge */}
          {showNudge && (
            <div style={{ textAlign: 'center', marginTop: 6, fontSize: '0.73rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em', animation: 'dg-nudge-in 0.3s ease-out' }}>
              {stepIdx === 2 ? 'Keep moving your mouse to continue' : `Still here — ${STEPS[stepIdx].instruction.toLowerCase()}`}
            </div>
          )}
        </div>

        {/* Ready to race */}
        {showReady && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, animation: 'dg-ready-in 0.45s cubic-bezier(0.34,1.56,0.64,1)', position: 'absolute' }}>
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
              animation: 'dg-rainbow 2.2s linear infinite',
            }}>
              Ready to race
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
