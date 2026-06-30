import { useState, useEffect } from 'react';

const CSS = `
@keyframes rainbow-shift { from{background-position:0% 50%} to{background-position:200% 50%} }
@keyframes blob-a { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(-50px,35px) scale(1.18)} 70%{transform:translate(30px,-22px) scale(.85)} }
@keyframes blob-b { 0%,100%{transform:translate(0,0) scale(1)} 35%{transform:translate(40px,-30px) scale(.88)} 65%{transform:translate(-25px,40px) scale(1.14)} }
@keyframes blob-c { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-35px,-30px)} }
@keyframes hue-spin { from{filter:hue-rotate(0deg)} to{filter:hue-rotate(360deg)} }
@keyframes dash-card-in { from{opacity:0;transform:translateY(24px) scale(.96)} to{opacity:1;transform:none} }
@keyframes beam-fly { 0%{transform:scaleX(0);opacity:0;transform-origin:left} 45%{opacity:1} 100%{transform:scaleX(1);opacity:0;transform-origin:left} }
@keyframes title-glow { 0%,100%{filter:drop-shadow(0 0 22px rgba(255,0,128,.6))} 25%{filter:drop-shadow(0 0 34px rgba(255,200,0,.7))} 50%{filter:drop-shadow(0 0 28px rgba(0,255,136,.65))} 75%{filter:drop-shadow(0 0 30px rgba(0,180,255,.7))} }
@keyframes dot-hue { from{filter:hue-rotate(0deg) opacity(1)} 50%{filter:hue-rotate(180deg) opacity(.8)} to{filter:hue-rotate(360deg) opacity(1)} }
@keyframes join-pulse { 0%,100%{box-shadow:0 0 40px rgba(255,0,128,.5),0 0 80px rgba(255,0,128,.2)} 25%{box-shadow:0 0 40px rgba(255,200,0,.5),0 0 80px rgba(255,200,0,.2)} 50%{box-shadow:0 0 40px rgba(0,255,136,.5),0 0 80px rgba(0,255,136,.2)} 75%{box-shadow:0 0 40px rgba(0,180,255,.5),0 0 80px rgba(0,180,255,.2)} }
@keyframes balance-border { 0%,100%{border-color:rgba(0,255,136,.5)} 33%{border-color:rgba(0,180,255,.5)} 66%{border-color:rgba(255,0,128,.5)} }
@keyframes streak-pulse { 0%,100%{opacity:.9} 50%{opacity:1;filter:brightness(1.2)} }
@property --border-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
@keyframes spin-border { to{--border-angle:360deg} }
.dash-card-wrap {
  padding: 1.5px; border-radius: 22px;
  background: conic-gradient(from var(--border-angle),#ff0080,#ff6600,#ffd700,#00ff88,#00ccff,#8844ff,#ff0080);
  animation: spin-border 3.5s linear infinite;
}
.dash-join-btn {
  background: linear-gradient(135deg,#ff0080,#ff6600,#ffd700,#00ff88,#00ccff,#8844ff,#ff0080);
  background-size: 250% 100%;
  animation: rainbow-shift 2s linear infinite, join-pulse 3s ease-in-out infinite;
  border: none;
  transition: filter .15s, transform .12s;
}
.dash-join-btn:hover { filter:brightness(1.18) saturate(1.15); transform:translateY(-2px) scale(1.02); }
.dash-join-btn:disabled { background:rgba(255,255,255,.06); animation:none; box-shadow:none; }
.dash-title-text {
  background: linear-gradient(135deg,#ff0080,#ff6600,#ffd700,#00ff88,#00ccff,#8844ff,#ff0080);
  background-size: 250% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: rainbow-shift 2.2s linear infinite, title-glow 4s ease-in-out infinite;
}
`;

const TIERS = [
  { id: 'free',     label: 'Free',    entryCents: 0,    desc: 'No entry fee',       col: '#00ff88', glow: 'rgba(0,255,136,.4)',   bg: 'rgba(0,255,136,.1)'  },
  { id: 'quick',    label: '5 PC',    entryCents: 50,   desc: '2% rake',            col: '#22d3ee', glow: 'rgba(34,211,238,.4)',  bg: 'rgba(34,211,238,.1)' },
  { id: 'standard', label: '20 PC',   entryCents: 200,  desc: '2% rake',            col: '#ffd700', glow: 'rgba(255,215,0,.4)',   bg: 'rgba(255,215,0,.1)'  },
  { id: 'high',     label: '100 PC',  entryCents: 1000, desc: '2% rake',            col: '#ff8c00', glow: 'rgba(255,140,0,.4)',   bg: 'rgba(255,140,0,.1)'  },
  { id: 'elite',    label: '500 PC',  entryCents: 5000, desc: '2% rake',            col: '#ff0080', glow: 'rgba(255,0,128,.4)',   bg: 'rgba(255,0,128,.1)'  },
];

