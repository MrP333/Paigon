import { useState } from 'react';

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

interface DailyChallengeData {
  label: string;
  target: number;
  reward: number;
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
  challenge?: DailyChallengeData;
  challengeProgress?: number;
  challengeClaimed?: boolean;
  onClaimChallenge?: () => void;
}

interface Tier {
  id: string;
  label: string;
  entryCents: number;
  payoutCents: number;
  paid: boolean;
}

const TIERS: Tier[] = [
  { id: 'free',     label: 'Free',     entryCents: 0,    payoutCents: 0,    paid: false },
  { id: 'quick',    label: '5 PC',    entryCents: 50,   payoutCents: 98,   paid: true  },
  { id: 'standard', label: '20 PC',   entryCents: 200,  payoutCents: 392,  paid: true  },
  { id: 'high',     label: '100 PC',  entryCents: 1000, payoutCents: 1960, paid: true  },
  { id: 'elite',    label: '500 PC',  entryCents: 5000, payoutCents: 9800, paid: true  },
];

function pcLabel(cents: number) {
  return (cents / 10).toFixed(cents % 10 === 0 ? 0 : 1) + ' PC';
}

export default function HomeScreen({ onQueue, onSolo, onBotTrial, trialComplete, playerName, playerColor, balance, isLoggedIn, onDeposit, soloRunsToday, isDev, points, winStreak = 0, lossStreak = 0, challenge, challengeProgress = 0, challengeClaimed = false, onClaimChallenge }: Props) {
  const [selected, setSelected] = useState('free');

  const runsLeft = SOLO_DAILY_LIMIT - (soloRunsToday ?? 0);

  const tier = TIERS.find(t => t.id === selected) ?? TIERS[0];
  const canAfford = balance >= tier.entryCents;

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#03030a', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 60%, rgba(80,50,20,0.12) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 20, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px' }}>
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

      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{
          fontSize: 'clamp(2.2rem, 7vw, 3.8rem)', fontWeight: 900,
          letterSpacing: '0.14em', color: '#fff', lineHeight: 1,
          textShadow: '0 0 60px rgba(255,200,80,0.2)',
        }}>
          NO MAN'S<br />LAND
        </div>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.28em', color: 'rgba(255,180,60,0.6)', marginTop: 10, textTransform: 'uppercase' }}>
          The Trench Charge
        </div>
      </div>

      <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.1)', margin: '24px 0' }} />

      <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.32)', textAlign: 'center', maxWidth: 300, lineHeight: 1.7, marginBottom: 20, letterSpacing: '0.01em' }}>
        Sprint across under MG fire &amp; artillery. Crawl to survive. Fastest crossing wins.
      </p>

      {/* Streak banner */}
      {(winStreak >= 3 || lossStreak >= 3) && (
        <div style={{
          marginBottom: 16, padding: '5px 18px', borderRadius: 20,
          background: winStreak >= 3 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${winStreak >= 3 ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
          fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: winStreak >= 3 ? '#22c55e' : '#ef4444',
        }}>
          {winStreak >= 3 ? `${winStreak} WIN STREAK` : `${lossStreak} LOSS STREAK`}
        </div>
      )}

      {/* Daily challenge card */}
      {isLoggedIn && challenge && (
        <div style={{
          width: 300, marginBottom: 12,
          padding: '10px 14px', borderRadius: 10,
          background: challengeProgress >= challenge.target
            ? 'rgba(0,255,136,0.07)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${challengeProgress >= challenge.target
            ? 'rgba(0,255,136,0.25)' : 'rgba(255,255,255,0.07)'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: 5 }}>
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
      <div style={{ marginBottom: 20, width: 300 }}>
        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 10, textAlign: 'center' }}>
          Select Stake
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {TIERS.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              style={{
                padding: '7px 10px', borderRadius: 8, fontFamily: 'inherit',
                fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.12s',
                border: selected === t.id ? '1px solid rgba(255,160,32,0.7)' : '1px solid rgba(255,255,255,0.08)',
                background: selected === t.id ? 'rgba(255,160,32,0.12)' : 'rgba(255,255,255,0.03)',
                color: selected === t.id ? '#ffa020' : 'rgba(255,255,255,0.35)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Stake info */}
        <div style={{
          marginTop: 14, padding: '12px 16px', borderRadius: 10,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {tier.paid ? (
            <>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>Entry</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff' }}>{pcLabel(tier.entryCents)}</div>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.15)', fontSize: '1rem' }}>→</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>Win</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#00ff88' }}>{pcLabel(tier.payoutCents)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>Profit</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ffa020' }}>+{pcLabel(tier.payoutCents - tier.entryCents)}</div>
              </div>
            </>
          ) : (
            <div style={{ width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', fontWeight: 700 }}>
              Free match — practice only
            </div>
          )}
        </div>

        {tier.paid && !canAfford && isLoggedIn && trialComplete && (
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: '0.7rem', color: '#ff6b6b', fontWeight: 600 }}>
            Not enough PC — <a href="/account.html" style={{ color: '#ffa020' }}>add PC from your account</a>
          </div>
        )}
        {tier.paid && !trialComplete && onBotTrial && (
          <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,160,32,0.08)', border: '1px solid rgba(255,160,32,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.68rem', color: '#ffa020', fontWeight: 700, marginBottom: 4 }}>Free trial required to unlock paid lobbies</div>
            <button onClick={onBotTrial} style={{ fontSize: '0.72rem', fontWeight: 800, color: '#ffa020', background: 'rgba(255,160,32,0.15)', border: '1px solid rgba(255,160,32,0.4)', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
              Play Free Trial vs Bot →
            </button>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 280 }}>
        <button
          onClick={() => onQueue(tier.id)}
          disabled={tier.paid && (!isLoggedIn || !canAfford || !trialComplete)}
          style={{
            padding: '14px 0', borderRadius: 10, border: 'none',
            background: tier.paid && !trialComplete ? 'rgba(255,160,32,0.2)' : '#fff',
            color: tier.paid && !trialComplete ? '#ffa020' : '#000',
            fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.04em',
            cursor: tier.paid && (!isLoggedIn || !canAfford || !trialComplete) ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: '0 0 30px rgba(255,255,255,0.15)',
            transition: 'all 0.15s',
            opacity: tier.paid && (!isLoggedIn || !canAfford) ? 0.35 : 1,
          }}
          onMouseOver={e => { if (!(tier.paid && (!isLoggedIn || !canAfford))) e.currentTarget.style.boxShadow = '0 0 50px rgba(255,255,255,0.25)'; }}
          onMouseOut={e => { e.currentTarget.style.boxShadow = '0 0 30px rgba(255,255,255,0.15)'; }}
        >
          {tier.paid && !trialComplete ? 'Complete Trial to Unlock →' : tier.paid ? `Find Lobby — ${pcLabel(tier.entryCents)} ⚡` : 'Find Lobby →'}
        </button>
        <button onClick={onSolo} style={{
          padding: '12px 0', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.65)',
          fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.03em',
          cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
        }}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = '#fff'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}
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

      {/* Controls */}
      <div style={{ marginTop: 36, display: 'flex', gap: 20, opacity: 0.3, fontSize: '0.7rem', letterSpacing: '0.06em' }}>
        {[['WASD', 'Move'], ['SHIFT', 'Sprint'], ['C', 'Crawl']].map(([k, v]) => (
          <div key={k} style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 800, marginBottom: 2, color: '#fff', fontFamily: 'monospace' }}>{k}</div>
            <div style={{ color: 'rgba(255,255,255,0.5)' }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
