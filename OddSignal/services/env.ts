/// <reference types="vite/client" />
/**
 * This game's deployment environment, fixed at BUILD time.
 *
 * Values come from the repo-root .env.production (`npm run build`, for
 * paigonco.com) or .env.development (`npm run dev` / `npm run build:dev`, for
 * local development against the emulators). Nothing else in the app hardcodes
 * a game server or Firebase project.
 *
 * `realMoney` only decides what this build SHOWS. The game server enforces the
 * same flag on its own, so a modified build cannot open a paid lobby.
 */
const env = import.meta.env as Record<string, string | undefined>;

function required(name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set. See .env.production / .env.development at the repo root.`);
  return value;
}

export const ENV = {
  name: required('VITE_PAIGON_ENV'),
  serverUrl: required('VITE_SERVER_URL'),
  firebase: {
    apiKey: required('VITE_FIREBASE_API_KEY'),
    authDomain: required('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: required('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: required('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: required('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: required('VITE_FIREBASE_APP_ID'),
  },
  // Fail closed: anything other than the exact string "true" is off.
  realMoney: env.VITE_ENABLE_REAL_MONEY === 'true',
  // Only present where deposits exist (development, test mode). Production
  // carries no payment key at all.
  stripePublishableKey: env.VITE_STRIPE_PUBLISHABLE_KEY ?? '',
  useEmulators: env.VITE_USE_EMULATORS === 'true',
} as const;
