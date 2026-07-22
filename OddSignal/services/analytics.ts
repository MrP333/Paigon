import mixpanel from 'mixpanel-browser';

mixpanel.init('7076e016bcaed3bf6fa0992d2f23ab3b', { debug: false, track_pageview: false });

export function identifyUser(uid: string, name: string) {
  mixpanel.identify(uid);
  mixpanel.people.set({ $name: name });
}

export function track(event: string, props?: Record<string, unknown>) {
  try { mixpanel.track(event, props); } catch { /* no-op */ }
}
