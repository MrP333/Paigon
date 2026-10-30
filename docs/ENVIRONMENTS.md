# Environments, branches and feature flags

## The model

| Environment | Code | Site | Game server | Firebase | Money |
|---|---|---|---|---|---|
| **Production** | `main` | paigonco.com (Vercel) | Railway, existing service | project `paigonco` | off, always |
| **Staging / V2 dev** (to be created) | `development` | Vercel preview of `development` | a second Railway service | a second project, e.g. `paigon-dev` | simulated only |
| **Local** | any branch | `localhost` | your machine, port 3100 | emulators, project `demo-paigon` | simulated only |

Feature branches (`v1/...`, `feat/...`) merge into `main` (production) or
`development` (V2). **A git branch isolates code, not data**: until the staging
Firebase project and server exist, anything deployed from `development` talks
to production. That is why staging falls back to production values with money
off (see `game-website/env.js`) until its own values are filled in.

## Where configuration lives

| What | Where | Notes |
|---|---|---|
| Site: Firebase project, server URL, UI flags | `game-website/env.js` | one file, three configs chosen by hostname |
| Games: same | `.env.production`, `.env.development` (repo root) | read by every game's Vite build; public values only |
| Server: flags and secrets | Railway environment variables | never in git |
| Firestore rules | `firestore.rules` | the same rules for every project |

Anything prefixed `VITE_` ends up in the JavaScript every visitor downloads.
Never put a secret there.

## Feature flags (server)

`MazerGame/server/flags.cjs`, enforced on the server, readable at `GET /config`.

| Variable | Effect |
|---|---|
| `PAIGON_ENV` | `production`, `staging` or `development`. Missing or unknown = **production**. |
| `ENABLE_FREE_PLAY` | on unless exactly `false` (an incident switch) |
| `ENABLE_REAL_MONEY` | paid stakes and payouts |
| `ENABLE_DEPOSITS` | deposit endpoints (requires real money) |
| `ENABLE_WITHDRAWALS` | reserved (requires real money) |
| `ENABLE_PAID_TOURNAMENTS` | tournament endpoints (requires real money) |

Money flags need the exact string `true` **and** a non-production
`PAIGON_ENV`. In production they are ignored entirely: enabling real money in
production is a reviewed code change, made once, after legal and payment
approval. The site and games hide paid UI using their own flags, but the
server refuses paid actions regardless of what any page shows.

Railway (production) should have `PAIGON_ENV=production` set explicitly. It is
the default anyway; setting it makes the intent visible in the dashboard.

## Local development

Requirements: Node 20+, and **Java 21** for the Firebase emulators (Temurin 21
is free: https://adoptium.net). The installed Java 16 is too old for
firebase-tools 15.

```bash
npm install                 # repo root, once
npm run dev:stack           # emulators + game server on :3100 — leave running
npm --prefix Dash run dev   # (any game) Vite dev server, already pointed at the local stack
cd game-website && python3 -m http.server 8811   # the site, at http://localhost:8811
npm test                    # rules + server + Dash parity tests, all local
```

Served from `localhost`, the site and games use the emulators and the local
server automatically and show a yellow DEVELOPMENT banner. Emulator data is
thrown away when they stop. Emulator UI: http://localhost:4000.

`npm run build:dev` in a game writes to that game's `dist/`, **never** to
`game-website/`. `npm run check:bundles` fails if a development build ever
ends up there.

## Creating the hosted development environment (needs you)

These steps need dashboard access and create new resources. Costs: a second
Firebase project on the free Spark plan is $0 (Blaze is only needed for paid
features); a second Railway service adds usage-based cost similar to the
current server — check your Railway plan before creating it. Vercel builds
preview deployments automatically on every plan; separately, check which plan
paigonco.com is on, because Vercel's free Hobby plan is for non-commercial use.

1. **Firebase**: console.firebase.google.com → Add project → `paigon-dev`.
   - Build → Authentication → enable Email/Password and Google; add the
     Vercel preview domain under Authorized domains.
   - Build → Firestore → Create database (production mode, US region).
   - Project settings → Your apps → add a Web app; copy its config object.
   - Project settings → Service accounts → Generate new private key. Keep the
     file private; it goes into Railway only.
   - From the repo root: `npx firebase deploy --only firestore:rules --project paigon-dev`.
2. **Railway**: in the existing project, New → GitHub repo →
   `MrP333/Mazer_Game1.1`, branch `development`. Variables:
   `PAIGON_ENV=staging`, `FIREBASE_SERVICE_ACCOUNT=<the dev key JSON>`,
   `ENABLE_REAL_MONEY=true`. Leave Stripe variables unset. Note its public URL.
3. **Site**: paste the dev config and Railway URL into the `STAGING` block of
   `game-website/env.js`, and add the dev server URL and
   `https://paigon-dev.firebaseapp.com` to `connect-src` / `frame-src` in
   `game-website/vercel.json`.
4. **Games**: copy `.env.development` to `.env.staging` with the dev values,
   add `"build:staging": "vite build --mode staging"` to each game, and build
   on the `development` branch only. `npm run check:bundles` will (correctly)
   refuse those bundles on `main`.
5. Push `development` in `game-website`. Vercel builds a preview at
   `<project>-git-development-<team>.vercel.app`.

Never merge `game-website`'s `development` branch into `main`: promote code,
then rebuild the bundles on `main` with `npm run build`.

## Secrets

| Secret | Lives in | Never in |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Railway variables | git, logs, VITE_ vars, docs |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Railway variables | same |
| future Aeropay credentials, webhook signing key | Railway variables | same |

`scripts/dev-server.mjs` blanks all three when running locally, so a local run
cannot pick up real credentials from your shell.
