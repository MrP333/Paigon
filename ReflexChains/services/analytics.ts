import mixpanel from 'mixpanel-browser';
import { ENV } from './env';

// Production only: development and test traffic must never land in the real
// analytics project. `ip: false` stops Mixpanel recording the visitor's IP
// address, and players are identified by account ID alone — no names or
// emails are sent. Both are stated in the privacy policy; keep them true.
const enabled = ENV.name === 'production';
if (enabled) mixpanel.init('7076e016bcaed3bf6fa0992d2f23ab3b', { debug: false, track_pageview: false, ip: false });

export function identifyUser(uid: string) {
  if (enabled) mixpanel.identify(uid);
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!enabled) return;
  try { mixpanel.track(event, props); } catch { /* no-op */ }
}