const CONTROL_ROWS = [
  { key: 'W / ↑',     col: '#00ff88', desc: 'Move forward along the course' },
  { key: 'A/D / ← →', col: '#ffd700', desc: 'Strafe left/right — dodge obstacles and stay on the track' },
  { key: 'SPACE',     col: '#22d3ee', desc: 'Jump — leap over beams and gaps' },
];

function getRank(pts: number) {
  if (pts >= 25000) return { label: 'LEGEND',    color: '#ef4444' };
  if (pts >= 12000) return { label: 'ELITE',     color: '#f59e0b' };
  if (pts >= 5000)  return { label: 'EXPERT',    color: '#a855f7' };
  if (pts >= 2000)  return { label: 'VETERAN',   color: '#22d3ee' };
  if (pts >= 750)   return { label: 'SKILLED',   color: '#00ff88' };
  if (pts >= 200)   return { label: 'CONTENDER', color: '#60a5fa' };
  return                   { label: 'RECRUIT',   color: '#94a3b8' };
}

const SOLO_DAILY_LIMIT = 5;
function pc(cents: number) { return Math.floor(cents / 10) + ' PC'; }

interface Props {
  onQueue:      (stakeId: string, name: string, color: string) => void;
  onSolo:       (name: string, color: string) => void;
  onBotTrial?:  () => void;
  trialComplete?: boolean;
  playerName?:  string;
  playerColor?: string;
  balance?:     number;
  isLoggedIn?:  boolean;
  soloRunsToday?: number;
  isDev?:       boolean;
  points?:      number;
  winStreak?:   number;
  lossStreak?:  number;
}

