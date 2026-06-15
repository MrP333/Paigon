import { useState } from 'react';

const COLORS = ['#22d3ee','#00ff88','#f472b6','#fb923c','#a78bfa','#facc15'];

interface Props {
  onPlay: (name: string, color: string) => void;
  onSolo: (name: string, color: string) => void;
}

export default function HomeScreen({ onPlay, onSolo }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#22d3ee');

  function resolve() {
    return name.trim() || `PLAYER-${Math.floor(Math.random() * 9000) + 1000}`;
  }
  function handlePlay() { onPlay(resolve(), color); }
  function handleSolo() { onSolo(resolve(), color); }

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(34,211,238,0.06) 0%, transparent 70%), #03030a',
    }}>
      <div style={{
        width: '100%', maxWidth: 420, padding: '48px 40px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        display: 'flex', flexDirection: 'column', gap: 28,
      }}>

        {/* Brand */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(34,211,238,0.7)', marginBottom: 10, textTransform: 'uppercase' }}>
            Paigon · Skill Gaming
          </div>
          <h1 style={{
            fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #22d3ee 0%, #00ff88 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            lineHeight: 1.1, marginBottom: 8,
          }}>
            REFLEX<br />CHAINS
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.38)', letterSpacing: '0.04em' }}>
            10 targets · pure reaction · no strategy
          </p>
        </div>

        {/* Name input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
            Callsign
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePlay()}
            placeholder="Enter your name"
            maxLength={20}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '12px 14px',
              color: '#fff', fontSize: '0.95rem', fontWeight: 600,
              fontFamily: 'inherit', outline: 'none', width: '100%',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)'}
            onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
          />
        </div>

        {/* Color picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
            Color
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: 'none',
                  background: c, cursor: 'pointer', position: 'relative',
                  boxShadow: color === c ? `0 0 0 3px #03030a, 0 0 0 5px ${c}` : 'none',
                  transform: color === c ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.15s',
                }}
              />
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={handlePlay}
            style={{
              width: '100%', padding: '15px',
              background: '#22d3ee', color: '#03030a',
              border: 'none', borderRadius: 12,
              fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.04em',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 0 32px rgba(34,211,238,0.35)',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#38bdf8'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#22d3ee'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Find Match — 1v1 →
          </button>
          <button
            onClick={handleSolo}
            style={{
              width: '100%', padding: '13px',
              background: 'transparent', color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12,
              fontSize: '0.88rem', fontWeight: 700, letterSpacing: '0.03em',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'; e.currentTarget.style.color = '#fff'; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          >
            Solo Practice — Beat Your Time
          </button>
        </div>

        {/* Footer note */}
        <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
          Competitive lobbies coming soon · 18+ only
        </p>
      </div>
    </div>
  );
}
