import { useState } from 'react';
import { NmlSounds } from '../services/sounds';

export default function MuteButton() {
  const [muted, setMuted] = useState(NmlSounds.isMuted());

  const toggle = () => {
    NmlSounds.toggleMute();
    setMuted(NmlSounds.isMuted());
  };

  return (
    <button
      onClick={toggle}
      title={muted ? 'Unmute' : 'Mute'}
      style={{
        background: 'rgba(0,0,0,0.55)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        padding: '5px 11px',
        color: muted ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)',
        fontSize: '0.95rem',
        cursor: 'pointer',
        lineHeight: 1,
        transition: 'color 0.15s',
      }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
