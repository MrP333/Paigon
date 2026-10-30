/**
 * Release gate: is game-website/ safe to serve as paigonco.com?
 *
 *   npm run check:bundles
 *
 * Fails if any committed game bundle was built for development (localhost,
 * emulator project, test payment key), if a bundle does not point at the
 * production server and Firebase project, or if env.js's production
 * configuration has any money flag switched on.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const site = path.join(root, 'game-website');
const prod = Object.fromEntries(readFileSync(path.join(root, '.env.production'), 'utf8')
  .split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => l.split(/=(.*)/s).slice(0, 2)));

let failures = 0;
const fail = (msg) => { failures++; console.log('✖ ' + msg); };

// Vite bakes the build's environment into each bundle as a literal object:
//   {…,VITE_PAIGON_ENV:"production",VITE_USE_EMULATORS:"false",…}
// Every VITE_ value found must match .env.production exactly, and nothing
// that only exists in development (a Stripe test key) may be present.
for (const app of ['mazer-app', 'reflex-app', 'odd-app', 'dash-app', 'typestrike-app']) {
  const dir = path.join(site, app, 'assets');
  if (!existsSync(dir)) { fail(`${app}: no build found`); continue; }
  const js = readdirSync(dir).filter(f => f.endsWith('.js')).map(f => readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const baked = {};
  for (const m of js.matchAll(/\b(VITE_[A-Z_]+):"([^"]*)"/g)) baked[m[1]] = m[2];
  const problems = [];
  if (!Object.keys(baked).length) problems.push('no build environment found in the bundle');
  for (const [k, v] of Object.entries(baked)) {
    if (!(k in prod)) problems.push(`${k} is not a production setting`);
    else if (prod[k] !== v) problems.push(`${k}="${v}" (production is "${prod[k]}")`);
  }
  for (const k of ['VITE_PAIGON_ENV', 'VITE_SERVER_URL', 'VITE_FIREBASE_PROJECT_ID', 'VITE_ENABLE_REAL_MONEY', 'VITE_USE_EMULATORS']) {
    if (!(k in baked)) problems.push(`${k} missing`);
  }
  if (problems.length) fail(`${app}: not a production build — ${problems.join('; ')}. Rebuild with npm run build.`);
  else console.log(`✔ ${app}: production build (${Object.keys(baked).length} settings match .env.production)`);
}

const env = readFileSync(path.join(site, 'env.js'), 'utf8');
const prodBlock = env.slice(env.indexOf('var PRODUCTION'), env.indexOf('var LOCAL'));
if (/realMoney:\s*true|deposits:\s*true|withdrawals:\s*true|paidTournaments:\s*true|useEmulators:\s*true/.test(prodBlock)) {
  fail('env.js: the PRODUCTION configuration has a money or emulator flag switched on');
} else console.log('✔ env.js: production configuration has money and emulators off');

console.log(failures ? `\n${failures} problem(s) — do not deploy` : '\nSafe to deploy as production');
process.exit(failures ? 1 : 0);
