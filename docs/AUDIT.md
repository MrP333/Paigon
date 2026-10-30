# Repository audit — October 2026

What the code actually did when audited, not what the UI suggested. Every
"confirmed" item was reproduced: exploits against a **local** copy of the
server, security rules against the Firestore **emulator**, pages in headless
Chrome. Nothing was tested against production beyond public, read-only
requests.

Status: **Fixed** = changed on branch `v1/free-play-launch` and tested.
**Open** = needs a decision, a dashboard action, or later work.

## Critical

| # | Finding | How confirmed | Status |
|---|---|---|---|
| C1 | **Dash could be won by cheating.** The old `dash:finish` message ("I finished in N ms") was still accepted. Sent once 25 s into a 90 s race, it resolved the room 15 s later with the sender as winner; honest runs were discarded. In a paid lobby the pot would have been paid to the cheater. | Reproduced against a local server with bots | Fixed: legacy path removed; every room is replay-validated |
| C2 | **Mazer could be won without solving the maze.** The winner was whoever reported the lowest time; nothing checked they reached the exit. The first claim also closed the race for everyone 5 s later. | Code + local test | Fixed: server requires its tracked position to be the exit |
| C3 | **Stored XSS on the homepage.** The leaderboard and activity feed put player-chosen names into `innerHTML`, and any signed-in user could write activity entries. Script would run for every visitor with their session. | Emulator (writes allowed) + code | Fixed: escaped rendering, server-only writes, names sanitised |
| C4 | **Admin rights from an unverified email.** Rules and admin endpoints trusted `email` without `email_verified`. Anyone registering an unclaimed admin address could grant themselves credits and run tournament admin actions. | Emulator | Fixed: no browser admin exception; server requires a verified email |

## High

| # | Finding | Status |
|---|---|---|
| H1 | **Signup broken on 6 of 7 forms**: they wrote `balanceCents` on create, which the rules reject. Accounts existed with no profile or username. | Fixed: one shared `profile.js`; repairs old accounts on sign-in |
| H2 | **Results written by the browser**: wins, match history, activity feed, leaderboard attempts. All spoofable. | Fixed: server writes everything from verified results |
| H3 | **No environment separation**: one Firebase project hardcoded in 20 places, one server URL in 12. Any test touched production data. | Fixed in code (env.js / .env files / emulators). Hosted dev environment is **Open** (needs accounts — see ENVIRONMENTS.md) |
| H4 | **Paid play live in production**: paid stakes in all five games, a working Stripe deposit endpoint, tournaments with buy-ins. | Fixed: server feature flags, fail closed |
| H5 | **Public copy promised things that do not exist** (real-money wins, instant payouts, withdraw anytime, Stripe processing, ID checks, "not gambling under US law", "all other states permitted"). | Fixed; legal pages flagged for counsel (LEGAL_READINESS.md) |
| H6 | **No CORS on the server's HTTP routes.** Every browser call to them failed at preflight — deposits, tournament reservation and admin tools never worked from the site. | Fixed |
| H7 | **Mazer had no free competitive lobby** in its UI (only solo practice or paid). | Fixed: Free lobby added |
| H8 | **Rooms could stay open forever**: a Dash room with a silent player, or any room where nobody finished. | Fixed: Dash deadline + sweeper |

## Medium / low

- Account deletion left the profile behind (rules denied it; error swallowed). **Fixed** — server endpoint deletes everything and anonymises the player in others' records.
- Self-exclusion could be cleared instantly by the player. **Fixed** in rules.
- Usernames could be hoarded. **Fixed** in rules.
- `room:join` could add any socket to a running matchmade room (dead code). **Removed.**
- Stripe.js loaded on every game and account page view. **Fixed** (loads only where deposits are enabled).
- Mixpanel received usernames and, as a fallback, email addresses, and recorded IPs. **Fixed**; now disclosed in Privacy.
- Typecheck was blind: React 19 types against React 18 (Dash, Mazer), none at all (Odd Signal). **Fixed**: all five games 0 errors.
- 13,506 `node_modules` files committed under ReflexChains. **Untracked.**
- Dash wins never reached the leaderboard. **Fixed.**
- Tournament resolution for Dash still ranks on finish time, which replay-validated runs do not have. **Open** — unreachable while paid tournaments are off; must be fixed before tournaments ship.
- TypeStrike: a bot typing just under the 24 keys/s ceiling cannot be told from a human. **Open** — see SECURITY.md.

## What already worked

Matchmaking (3–5 player lobbies, verified with live three-player matches),
seeded identical content in all five games, Dash's server-side replay
validation, Reflex and Odd Signal server scoring, Firebase Auth, and most of the
Firestore rules (balances already server-only, private profiles).