export default function HomeScreen({ onQueue, onSolo, onBotTrial, trialComplete, playerName: savedName, playerColor: savedColor, balance = 0, isLoggedIn, soloRunsToday, isDev, points, winStreak = 0, lossStreak = 0 }: Props) {
  const color = savedColor ?? '#00ff88';
  const [selectedTier, setSelectedTier] = useState('free');
  const runsLeft = SOLO_DAILY_LIMIT - (soloRunsToday ?? 0);

  useEffect(() => {
    if (document.getElementById('dash-home-css')) return;
    const el = document.createElement('style'); el.id = 'dash-home-css'; el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  function resolve() { return (savedName ?? '').trim() || `RUNNER-${Math.floor(Math.random() * 9000) + 1000}`; }

  function handleQueue() {
    const tier = TIERS.find(t => t.id === selectedTier) ?? TIERS[0];
    if (tier.entryCents > 0 && !trialComplete && onBotTrial) { onBotTrial(); return; }
    onQueue(selectedTier, resolve(), color);
  }

  const tier = TIERS.find(t => t.id === selectedTier) ?? TIERS[0];
  const isPaid = tier.entryCents > 0;
  const canAfford = !isPaid || balance >= tier.entryCents;
  const trialLocked = isPaid && !trialComplete;
  const authLocked  = isPaid && !isLoggedIn;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03030a', position: 'relative', overflow: 'hidden', padding: '12px 16px', boxSizing: 'border-box' }}>

      {/* ── Colorful background blobs ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {/* Green blob top-left */}
        <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,255,136,.16) 0%, transparent 65%)', top: -200, left: -150, animation: 'blob-a 9s ease-in-out infinite, hue-spin 12s linear infinite' }} />
        {/* Cyan blob top-right */}
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,180,255,.14) 0%, transparent 65%)', top: -150, right: -100, animation: 'blob-b 11s ease-in-out infinite, hue-spin 9s linear infinite reverse' }} />
        {/* Magenta blob bottom-left */}
        <div style={{ position: 'absolute', width: 450, height: 450, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,0,128,.12) 0%, transparent 65%)', bottom: -120, left: -80, animation: 'blob-c 10s ease-in-out infinite, hue-spin 15s linear infinite' }} />
        {/* Yellow blob center */}
        <div style={{ position: 'absolute', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,200,0,.09) 0%, transparent 65%)', top: '40%', left: '55%', animation: 'blob-a 13s ease-in-out infinite reverse, hue-spin 10s linear infinite' }} />
        {/* Purple blob bottom-right */}
        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(140,0,255,.11) 0%, transparent 65%)', bottom: -100, right: -60, animation: 'blob-b 8s ease-in-out infinite, hue-spin 11s linear infinite reverse' }} />
      </div>

      {/* ── Dot grid (hue-cycling) ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(rgba(0,255,136,.07) 1px, transparent 1px)', backgroundSize: '32px 32px', animation: 'hue-spin 20s linear infinite' }} />

      {/* ── Speed lines (each a different color) ── */}
      {(['rgba(255,0,128', 'rgba(0,255,136', 'rgba(0,180,255', 'rgba(255,200,0', 'rgba(180,0,255'] as const).map((c, i) => (
        <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${15 + i * 17}%`, height: 1, pointerEvents: 'none', background: `linear-gradient(90deg, transparent 0%, ${c},.25) 30%, ${c},.65) 50%, ${c},.25) 70%, transparent 100%)`, animation: `beam-fly ${2.8 + i * 0.4}s ${i * 0.6}s ease-in-out infinite` }} />
      ))}

      {/* ── Back link ── */}
      <a href="/" target="_top" style={{ position: 'absolute', top: 18, left: 20, zIndex: 2, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', textDecoration: 'none', fontFamily: 'inherit', transition: 'color .15s' }}
        onMouseOver={e => (e.currentTarget.style.color = 'rgba(255,255,255,.65)')}
        onMouseOut={e  => (e.currentTarget.style.color = 'rgba(255,255,255,.3)')}>
        ← Paigon
      </a>

      {/* ── Top bar ── */}
      {isLoggedIn && (
        <div style={{ position: 'absolute', top: 18, right: 20, display: 'flex', alignItems: 'center', gap: 10, zIndex: 2 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(0,255,136,.08)', borderRadius: 999, padding: '4px 12px', color: '#00ff88', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.04em', fontFamily: 'inherit', border: '1px solid rgba(0,255,136,.3)', animation: 'balance-border 4s ease-in-out infinite' }}>
            {Math.floor(balance / 10)} PC
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#000', flexShrink: 0, boxShadow: `0 0 14px ${color}aa` }}>
              {(savedName ?? '')[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <div style={{ color: 'rgba(255,255,255,.65)', fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.2 }}>{savedName || 'Player'}</div>
              {points !== undefined && (() => { const r = getRank(points); return <div style={{ fontSize: '0.58rem', fontWeight: 800, color: r.color, letterSpacing: '0.1em' }}>{r.label} · {points.toLocaleString()} pts</div>; })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Rainbow border card wrap ── */}
      <div className="dash-card-wrap" style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 468, flexShrink: 0, animation: 'dash-card-in 0.5s cubic-bezier(.22,1,.36,1) both' }}>
        <div style={{ background: 'rgba(4,4,14,.92)', borderRadius: '20.5px', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 24px 80px rgba(0,0,0,.8)' }}>

          {/* Brand */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 4, background: 'linear-gradient(90deg,#ff0080,#ffd700,#00ff88,#00ccff,#8844ff)', backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'rainbow-shift 3s linear infinite' }}>Paigon · Skill Gaming</div>
            <h1 className="dash-title-text" style={{ fontSize: '2.8rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: 4 }}>
              DASH
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,.38)', letterSpacing: '0.04em' }}>
              Navigate the course faster than everyone else · First to finish wins
            </p>
          </div>

          {/* Controls */}
          <div style={{ borderRadius: 12, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.07)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.24em', color: 'rgba(255,255,255,.22)', textTransform: 'uppercase', marginBottom: 2 }}>Controls</div>
            {CONTROL_ROWS.map(({ key, col, desc }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 46, textAlign: 'center', fontSize: '0.6rem', fontWeight: 800, color: col, letterSpacing: '0.08em', background: `${col}18`, padding: '2px 6px', borderRadius: 4, marginTop: 1, boxShadow: `0 0 8px ${col}44`, border: `1px solid ${col}44` }}>{key}</div>
                <span style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,.35)' }}>{desc}</span>
              </div>
            ))}
          </div>

          {/* Streak */}
          {(winStreak >= 3 || lossStreak >= 3) && (
            <div style={{ padding: '5px 18px', borderRadius: 20, textAlign: 'center', background: winStreak >= 3 ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)', border: `1px solid ${winStreak >= 3 ? 'rgba(34,197,94,.45)' : 'rgba(239,68,68,.45)'}`, fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: winStreak >= 3 ? '#22c55e' : '#ef4444', animation: 'streak-pulse 1.8s ease-in-out infinite' }}>
              {winStreak >= 3 ? `${winStreak} WIN STREAK 🔥` : `${lossStreak} LOSS STREAK`}
            </div>
          )}

          {/* Stake selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,.35)', textTransform: 'uppercase' }}>Select Tier</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {TIERS.map(t => {
                const tierPaid = t.entryCents > 0;
                const tierTrialLocked = tierPaid && !trialComplete;
                const tierAffordable = !tierPaid || balance >= t.entryCents;
                const isSelected = selectedTier === t.id;
                return (
                  <button key={t.id} onClick={() => setSelectedTier(t.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderRadius: 10, border: 'none', background: isSelected ? t.bg : 'rgba(255,255,255,.03)', outline: isSelected ? `1.5px solid ${t.col}` : '1px solid rgba(255,255,255,.07)', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s', boxShadow: isSelected ? `0 0 18px ${t.glow}` : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isSelected ? t.col : (tierTrialLocked ? '#ffa020' : 'rgba(255,255,255,.2)'), flexShrink: 0, boxShadow: isSelected ? `0 0 8px ${t.col}` : 'none' }} />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: tierTrialLocked ? '#ffa020' : (isSelected ? t.col : 'rgba(255,255,255,.72)') }}>
                          {t.label}
                          {tierTrialLocked && <span style={{ fontSize: '0.58rem', marginLeft: 6, fontWeight: 800, color: '#ffa020', letterSpacing: '0.08em' }}>TRIAL FIRST</span>}
                          {tierPaid && !tierTrialLocked && !tierAffordable && <span style={{ fontSize: '0.58rem', marginLeft: 6, fontWeight: 800, color: '#ff6b6b', letterSpacing: '0.08em' }}>LOW PC</span>}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,.28)', marginTop: 1 }}>{t.desc}</div>
                      </div>
                    </div>
                    {tierPaid && <div style={{ fontSize: '0.78rem', fontWeight: 800, color: isSelected ? t.col : 'rgba(255,255,255,.35)', flexShrink: 0 }}>{pc(t.entryCents)}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trial gate */}
          {!trialComplete && onBotTrial && (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,160,32,.07)', border: '1px solid rgba(255,160,32,.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#ffa020', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Solo Trial Required</div>
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,.28)' }}>Finish a solo run to unlock paid lobbies</div>
              </div>
              <button onClick={onBotTrial} style={{ flexShrink: 0, fontSize: '0.7rem', fontWeight: 800, color: '#ffa020', background: 'rgba(255,160,32,.15)', border: '1px solid rgba(255,160,32,.45)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Run Trial →</button>
            </div>
          )}

          {isPaid && !trialLocked && !authLocked && !canAfford && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,107,107,.07)', border: '1px solid rgba(255,107,107,.25)', fontSize: '0.72rem', color: 'rgba(255,107,107,.85)' }}>
              Not enough PC for this tier. Add PC from the main site.
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              className={isPaid && !trialLocked && !canAfford ? '' : 'dash-join-btn'}
              onClick={handleQueue}
              disabled={isPaid && !trialLocked && !canAfford}
              style={{ width: '100%', padding: '13px', color: trialLocked ? '#ffa020' : (canAfford ? '#03030a' : 'rgba(255,255,255,.2)'), borderRadius: 12, fontSize: '0.95rem', fontWeight: 900, letterSpacing: '0.05em', cursor: (isPaid && !trialLocked && !canAfford) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: (isPaid && !trialLocked && !canAfford) ? 'rgba(255,255,255,.06)' : (trialLocked ? 'rgba(255,160,32,.15)' : undefined), border: trialLocked ? '1px solid rgba(255,160,32,.5)' : 'none' }}>
              {trialLocked ? 'Complete Trial to Unlock →' : `Join Lobby — ${tier.label} →`}
            </button>

            <button onClick={() => onSolo(resolve(), color)} style={{ width: '100%', padding: '10px', background: 'rgba(34,211,238,.06)', color: '#22d3ee', border: '1px solid rgba(34,211,238,.25)', borderRadius: 12, fontSize: '0.88rem', fontWeight: 700, letterSpacing: '0.03em', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', boxShadow: '0 0 12px rgba(34,211,238,.12)' }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(34,211,238,.12)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(34,211,238,.3)'; }}
              onMouseOut={e  => { e.currentTarget.style.background = 'rgba(34,211,238,.06)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(34,211,238,.12)'; }}>
              Practice Run
            </button>

            {isLoggedIn && !isDev && soloRunsToday !== undefined && (
              <div style={{ textAlign: 'center', fontSize: '0.67rem', fontWeight: 600, color: runsLeft <= 0 ? 'rgba(255,107,107,.7)' : 'rgba(255,255,255,.2)' }}>
                {runsLeft <= 0 ? 'No practice runs left today — resets at midnight' : `${runsLeft} of ${SOLO_DAILY_LIMIT} practice runs left today`}
              </div>
            )}
            {isLoggedIn && isDev && <div style={{ textAlign: 'center', fontSize: '0.67rem', fontWeight: 600, color: 'rgba(168,85,247,.6)' }}>Dev mode — unlimited practice</div>}
          </div>

          <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,.18)', lineHeight: 1.6 }}>
            {trialComplete ? 'Skill-based · Same course · No house edge' : 'Complete trial to unlock competitive lobbies · 18+ only'}
          </p>

        </div>
      </div>
    </div>
  );
}
