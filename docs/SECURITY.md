# Security and anti-cheat checklist

Prioritised. "Done" items are on `v1/free-play-launch` with tests named.

## Done

| Item | Test |
|---|---|
| Money flags fail closed; production ignores env vars | `server/tests/flags.test.cjs` |
| Paid stakes refused on all five queues; payment and tournament endpoints 404 | `integration.test.cjs` "production: money is off…" |
| Dash legacy finish removed; replay validation is the only path | `integration.test.cjs` "Dash: a legacy…", parity test |
| Mazer win requires the server-tracked position at the exit | `integration.test.cjs` "Mazer: a win claimed away…" |
| Results, history, leaderboard, activity written only by the server | rules tests + "a verified win is recorded…" |
| Profile allowlist; no browser admin exception; verified email for server admins | `tests/firestore-rules` |
| Homepage XSS: escaped rendering, sanitised names, server-only feed | rules tests + headless page checks |
| Self-exclusion cannot be cut short; usernames cannot be hoarded | rules tests |
| Account deletion server-side, recent login required | "account deletion removes…" |
| CORS only for the site's origins | "HTTP routes answer the browser CORS preflight…" |
| Rooms cannot stay open forever (deadline + sweeper) | code review; Dash deadline exercised by the full-race test |
| Release gate against development bundles | `npm run check:bundles` (verified to reject one) |

## Open — before real money

1. **Bots and automation.** Nothing distinguishes a script from a person. Most
   exposed: TypeStrike (a bot typing just under 24 keys/s is accepted) and
   Reflex Chains (perfect clicking). Options, cheapest first: per-account
   behavioural flags from data the server already has (inhuman consistency of
   timing); Cloudflare Turnstile at signup and queue (free tier); identity
   verification for paid play, which the payment provider will require anyway.
   reCAPTCHA alone does not stop a determined bot inside a game.
2. **One account per person.** Not enforced. For paid play, identity
   verification through the payment provider is the practical control.
3. **Collusion** (two accounts in one lobby, one throwing). Needs per-pair
   history and review tooling. Matters only with money.
4. **Mazer and TypeStrike timing** is client-measured within server bounds.
   Acceptable for free play. For paid play, consider server-replayed inputs the
   way Dash does it.
5. **Tournament code** has not been reviewed for money correctness and its Dash
   path ranks on a field parity runs do not have. Keep tournaments off until
   rewritten on the ledger.
6. **Rate limiting** is in-memory per server instance; fine with one instance,
   not with several.
7. **Admin access** is an email list. Move to Firebase custom claims and
   require multi-factor sign-in for admins before any money exists.
8. **Ties in the current paid code keep the entries** (nobody is paid, nobody
   refunded). The V2 ledger refunds ties; the old code must not be switched on.

## Ongoing

- Never put a secret in a `VITE_` variable or in `env.js`.
- Deploy `firestore.rules` only after `npm run test:rules` passes.
- `npm run check:bundles` before every site deploy.
- Do not run penetration tests against production; use `npm run dev:stack`.
