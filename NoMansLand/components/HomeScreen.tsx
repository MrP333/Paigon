import { useState } from 'react';

interface Props {
  onQueue: (stakeId: string) => void;
  onSolo: () => void;
  playerName: string;
  playerColor: string;
  balance: number; // balanceCents
  isLoggedIn: boolean;
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
  { id: 'quick',    label: 'Quick',    entryCents: 50,   payoutCents: 98,   paid: true  },
  { id: 'standard', label: 'Standard', entryCents: 200,  payoutCents: 392,  paid: true  },
  { id: 'high',     label: 'High',     entryCents: 1000, payoutCents: 1960, paid: true  },
  { id: 'elite',    label: 'Elite',    entryCents: 5000, payoutCents: 9800, paid: true  },
];

function pcLabel(cents: number) {
  return (cents / 10).toFixed(cents % 10 === 0 ? 0 : 1) + ' PC';
}

export default function HomeScreen({ onQueue, onSolo, playerName, playerColor, balance, isLoggedIn }: Props) {
  const [selected, setSelected] = useState('free');

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
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ffa020' }}>
              {(balance / 10).toFixed(1)} PC
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: playerColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#000' }}>
                {playerName[0]?.toUpperCase()}
              </div>
              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', fontWeight: 700 }}>{playerName}</span>
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

      <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.32)', textAlign: 'center', maxWidth: 300, lineHeight: 1.7, marginBottom: 28, letterSpacing: '0.01em' }}>
        Sprint across under MG fire &amp; artillery. Crawl to survive. Fastest crossing wins.
      </p>

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

        {tier.paid && !canAfford && isLoggedIn && (
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: '0.7rem', color: '#ff6b6b', fontWeight: 600 }}>
            Not enough PC — deposit more from your account
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 280 }}>
        <button
          onClick={() => onQueue(tier.id)}
          disabled={tier.paid && (!isLoggedIn || !canAfford)}
          style={{
            padding: '14px 0', borderRadius: 10, border: 'none',
            background: '#fff', color: '#000',
            fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.04em',
            cursor: tier.paid && (!isLoggedIn || !canAfford) ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: '0 0 30px rgba(255,255,255,0.15)',
            transition: 'all 0.15s',
            opacity: tier.paid && (!isLoggedIn || !canAfford) ? 0.35 : 1,
          }}
          onMouseOver={e => { if (!(tier.paid && (!isLoggedIn || !canAfford))) e.currentTarget.style.boxShadow = '0 0 50px rgba(255,255,255,0.25)'; }}
          onMouseOut={e => { e.currentTarget.style.boxShadow = '0 0 30px rgba(255,255,255,0.15)'; }}
        >
          {tier.paid ? `Find 1v1 — ${pcLabel(tier.entryCents)} ⚡` : 'Find Match — 1v1 →'}
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
          Solo Run — Practice
        </button>
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
