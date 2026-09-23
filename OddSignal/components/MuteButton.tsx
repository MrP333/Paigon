import { useState } from 'react';
import { Sounds } from '../services/sounds';

/**
 * Sound toggle. Pure inline styles so it drops into every game unchanged —
 * ReflexChains and OddSignal do not use Tailwind.
 *
 * Sits top-LEFT: the site overlay's close and fullscreen buttons own the
 * top-right corner, and anything placed there ends up underneath them.
 */
export default function MuteButton({ accent = '#22d3ee' }: { accent?: string }) {
  const [muted, setMuted] = useState(Sounds.isMuted());

  const toggle = () => {
    Sounds.toggleMute();
    setMuted(Sounds.isMuted());
  };

  return (
    <button
      onClick={toggle}
      title={muted ? 'Unmute' : 'Mute'}
      aria-label={muted ? 'Unmute' : 'Mute'}
      aria-pressed={muted}
      style={{
        position: 'absolute', top: 12, left: 12, zIndex: 60,
        width: 34, height: 34, borderRadius: 9,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(6,6,12,0.72)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${muted ? 'rgba(255,255,255,0.14)' : accent + '4d'}`,
        color: muted ? 'rgba(255,255,255,0.35)' : accent,
        cursor: 'pointer',
        transition: 'border-color 0.15s, color 0.15s',
      }}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
           strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        {muted
          ? <path d="m16 9 5 6M21 9l-5 6" />
          : <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>}
      </svg>
    </button>
  );
}
