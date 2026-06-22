import { useState } from 'react';

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
}

export default function HomeScreen({ onQueue, onSolo, onBotTrial, trialComplete, playerName: savedName, playerColor: savedColor, balance = 0, isLoggedIn, soloRunsToday, isDev, points, winStreak = 0, lossStreak = 0 }: Props) {
  const color = savedColor ?? '#a855f7';
  const [selectedTier, setSelectedTier] = useState('free');
  const runsLeft = SOLO_DAILY_LIMIT - (soloRunsToday ?? 0);

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
      overflowY: 'auto', padding: '12px 16px', boxSizing: 'border-box',
      background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(168,85,247,0.07) 0%, transparent 70%), #03030a',
      position: 'relative',
    }}>

      {isLoggedIn && (
        <div style={{ position: 'absolute', top: 18, right: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
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
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#000', flexShrink: 0 }}>
              {(savedName ?? '')[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.2 }}>{savedName || 'Player'}</div>
              {points !== undefined && (() => { const r = getRank(points); return (
                <div style={{ fontSize: '0.58rem', fontWeight: 800, color: r.color, letterSpacing: '0.1em' }}>{r.label} · {points.toLocaleString()} pts</div>
              ); })()}
            </div>
          </div>
        </div>
      )}

      <div style={{
        width: '100%', maxWidth: 460, padding: '20px 24px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
        flexShrink: 0,
      }}>

        {/* Brand */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(168,85,247,0.7)', marginBottom: 4, textTransform: 'uppercase' }}>
            Paigon · Skill Gaming
          </div>
          <h1 style={{
            fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 55%, #ffd700 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            lineHeight: 1.1, marginBottom: 4,
          }}>
            ODD<br />SIGNAL
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em' }}>
            5 rounds &nbsp;·&nbsp; spot the odd shape &nbsp;·&nbsp; fastest wins
          </p>
          {(winStreak >= 3 || lossStreak >= 3) && (
            <div style={{
              display: 'inline-block', marginTop: 12, padding: '5px 18px', borderRadius: 20,
              background: winStreak >= 3 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${winStreak >= 3 ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
              fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const,
              color: winStreak >= 3 ? '#22c55e' : '#ef4444',
            }}>
              {winStreak >= 3 ? `${winStreak} WIN STREAK` : `${lossStreak} LOSS STREAK`}
            </div>
          )}
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
            { dot: '#a855f7', label: '5 ROUNDS',    desc: '3–5 shapes appear at once each round' },
            { dot: '#ec4899', label: 'SPOT IT',      desc: 'One shape is slightly different — click it fast' },
            { dot: '#ffd700', label: 'DON\'T RUSH',  desc: 'Background colors are traps — judge shapes only' },
            { dot: '#22d3ee', label: 'SCORE',        desc: 'More correct + faster reaction = higher score' },
          ].map(({ dot, label, desc }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, marginTop: 4, boxShadow: `0 0 6px ${dot}88` }} />
              <div>
                <span style={{ fontSize: '0.67rem', fontWeight: 800, color: dot, letterSpacing: '0.1em', marginRight: 6 }}>{label}</span>
                <span style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.35)' }}>{desc}</span>
              </div>
            </div>
          ))}
        </div>


        {/* Stake selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
            Stake
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TIERS.map(t => {
              const tierPaid = t.entryCents > 0;
              const tierTrialLocked = tierPaid && !trialComplete;
              const tierAffordable = !tierPaid || balance >= t.entryCents;
              const isSelected = selectedTier === t.id;
              return (
                <button key={t.id} onClick={() => setSelectedTier(t.id)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 12px', borderRadius: 10, border: 'none',
                  background: isSelected ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)',
                  outline: isSelected ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.07)',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: tierTrialLocked ? '#ffa020' : (isSelected ? '#a855f7' : 'rgba(255,255,255,0.25)'), flexShrink: 0 }} />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: tierTrialLocked ? '#ffa020' : (isSelected ? '#a855f7' : 'rgba(255,255,255,0.75)') }}>
                        {t.label}
                        {tierTrialLocked && <span style={{ fontSize: '0.6rem', marginLeft: 6, fontWeight: 800, color: '#ffa020', letterSpacing: '0.08em', verticalAlign: 'middle' }}>TRIAL FIRST</span>}
                        {tierPaid && !tierTrialLocked && !tierAffordable && <span style={{ fontSize: '0.6rem', marginLeft: 6, fontWeight: 800, color: '#ff6b6b', letterSpacing: '0.08em', verticalAlign: 'middle' }}>LOW PC</span>}
                      </div>
                      <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>{t.desc}</div>
                    </div>
                  </div>
                  {tierPaid && (
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: isSelected ? '#a855f7' : 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
                      {pc(t.entryCents)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Trial gate */}
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

        {isPaid && !trialLocked && !authLocked && !canAfford && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.2)', fontSize: '0.72rem', color: 'rgba(255,107,107,0.8)' }}>
            Not enough PC for this tier.{' '}<a href="/account.html" style={{ color: '#ff6b6b', fontWeight: 700 }}>Add PC →</a>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={handleQueue}
            disabled={isPaid && !trialLocked && !canAfford}
            style={{
              width: '100%', padding: '12px',
              background: trialLocked ? 'rgba(255,160,32,0.15)' : (canAfford ? '#a855f7' : 'rgba(255,255,255,0.05)'),
              color: trialLocked ? '#ffa020' : (canAfford ? '#fff' : 'rgba(255,255,255,0.2)'),
              border: trialLocked ? '1px solid rgba(255,160,32,0.4)' : 'none',
              borderRadius: 12,
              fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.04em',
              cursor: (isPaid && !trialLocked && !canAfford) ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: (canAfford && !trialLocked) ? '0 0 32px rgba(168,85,247,0.4)' : 'none',
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
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
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

        <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
          {trialComplete ? 'Skill-based · Equal footing · No house edge' : 'Complete trial to unlock competitive lobbies · 18+ only'}
        </p>
      </div>
    </div>
  );
}
