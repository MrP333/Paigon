import { useState, useEffect } from 'react';

const CSS = `
@keyframes rc-float-a {
  0%,100% { transform:translate(0,0) scale(1); }
  38%     { transform:translate(-22px,30px) scale(1.07); }
  72%     { transform:translate(14px,-16px) scale(0.93); }
}
@keyframes rc-float-b {
  0%,100% { transform:translate(0,0) scale(1); }
  42%     { transform:translate(24px,-26px) scale(1.09); }
  68%     { transform:translate(-10px,18px) scale(0.91); }
}
@keyframes rc-float-c {
  0%,100% { transform:translate(0,0) scale(1); }
  55%     { transform:translate(-20px,12px) scale(1.05); }
}
@keyframes rc-ring {
  0%   { opacity:0.55; transform:translate(-50%,-50%) scale(1); }
  100% { opacity:0;    transform:translate(-50%,-50%) scale(2.6); }
}
@keyframes rc-scan {
  0%   { top:-2px; opacity:0; }
  3%   { opacity:1; }
  97%  { opacity:1; }
  100% { top:100%; opacity:0; }
}
@keyframes rc-glow {
  0%,100% { opacity:0.75; }
  50%     { opacity:1; }
}
@keyframes rc-title {
  0%,100% { filter:drop-shadow(0 0 18px rgba(34,211,238,0.45)); }
  50%     { filter:drop-shadow(0 0 40px rgba(168,85,247,0.7)) drop-shadow(0 0 70px rgba(34,211,238,0.35)); }
}
@keyframes rc-card-in {
  0%   { opacity:0; transform:translateY(22px) scale(0.97); }
  100% { opacity:1; transform:translateY(0)    scale(1); }
}
@keyframes rc-dot-ping {
  0%,80%,100% { opacity:1; transform:scale(1); }
  40%         { opacity:0.4; transform:scale(1.8); }
}
`;

const BG_CIRCLES = [
  { x:'12%', y:'18%',  r:28, color:'#22d3ee', float:'rc-float-a', dur:9,  ringDur:2.8, delay:0    },
  { x:'82%', y:'14%',  r:20, color:'#a855f7', float:'rc-float-b', dur:11, ringDur:3.2, delay:1.1  },
  { x:'72%', y:'72%',  r:24, color:'#00ff88', float:'rc-float-c', dur:10, ringDur:2.5, delay:0.5  },
  { x:'22%', y:'78%',  r:18, color:'#fb923c', float:'rc-float-a', dur:13, ringDur:3.6, delay:1.8  },
  { x:'50%', y:'8%',   r:14, color:'#ffd700', float:'rc-float-b', dur:8,  ringDur:2.2, delay:0.9  },
  { x:'88%', y:'52%',  r:16, color:'#22d3ee', float:'rc-float-c', dur:12, ringDur:3.0, delay:2.2  },
];

function getRank(pts: number): { label: string; color: string } {
  if (pts >= 25000) return { label: 'LEGEND',    color: '#ef4444' };
  if (pts >= 12000) return { label: 'ELITE',     color: '#f59e0b' };
  if (pts >= 5000)  return { label: 'EXPERT',    color: '#a855f7' };
  if (pts >= 2000)  return { label: 'VETERAN',   color: '#22d3ee' };
  if (pts >= 750)   return { label: 'SKILLED',   color: '#00ff88' };
  if (pts >= 200)   return { label: 'CONTENDER', color: '#60a5fa' };
  return                   { label: 'RECRUIT',   color: '#94a3b8' };
}

const TIERS = [
  { id: 'free',     label: 'Free',     entryCents: 0,    payoutCents: 0,    desc: 'No entry fee' },
  { id: 'quick',    label: '5 PC',    entryCents: 50,   payoutCents: 98,   desc: 'win 9.8 PC' },
  { id: 'standard', label: '20 PC',   entryCents: 200,  payoutCents: 392,  desc: 'win 39.2 PC' },
  { id: 'high',     label: '100 PC',  entryCents: 1000, payoutCents: 1960, desc: 'win 196 PC' },
  { id: 'elite',    label: '500 PC',  entryCents: 5000, payoutCents: 9800, desc: 'win 980 PC' },
];

function pc(cents: number) { return (cents / 10).toFixed(0) + ' PC'; }

const SOLO_DAILY_LIMIT = 5;

interface DailyChallengeData {
  label: string;
  target: number;
  reward: number;
}

