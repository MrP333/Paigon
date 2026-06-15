import { useState } from 'react';
import { Socket } from 'socket.io-client';
import { GameConfig } from '../types';

interface Props {
  socket: Socket;
  onSolo: () => void;
  onQueue: () => void;
}

export default function HomeScreen({ socket, onSolo, onQueue }: Props) {
  const [connecting] = useState(false);

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#03030a', position: 'relative', overflow: 'hidden',
    }}>
      {/* Animated battlefield silhouette background */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 60%, rgba(80,50,20,0.12) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Paigon wordmark */}
      <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 32 }}>
        Paigon · Skill Games
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

      {/* Divider */}
      <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.1)', margin: '28px 0' }} />

      {/* Description */}
      <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center', maxWidth: 320, lineHeight: 1.7, marginBottom: 36, letterSpacing: '0.01em' }}>
        Sprint across No Man's Land under MG fire and artillery. Crawl to survive. Both players run the same field — fastest crossing wins.
      </p>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 240 }}>
        <button onClick={onQueue} disabled={connecting} style={{
          padding: '14px 0', borderRadius: 10, border: 'none',
          background: '#fff', color: '#000',
          fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.04em',
          cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 0 30px rgba(255,255,255,0.15)',
          transition: 'all 0.15s',
          opacity: connecting ? 0.5 : 1,
        }}
          onMouseOver={e => (e.currentTarget.style.boxShadow = '0 0 50px rgba(255,255,255,0.25)')}
          onMouseOut={e => (e.currentTarget.style.boxShadow = '0 0 30px rgba(255,255,255,0.15)')}
        >
          Find Match — 1v1 →
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

      {/* Controls cheatsheet */}
      <div style={{ marginTop: 44, display: 'flex', gap: 20, opacity: 0.3, fontSize: '0.7rem', letterSpacing: '0.06em' }}>
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
