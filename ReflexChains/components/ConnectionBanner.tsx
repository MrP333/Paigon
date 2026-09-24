import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

/**
 * Surfaces socket state to the player.
 *
 * Socket.io reconnects on its own, but it did so silently: a dropped
 * connection mid-match looked exactly like the game having frozen, with no
 * indication anything was happening or would recover. That is the failure most
 * likely to be reported as a hard defect rather than a network blip.
 *
 * Pure inline styles so it drops into every game unchanged.
 */
type State = 'ok' | 'lost' | 'restored';

const CSS = `
@keyframes pg-conn-in { from { opacity: 0; transform: translate(-50%, -10px); }
                        to   { opacity: 1; transform: translate(-50%, 0); } }
@keyframes pg-conn-pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
`;

export default function ConnectionBanner({ socket }: { socket: Socket | null }) {
  const [state, setState] = useState<State>('ok');

  useEffect(() => {
    if (!document.getElementById('pg-conn-css')) {
      const el = document.createElement('style');
      el.id = 'pg-conn-css';
      el.textContent = CSS;
      document.head.appendChild(el);
    }
  }, []);

  useEffect(() => {
    if (!socket) return;
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;

    const onDrop = () => {
      if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = null; }
      setState('lost');
    };
    // Only claim recovery if we had actually dropped, so a first connect is silent.
    const onUp = () => {
      setState(prev => {
        if (prev !== 'lost') return prev;
        restoreTimer = setTimeout(() => setState('ok'), 2200);
        return 'restored';
      });
    };

    socket.on('disconnect', onDrop);
    socket.on('connect_error', onDrop);
    socket.on('connect', onUp);
    return () => {
      socket.off('disconnect', onDrop);
      socket.off('connect_error', onDrop);
      socket.off('connect', onUp);
      if (restoreTimer) clearTimeout(restoreTimer);
    };
  }, [socket]);

  if (state === 'ok') return null;

  const lost = state === 'lost';
  const accent = lost ? '#fbbf24' : '#00ff88';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
        zIndex: 400, display: 'flex', alignItems: 'center', gap: 9,
        padding: '9px 16px', borderRadius: 999,
        background: 'rgba(6,6,12,0.88)', backdropFilter: 'blur(10px)',
        border: `1px solid ${accent}55`,
        boxShadow: `0 0 28px ${accent}22`,
        fontFamily: "'Space Grotesk', Rajdhani, system-ui, sans-serif",
        fontSize: '0.78rem', fontWeight: 700, color: accent,
        letterSpacing: '0.03em', whiteSpace: 'nowrap',
        animation: 'pg-conn-in 0.22s ease-out',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%', background: accent,
          animation: lost ? 'pg-conn-pulse 1s ease-in-out infinite' : 'none',
        }}
      />
      {lost ? 'Connection lost — reconnecting' : 'Reconnected'}
    </div>
  );
}
