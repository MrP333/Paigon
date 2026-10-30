# Architecture

## Repositories

| Path | Repo | Deploys to | What it is |
|---|---|---|---|
| `/` (this repo) | MrP333/Paigon | nothing | Dash, Reflex Chains, Odd Signal, TypeStrike sources; Firestore rules; shared `.env.*`; docs; tests |
| `MazerGame/` | submodule MrP333/Mazer_Game1.2 (+ `server-deploy` → Mazer_Game1.1) | **Railway** (from `server-deploy`) | Mazer source **and the shared game server** for all five games (`server/`) |
| `game-website/` | submodule MrP333/my-game-site | **Vercel → paigonco.com** | Static site + the five games' built bundles (`*-app/`) |

Pushing `game-website` deploys the site. Pushing `MazerGame` to `server-deploy`
deploys the server. Pushing anything else deploys nothing.

## Runtime

```
browser ── paigonco.com (Vercel, static) ── page + game <iframe>
   │                                          │
   ├── Firebase Auth / Firestore (project paigonco)
   └── Socket.IO + HTTP ── game server (Railway, MazerGame/server/index.cjs)
                              └── Firebase Admin SDK (bypasses rules)
```

- **Pages** (`game-website/*.html`) are hand-written HTML with inline module
  scripts using the Firebase CDN SDK. Shared pieces: `env.js` (environment),
  `profile.js` (profile creation, `escapeHtml`), `firebase-env.js` (emulators),
  `nav.js`, `age-gate.js`, `game-shell.js` (overlay ↔ game messages),
  `analytics.js` (first-party usage counts to the game server; no cookies or
  identifiers). `admin.html` shows those counts and the review queue.
- **Games** are React + Vite apps; `npm run build` in a game writes its bundle
  into `game-website/<game>-app/`. Mazer and Dash use React Three Fiber.
- **Game server** (`MazerGame/server/index.cjs`) does matchmaking, runs each
  match, validates results, and records them. It is the only writer of results,
  balances and the leaderboard.

## Matches

1. Client emits `<game>:queue` (`queue:join` for Mazer) with a stake.
   The server refuses paid stakes unless real money is enabled (`flags.cjs`).
2. At 5 players, or 3+ after a 30 s fill wait, the server creates a room from a
   random room code. The room code is the **seed**: every client generates the
   identical maze / targets / sets / course / passage from it.
3. During play the server checks what it can see: Mazer moves (one legal cell at
   a time), Reflex hits, Odd Signal answers, TypeStrike progress, Dash position
   reports.
4. At the end the server decides the result:
   - **Dash**: replays the player's input trace through `server/runner.cjs`,
     bit-identical to the client engine (`Dash/engine/test-runner-parity.mts`).
   - **Mazer**: lowest time among players the server saw reach the exit.
   - **Reflex / Odd Signal**: server-computed score.
   - **TypeStrike**: reported time, bounded by the server's own clock.
5. `recordMatch()` writes the result (below). Each run first goes through
   `server/integrity.cjs`; a run a person is very unlikely to produce keeps its
   match result but earns no leaderboard win or activity entry until an admin
   clears it (admin page → Held for review). Rooms that never resolve are
   expired by a sweeper (players get `match:expired`); Dash rooms have a hard
   deadline.

## Firestore data model

| Collection | Written by | Read by | Contents |
|---|---|---|---|
| `users/{uid}` | browser (allowlisted fields) + server | owner | profile, preferences, cosmetic streaks, practice counters; legacy server fields |
| `users/{uid}/matches/{game_room}` | server | owner | verified match history; `underReview` while held |
| `usernames/{lower}` | browser, in a transaction with the profile | signed-in | uniqueness index |
| `leaderboard/{uid}` | server | public | name, gamesPlayed, totalWins, per-game played/wins |
| `matchResults/{game_room}` | server | public | every participant, rank, score, Mazer route efficiency |
| `recentActivity/{id}` | server | public | homepage feed |
| `metrics/{date}`, `metrics/{date}/players/{uid}` | server | admin page (via server) | usage counts from games and `POST /events` (site); no personal data |
| `integrityFlags/{game_room_uid}` | server | admin page (via server) | runs held for review, reasons, review status |
| `tournaments`, `tournamentSchedules` | server | public / signed-in | tournament system (off) |
| `stripeEvents` | server | nobody | webhook idempotency (off) |

Rules: `firestore.rules`, tested by `tests/firestore-rules/`.

## Feature flags

`MazerGame/server/flags.cjs` — enforced by the server, fail closed. Production
never enables money from environment variables. See ENVIRONMENTS.md.

## V2 (branch `development` only)

`MazerGame/server/ledger/` — double-entry ledger simulation, wallet operations,
payment-provider interface and mock, reconciliation. Not imported by the
server. See FINANCIAL_ARCHITECTURE.md.
