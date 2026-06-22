import { useState, useEffect, useRef } from 'react';

const SOLO_DAILY_LIMIT = 5;

function getRank(pts: number): { label: string; color: string } {
  if (pts >= 25000) return { label: 'LEGEND',    color: '#ef4444' };
  if (pts >= 12000) return { label: 'ELITE',     color: '#f59e0b' };
  if (pts >= 5000)  return { label: 'EXPERT',    color: '#a855f7' };
  if (pts >= 2000)  return { label: 'VETERAN',   color: '#22d3ee' };
  if (pts >= 750)   return { label: 'SKILLED',   color: '#00ff88' };
  if (pts >= 200)   return { label: 'CONTENDER', color: '#60a5fa' };
  return                   { label: 'RECRUIT',   color: '#94a3b8' };
}

interface Props {
  onQueue: (stakeId: string) => void;
  onSolo: () => void;
  onBotTrial?: () => void;
  trialComplete?: boolean;
  playerName: string;
  playerColor: string;
  balance: number;
  isLoggedIn: boolean;
  onDeposit: () => void;
  soloRunsToday?: number;
  isDev?: boolean;
  points?: number;
  winStreak?: number;
  lossStreak?: number;
}

interface Tier {
  id: string; label: string; entryCents: number; payoutCents: number; paid: boolean;
}
const TIERS: Tier[] = [
  { id: 'free',     label: 'Free',    entryCents: 0,    payoutCents: 0,    paid: false },
  { id: 'quick',    label: '5 PC',   entryCents: 50,   payoutCents: 98,   paid: true  },
  { id: 'standard', label: '20 PC',  entryCents: 200,  payoutCents: 392,  paid: true  },
  { id: 'high',     label: '100 PC', entryCents: 1000, payoutCents: 1960, paid: true  },
  { id: 'elite',    label: '500 PC', entryCents: 5000, payoutCents: 9800, paid: true  },
];
function pcLabel(cents: number) {
  return (cents / 10).toFixed(cents % 10 === 0 ? 0 : 1) + ' PC';
}

// ── Battlefield canvas animation ──────────────────────────────────────────────
interface Tracer { x: number; y: number; vx: number; vy: number; len: number; alpha: number; color: string; }
interface Flash  { x: number; y: number; r: number; born: number; dur: number; }
interface Smoke  { x: number; y: number; vx: number; vy: number; r: number; alpha: number; born: number; dur: number; }