interface Props {
  onQueue: (stakeId: string, name: string, color: string) => void;
  onSolo: (name: string, color: string) => void;
  onBotTrial?: () => void;
  trialComplete?: boolean;
  playerName?: string;
  playerColor?: string;
  balance?: number;
  isLoggedIn?: boolean;
  soloRunsToday?: number;
  isDev?: boolean;
  points?: number;
  winStreak?: number;
  lossStreak?: number;
  challenge?: DailyChallengeData;
  challengeProgress?: number;
  challengeClaimed?: boolean;
  onClaimChallenge?: () => void;
}

export default function HomeScreen({ onQueue, onSolo, onBotTrial, trialComplete, playerName: savedName, playerColor: savedColor, balance = 0, isLoggedIn, soloRunsToday, isDev, points, winStreak = 0, lossStreak = 0, challenge, challengeProgress = 0, challengeClaimed = false, onClaimChallenge }: Props) {
  const color = savedColor ?? '#22d3ee';
  const [selectedTier, setSelectedTier] = useState('free');
  const runsLeft = SOLO_DAILY_LIMIT - (soloRunsToday ?? 0);

  useEffect(() => {
    if (document.getElementById('rc-home-css')) return;
    const el = document.createElement('style');
    el.id = 'rc-home-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  function resolve() {
    return (savedName ?? '').trim() || `PLAYER-${Math.floor(Math.random() * 9000) + 1000}`;
  }

  function handleQueue() {
    const tier = TIERS.find(t => t.id === selectedTier) ?? TIERS[0];
    const isPaid = tier.entryCents > 0;
    if (isPaid && !trialComplete && onBotTrial) { onBotTrial(); return; }
    onQueue(selectedTier, resolve(), color);
  }

  function handleSolo() { onSolo(resolve(), color); }

  const tier = TIERS.find(t => t.id === selectedTier) ?? TIERS[0];
  const isPaid = tier.entryCents > 0;
  const canAfford = !isPaid || balance >= tier.entryCents;
  const trialLocked = isPaid && !trialComplete;
  const authLocked = isPaid && !isLoggedIn;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      background: '#03030a',
      position: 'relative', overflowY: 'auto',
      padding: '12px 16px',
      boxSizing: 'border-box',
    }}>

      {/* Ambient glows */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 70% 55% at 15% 20%,  rgba(34,211,238,0.13) 0%, transparent 60%),
          radial-gradient(ellipse 55% 45% at 85% 15%,  rgba(168,85,247,0.12) 0%, transparent 55%),
          radial-gradient(ellipse 50% 40% at 50% 95%,  rgba(0,255,136,0.10)  0%, transparent 55%),
          radial-gradient(ellipse 40% 30% at 80% 75%,  rgba(251,146,60,0.08) 0%, transparent 50%)
        `,
        animation: 'rc-glow 6s ease-in-out infinite',
      }} />

      {/* Dot grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(rgba(34,211,238,0.07) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }} />

      {/* Scanline */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 1, pointerEvents: 'none',
        background: 'linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.3) 25%, rgba(34,211,238,0.75) 50%, rgba(34,211,238,0.3) 75%, transparent 100%)',
        boxShadow: '0 0 12px rgba(34,211,238,0.25)',
        animation: 'rc-scan 5s linear infinite',
      }} />

      {/* Floating target circles */}
      {BG_CIRCLES.map((c, i) => (
        <div key={i} style={{
          position: 'absolute', left: c.x, top: c.y,
          animation: `${c.float} ${c.dur}s ease-in-out infinite`,
          pointerEvents: 'none',
        }}>
          {/* Pulsing ring */}
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            width: c.r * 2 + 16, height: c.r * 2 + 16,
            borderRadius: '50%', border: `1.5px solid ${c.color}`,
            animation: `rc-ring ${c.ringDur}s ${c.delay}s ease-out infinite`,
            marginLeft: -(c.r + 8), marginTop: -(c.r + 8),
          }} />
          {/* Circle */}
          <div style={{
            width: c.r * 2, height: c.r * 2, borderRadius: '50%',
            border: `2px solid ${c.color}`,
            boxShadow: `0 0 14px ${c.color}55, inset 0 0 8px ${c.color}22`,
            background: `${c.color}0a`,
            opacity: 0.35,
          }} />
        </div>
      ))}

      {/* Top bar — rank + wallet */}
      {isLoggedIn && (
        <div style={{ position: 'absolute', top: 18, right: 20, display: 'flex', alignItems: 'center', gap: 10, zIndex: 2 }}>
          {points !== undefined && (() => { const r = getRank(points); return (
            <div style={{ fontSize: '0.62rem', fontWeight: 800, color: r.color, letterSpacing: '0.1em', opacity: 0.9 }}>
              {r.label} · {points.toLocaleString()} pts
            </div>
          ); })()}
          <a href="/account.html" style={{
            display: 'inline-flex', alignItems: 'center',
            background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.22)',
            borderRadius: 999, padding: '4px 12px',
            color: '#00ff88', fontSize: '0.7rem', fontWeight: 800,
            letterSpacing: '0.04em', textDecoration: 'none', fontFamily: 'inherit',
          }}>
            {Math.floor(balance / 10)} PC
          </a>
        </div>
      )}

      {/* Card */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 460, padding: '20px 24px',
        background: 'rgba(34,211,238,0.03)',
        border: '1px solid rgba(34,211,238,0.18)',
        borderRadius: 20,
        display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: '0 0 80px rgba(34,211,238,0.07), 0 24px 80px rgba(0,0,0,0.6)',
        animation: 'rc-card-in 0.5s cubic-bezier(0.22,1,0.36,1) both',
        flexShrink: 0,
      }}>

        {/* Brand */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(34,211,238,0.6)', marginBottom: 4, textTransform: 'uppercase' }}>
            Paigon · Skill Gaming
          </div>
          <h1 style={{
            fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 55%, #ffd700 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            lineHeight: 1.1, marginBottom: 4,
            animation: 'rc-title 3s ease-in-out infinite',
          }}>
            REFLEX<br />CHAINS
          </h1>
          <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>
            30 seconds &nbsp;·&nbsp; hit as many as you can &nbsp;·&nbsp; highest score wins
          </p>
        </div>

        {/* How to play */}
        <div style={{
          borderRadius: 12,
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.07)',
          padding: '10px 12px',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.24em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: 2 }}>
            How to play
          </div>
          {[
            { dot: '#22d3ee', label: 'CLICK',  desc: 'Ring shrinks in — click the numbered circle when the ring hits it' },
            { dot: '#ff4444', label: 'DECOY',  desc: 'Red ✕ is a trap — avoid it or lose time' },
            { dot: '#ffd700', label: 'STREAK', desc: 'Hit without missing — green → cyan → purple → gold' },
          ].map(({ dot, label, desc }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%', background: dot,
                flexShrink: 0, marginTop: 4,
                boxShadow: `0 0 8px ${dot}cc`,
                animation: 'rc-dot-ping 3s ease-in-out infinite',
              }} />
              <div>
                <span style={{ fontSize: '0.67rem', fontWeight: 800, color: dot, letterSpacing: '0.1em', marginRight: 6 }}>{label}</span>
                <span style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.35)' }}>{desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Streak banner */}
        {(winStreak >= 3 || lossStreak >= 3) && (
          <div style={{
            display: 'inline-block', padding: '5px 18px', borderRadius: 20,
            background: winStreak >= 3 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${winStreak >= 3 ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const,
            color: winStreak >= 3 ? '#22c55e' : '#ef4444',
          }}>
            {winStreak >= 3 ? `${winStreak} WIN STREAK` : `${lossStreak} LOSS STREAK`}
          </div>
        )}

        {/* Daily challenge card */}
        {isLoggedIn && challenge && (
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: challengeProgress >= challenge.target
              ? 'rgba(0,255,136,0.07)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${challengeProgress >= challenge.target
              ? 'rgba(0,255,136,0.25)' : 'rgba(255,255,255,0.07)'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' as const, marginBottom: 5 }}>
                  Daily Challenge
                </div>
                <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
                  {challenge.label}
                </div>
                {challenge.target > 1 && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {Array.from({ length: challenge.target }).map((_, i) => (
                      <div key={i} style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: i < challengeProgress ? '#00ff88' : 'rgba(255,255,255,0.12)',
                        transition: 'background 0.3s',
                      }} />
                    ))}
                    <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', marginLeft: 4 }}>
                      {challengeProgress}/{challenge.target}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ flexShrink: 0, paddingTop: 2 }}>
                {challengeClaimed ? (
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#00ff88', letterSpacing: '0.08em' }}>CLAIMED ✓</div>
                ) : challengeProgress >= challenge.target ? (
                  <button onClick={onClaimChallenge} style={{
                    padding: '5px 10px', borderRadius: 20,
                    background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)',
                    fontSize: '0.66rem', fontWeight: 800, color: '#00ff88',
                    cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em',
                  }}>+{challenge.reward} PC</button>
                ) : (
                  <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'rgba(255,255,255,0.18)' }}>+{challenge.reward} PC</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stake tier selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
            Stake
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TIERS.map(t => {
              const tierPaid = t.entryCents > 0;
              const tierTrialLocked = tierPaid && !trialComplete;
              const tierAffordable = !tierPaid || balance >= t.entryCents;
              const isSelected = selectedTier === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTier(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 12px', borderRadius: 10, border: 'none',
                    background: isSelected ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                    outline: isSelected ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(255,255,255,0.07)',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: tierTrialLocked ? '#ffa020' : (isSelected ? '#22d3ee' : 'rgba(255,255,255,0.25)'), flexShrink: 0 }} />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: tierTrialLocked ? '#ffa020' : (isSelected ? '#22d3ee' : 'rgba(255,255,255,0.75)') }}>
                        {t.label}
                        {tierTrialLocked && <span style={{ fontSize: '0.6rem', marginLeft: 6, fontWeight: 800, color: '#ffa020', letterSpacing: '0.08em', verticalAlign: 'middle' }}>TRIAL FIRST</span>}
                        {tierPaid && !tierTrialLocked && !tierAffordable && <span style={{ fontSize: '0.6rem', marginLeft: 6, fontWeight: 800, color: '#ff6b6b', letterSpacing: '0.08em', verticalAlign: 'middle' }}>LOW PC</span>}
                      </div>
                      <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>{t.desc}</div>
                    </div>
                  </div>
                  {tierPaid && (
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: isSelected ? '#22d3ee' : 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
                      {pc(t.entryCents)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Trial gate notice */}
        {!trialComplete && onBotTrial && (
          <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,160,32,0.07)', border: '1px solid rgba(255,160,32,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#ffa020', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Free Trial Required</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>Beat the bot to unlock paid lobbies</div>
            </div>
            <button onClick={onBotTrial} style={{ flexShrink: 0, fontSize: '0.7rem', fontWeight: 800, color: '#ffa020', background: 'rgba(255,160,32,0.15)', border: '1px solid rgba(255,160,32,0.4)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
              Play Trial →
            </button>
          </div>
        )}

        {/* Insufficient balance notice */}
        {isPaid && !trialLocked && !authLocked && !canAfford && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.2)', fontSize: '0.72rem', color: 'rgba(255,107,107,0.8)' }}>
            Not enough PC for this tier.{' '}
            <a href="/account.html" style={{ color: '#ff6b6b', fontWeight: 700 }}>Add PC →</a>
          </div>
        )}

        {/* Queue + solo buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={handleQueue}
            disabled={isPaid && !trialLocked && !canAfford}
            style={{
              width: '100%', padding: '12px',
              background: trialLocked ? 'rgba(255,160,32,0.15)' : (canAfford ? '#22d3ee' : 'rgba(255,255,255,0.05)'),
              color: trialLocked ? '#ffa020' : (canAfford ? '#03030a' : 'rgba(255,255,255,0.2)'),
              border: trialLocked ? '1px solid rgba(255,160,32,0.4)' : 'none',
              borderRadius: 12,
              fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.04em',
              cursor: (isPaid && !trialLocked && !canAfford) ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: (canAfford && !trialLocked) ? '0 0 36px rgba(34,211,238,0.45), 0 4px 16px rgba(34,211,238,0.25)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {trialLocked ? 'Complete Trial to Unlock →' : `Join Lobby — ${tier.label} →`}
          </button>
          <button
            onClick={handleSolo}
            style={{
              width: '100%', padding: '10px',
              background: 'transparent', color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12,
              fontSize: '0.88rem', fontWeight: 700, letterSpacing: '0.03em',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'; e.currentTarget.style.color = '#fff'; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          >
            Practice Run
          </button>
          {isLoggedIn && !isDev && soloRunsToday !== undefined && (
            <div style={{ textAlign: 'center', fontSize: '0.67rem', fontWeight: 600, color: runsLeft <= 0 ? 'rgba(255,107,107,0.7)' : 'rgba(255,255,255,0.2)' }}>
              {runsLeft <= 0 ? 'No practice runs left today — resets at midnight' : `${runsLeft} of ${SOLO_DAILY_LIMIT} practice runs left today`}
            </div>
          )}
          {isLoggedIn && isDev && (
            <div style={{ textAlign: 'center', fontSize: '0.67rem', fontWeight: 600, color: 'rgba(168,85,247,0.5)' }}>
              Dev mode — unlimited practice
            </div>
          )}
        </div>

        {/* Footer note */}
        <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
          {trialComplete ? 'Skill-based · Equal footing · No house edge' : 'Complete trial to unlock competitive lobbies · 18+ only'}
        </p>
      </div>
    </div>
  );
}
