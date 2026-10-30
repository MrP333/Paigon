/**
 * Start the game server against the local Firebase emulators.
 * Used by `npm run dev:stack` (which starts the emulators first).
 *
 * Development values only: real money is "on" here so paid flows can be
 * exercised, but every balance lives in the emulator and no payment
 * provider is configured (no Stripe keys), so nothing real can move.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = {
  ...process.env,
  PORT: '3100',
  PAIGON_ENV: 'development',
  ENABLE_REAL_MONEY: 'true',
  GCLOUD_PROJECT: 'demo-paigon',
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099',
  // Never inherit real credentials into a local run.
  FIREBASE_SERVICE_ACCOUNT: '',
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
};
const child = spawn(process.execPath, ['server/index.cjs'], { cwd: path.join(root, 'MazerGame'), env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