function useBattlefield(canvasRef: React.RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    const canvas = canvasRef.current!;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let frame: number;
    let lastTracer = 0;
    let lastFlash  = 0;
    let lastSmoke  = 0;
    const tracers: Tracer[] = [];
    const flashes: Flash[]  = [];
    const smokes:  Smoke[]  = [];

    function resize() {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function spawnTracer() {
      const W = canvas.width, H = canvas.height;
      const fromLeft = Math.random() > 0.5;
      const angle = (Math.random() * 0.22 - 0.11) + (fromLeft ? 0 : Math.PI);
      const speed = 600 + Math.random() * 400;
      const colors = ['#f97316', '#fbbf24', '#fb923c', '#fde68a'];
      tracers.push({
        x: fromLeft ? -20 : W + 20,
        y: H * (0.35 + Math.random() * 0.45),
        vx: Math.cos(angle) * speed * (fromLeft ? 1 : -1),
        vy: Math.sin(angle) * speed * (Math.random() - 0.5),
        len: 28 + Math.random() * 50,
        alpha: 0.55 + Math.random() * 0.35,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    function spawnFlash() {
      const W = canvas.width, H = canvas.height;
      flashes.push({
        x: W * (0.1 + Math.random() * 0.8),
        y: H * (0.3 + Math.random() * 0.5),
        r: 60 + Math.random() * 120,
        born: performance.now(),
        dur: 180 + Math.random() * 220,
      });
    }

    function spawnSmoke() {
      const W = canvas.width, H = canvas.height;
      smokes.push({
        x: W * (0.1 + Math.random() * 0.8),
        y: H * (0.5 + Math.random() * 0.4),
        vx: (Math.random() - 0.5) * 12,
        vy: -(4 + Math.random() * 8),
        r: 18 + Math.random() * 32,
        alpha: 0.06 + Math.random() * 0.08,
        born: performance.now(),
        dur: 3000 + Math.random() * 2000,
      });
    }

    let prev = performance.now();
    function draw() {
      const now = performance.now();
      const dt  = (now - prev) / 1000;
      prev = now;
      const W = canvas.width, H = canvas.height;

      // Background
      ctx.fillStyle = '#03030a';
      ctx.fillRect(0, 0, W, H);

      // Distant ground plane gradient
      const groundGrad = ctx.createLinearGradient(0, H * 0.55, 0, H);
      groundGrad.addColorStop(0, 'rgba(30,20,5,0)');
      groundGrad.addColorStop(1, 'rgba(30,20,5,0.28)');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, H * 0.55, W, H);

      // Dot grid
      ctx.fillStyle = 'rgba(255,180,60,0.05)';
      for (let x = 30; x < W; x += 30) {
        for (let y = 30; y < H; y += 30) {
          ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Barbed wire silhouette at horizon
      const hY = H * 0.62;
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, hY); ctx.lineTo(W, hY); ctx.stroke();
      for (let wx = 0; wx < W; wx += 18) {
        const jitter = Math.sin(wx * 0.08) * 4;
        ctx.beginPath(); ctx.arc(wx, hY + jitter, 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.stroke();
      }

      // Smoke
      if (now - lastSmoke > 900) { spawnSmoke(); lastSmoke = now; }
      for (let i = smokes.length - 1; i >= 0; i--) {
        const s = smokes[i];
        const age = (now - s.born) / s.dur;
        if (age >= 1) { smokes.splice(i, 1); continue; }
        s.x += s.vx * dt; s.y += s.vy * dt; s.r += 6 * dt;
        const a = s.alpha * (1 - age);
        ctx.save();
        ctx.globalAlpha = a;
        const sg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        sg.addColorStop(0, 'rgba(120,100,60,0.9)');
        sg.addColorStop(1, 'rgba(120,100,60,0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Artillery flashes
      const flashInterval = 2800 + Math.random() * 2000;
      if (now - lastFlash > flashInterval) { spawnFlash(); lastFlash = now; }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        const age = (now - f.born) / f.dur;
        if (age >= 1) { flashes.splice(i, 1); continue; }
        const a = age < 0.2 ? age / 0.2 : 1 - (age - 0.2) / 0.8;
        ctx.save();
        ctx.globalAlpha = a * 0.45;
        const fg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        fg.addColorStop(0, '#fbbf24');
        fg.addColorStop(0.3, '#f97316');
        fg.addColorStop(1, 'transparent');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Tracers
      const burstSize = 1 + Math.floor(Math.random() * 3);
      if (now - lastTracer > 400 + Math.random() * 800) {
        for (let b = 0; b < burstSize; b++) spawnTracer();
        lastTracer = now;
      }
      for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.x += t.vx * dt; t.y += t.vy * dt;
        const W2 = canvas.width;
        if (t.x < -100 || t.x > W2 + 100) { tracers.splice(i, 1); continue; }
        const nx = t.vx / Math.hypot(t.vx, t.vy);
        const ny = t.vy / Math.hypot(t.vx, t.vy);
        ctx.save();
        ctx.globalAlpha = t.alpha;
        ctx.strokeStyle = t.color;
        ctx.lineWidth   = 1.5;
        ctx.shadowColor = t.color;
        ctx.shadowBlur  = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x - nx * t.len, t.y - ny * t.len);
        ctx.stroke();
        ctx.restore();
      }

      // Vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, W * 0.72);
      vg.addColorStop(0, 'transparent');
      vg.addColorStop(1, 'rgba(0,0,0,0.65)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); ro.disconnect(); };
  }, []);
}

export default function HomeScreen({ onQueue, onSolo, onBotTrial, trialComplete, playerName, playerColor, balance, isLoggedIn, onDeposit, soloRunsToday, isDev, points, winStreak = 0, lossStreak = 0 }: Props) {
  const [selected, setSelected] = useState('free');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useBattlefield(canvasRef);

  const runsLeft = SOLO_DAILY_LIMIT - (soloRunsToday ?? 0);
  const tier = TIERS.find(t => t.id === selected) ?? TIERS[0];
  const canAfford = balance >= tier.entryCents;

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#03030a', position: 'relative', overflow: 'hidden',
    }}>
      {/* Battlefield canvas */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 20, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', zIndex: 2 }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.18)' }}>
          Paigon · NML
        </div>
        {isLoggedIn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a href="/account.html" style={{
              display: 'inline-flex', alignItems: 'center',
              background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.22)',
              borderRadius: 999, padding: '4px 12px',
              color: '#00ff88', fontSize: '0.7rem', fontWeight: 800,
              letterSpacing: '0.04em', textDecoration: 'none', fontFamily: 'inherit',
            }}>
              {Math.floor(balance / 10)} PC
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: playerColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#000' }}>
                {playerName[0]?.toUpperCase()}
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.2 }}>{playerName}</div>
                {points !== undefined && (() => { const r = getRank(points); return (
                  <div style={{ fontSize: '0.58rem', fontWeight: 800, color: r.color, letterSpacing: '0.1em' }}>{r.label} · {points.toLocaleString()} pts</div>
                ); })()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content card */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: '100%', maxWidth: 360, padding: '0 20px',
      }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div style={{
            fontSize: 'clamp(2.4rem, 8vw, 4rem)', fontWeight: 900,
            letterSpacing: '0.14em', lineHeight: 1,
            color: '#fff',
            textShadow: '0 0 80px rgba(249,115,22,0.35), 0 0 160px rgba(249,115,22,0.15)',
          }}>
            NO MAN'S<br />LAND
          </div>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.3em', color: 'rgba(251,191,36,0.65)', marginTop: 10, textTransform: 'uppercase' }}>
            The Trench Charge
          </div>
        </div>

        <div style={{ width: 40, height: 1, background: 'rgba(251,191,36,0.2)', margin: '18px 0' }} />

        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.32)', textAlign: 'center', maxWidth: 280, lineHeight: 1.7, marginBottom: 16, letterSpacing: '0.01em' }}>
          Sprint across under MG fire &amp; artillery. Crawl to survive. Fastest crossing wins.
        </p>

        {/* Streak banner */}
        {(winStreak >= 3 || lossStreak >= 3) && (
          <div style={{
            marginBottom: 12, padding: '5px 18px', borderRadius: 20,
            background: winStreak >= 3 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${winStreak >= 3 ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const,
            color: winStreak >= 3 ? '#22c55e' : '#ef4444',
          }}>
            {winStreak >= 3 ? `${winStreak} WIN STREAK` : `${lossStreak} LOSS STREAK`}
          </div>
        )}

        {/* Stake selector */}
        <div style={{ marginBottom: 16, width: '100%' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.2)', marginBottom: 8, textAlign: 'center' }}>
            Select Stake
          </div>
          <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' as const }}>
            {TIERS.map(t => (
              <button key={t.id} onClick={() => setSelected(t.id)} style={{
                padding: '6px 10px', borderRadius: 8, fontFamily: 'inherit',
                fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.12s',
                border: selected === t.id ? '1px solid rgba(251,191,36,0.65)' : '1px solid rgba(255,255,255,0.08)',
                background: selected === t.id ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)',
                color: selected === t.id ? '#fbbf24' : 'rgba(255,255,255,0.35)',
              }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{
            marginTop: 10, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(6px)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            {tier.paid ? (
              <>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 3 }}>Entry</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fff' }}>{pcLabel(tier.entryCents)}</div>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.9rem' }}>→</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 3 }}>Win</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#00ff88' }}>{pcLabel(tier.payoutCents)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 3 }}>Profit</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fbbf24' }}>+{pcLabel(tier.payoutCents - tier.entryCents)}</div>
                </div>
              </>
            ) : (
              <div style={{ width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: '0.76rem', fontWeight: 700 }}>
                Free match — practice only
              </div>
            )}
          </div>

          {tier.paid && !canAfford && isLoggedIn && trialComplete && (
            <div style={{ marginTop: 6, textAlign: 'center', fontSize: '0.7rem', color: '#ff6b6b', fontWeight: 600 }}>
              Not enough PC — <a href="/account.html" style={{ color: '#ffa020' }}>add PC</a>
            </div>
          )}
          {tier.paid && !trialComplete && onBotTrial && (
            <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.66rem', color: '#fbbf24', fontWeight: 700, marginBottom: 4 }}>Free trial required to unlock paid lobbies</div>
              <button onClick={onBotTrial} style={{ fontSize: '0.7rem', fontWeight: 800, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                Play Free Trial vs Bot →
              </button>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <button
            onClick={() => onQueue(tier.id)}
            disabled={tier.paid && (!isLoggedIn || !canAfford || !trialComplete)}
            style={{
              padding: '13px 0', borderRadius: 10, border: 'none',
              background: tier.paid && !trialComplete ? 'rgba(251,191,36,0.15)' : '#fff',
              color: tier.paid && !trialComplete ? '#fbbf24' : '#000',
              fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.04em',
              cursor: tier.paid && (!isLoggedIn || !canAfford || !trialComplete) ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: tier.paid && !trialComplete ? 'none' : '0 0 30px rgba(255,255,255,0.12), 0 0 60px rgba(249,115,22,0.08)',
              transition: 'all 0.15s',
              opacity: tier.paid && (!isLoggedIn || !canAfford) ? 0.35 : 1,
            }}
            onMouseOver={e => { if (!(tier.paid && (!isLoggedIn || !canAfford))) e.currentTarget.style.boxShadow = '0 0 50px rgba(255,255,255,0.22), 0 0 80px rgba(249,115,22,0.12)'; }}
            onMouseOut={e => { e.currentTarget.style.boxShadow = '0 0 30px rgba(255,255,255,0.12), 0 0 60px rgba(249,115,22,0.08)'; }}
          >
            {tier.paid && !trialComplete ? 'Complete Trial to Unlock →' : tier.paid ? `Find Lobby — ${pcLabel(tier.entryCents)} ⚡` : 'Find Lobby →'}
          </button>
          <button onClick={onSolo} style={{
            padding: '11px 0', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(0,0,0,0.3)', color: 'rgba(255,255,255,0.55)',
            fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.03em',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            backdropFilter: 'blur(4px)',
          }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = '#fff'; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
          >
            Practice Run
          </button>
          {isLoggedIn && !isDev && soloRunsToday !== undefined && (
            <div style={{ textAlign: 'center', fontSize: '0.65rem', fontWeight: 600, color: runsLeft <= 0 ? 'rgba(255,107,107,0.7)' : 'rgba(255,255,255,0.18)' }}>
              {runsLeft <= 0 ? 'No practice runs left today — resets at midnight' : `${runsLeft} of ${SOLO_DAILY_LIMIT} practice runs left today`}
            </div>
          )}
          {isLoggedIn && isDev && (
            <div style={{ textAlign: 'center', fontSize: '0.65rem', fontWeight: 600, color: 'rgba(168,85,247,0.5)' }}>
              Dev mode — unlimited practice
            </div>
          )}
        </div>

        {/* Controls hint */}
        <div style={{ marginTop: 28, display: 'flex', gap: 20, opacity: 0.28, fontSize: '0.68rem', letterSpacing: '0.06em' }}>
          {[['WASD', 'Move'], ['SHIFT', 'Sprint'], ['C', 'Crawl']].map(([k, v]) => (
            <div key={k} style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, marginBottom: 2, color: '#fff', fontFamily: 'monospace' }}>{k}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
