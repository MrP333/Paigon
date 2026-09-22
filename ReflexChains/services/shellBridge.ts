import { useEffect, useRef } from 'react';

/**
 * Bridge between a game running in the site's overlay iframe and the page
 * shell around it (game-website/game-shell.js).
 *
 * Outbound: we tell the shell which screen we're on, so it can show a live
 * status and warn before closing a match that's actually in progress.
 * Inbound: when the player closes the overlay, the shell asks us to reset —
 * that's what makes the game go back to its home screen instead of quietly
 * running on behind a hidden overlay.
 *
 * Screen names are shared with the shell; 'game' means "a match is live".
 */
export function useShellBridge(screen: string, onReset: () => void) {
  const resetRef = useRef(onReset);
  resetRef.current = onReset;

  useEffect(() => {
    if (window.parent === window) return;
    try {
      window.parent.postMessage(
        { source: 'paigon-game', type: 'state', screen },
        window.location.origin,
      );
    } catch {
      /* not embedded by the site shell — nothing to report to */
    }
  }, [screen]);

  useEffect(() => {
    if (window.parent === window) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { source?: string; type?: string } | null;
      if (!data || data.source !== 'paigon-shell') return;
      if (data.type === 'reset') resetRef.current();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
}
