# V1 free-to-play launch checklist

Everything for V1 is on branch **`v1/free-play-launch`** in all three
repositories. `main` is untouched until you approve. Nothing below has been
done yet; each step is yours to run or to ask for.

## 1. Before deciding

- [ ] Read docs/AUDIT.md (what was wrong) and this checklist.
- [ ] **Railway → game server → Variables:** does `STRIPE_SECRET_KEY` start
      with `sk_test_` or `sk_live_`? With V1, deposits are refused either way,
      but if it is live, remove it until a provider is approved.
- [ ] Decide whether to clear the 6 pre-launch leaderboard entries (they look
      like your own testing). Firebase console → Firestore → `leaderboard`.
      Not done automatically: it deletes production data.
- [ ] Optional: install Java 21 so `npm test` runs on your machine.

## 2. Verify (all local, nothing deployed)

```bash
cd ~/Desktop/Paigon
for r in . MazerGame game-website; do git -C $r switch v1/free-play-launch; done
npm install
npm test                 # rules + server + Dash parity (needs Java 21)
npm run check:bundles    # must say "Safe to deploy as production"
```

Results when I ran them: rules 18/18, server 17/17 including the 90-second
full Dash race (`SLOW=1`; it simulates five players in real time, so a
starved machine can make it miss its own clock — one such run failed, the
reruns passed), ledger 22/22 (development branch), Dash parity
bit-identical, all five games typecheck with 0 errors, 14/14 pages load in
headless Chrome with no errors and no money UI, all five games load with the
Free lobby and no paid tiers and make no Stripe requests, and an end-to-end
signup → stats → account deletion test passes 15/15 against the emulators.

Look at it yourself: `cd game-website && python3 -m http.server 8811`, then
open http://localhost:8811 (local data, yellow banner).

## 3. Deploy — in this order

The order matters: the new server works with the old site, but the new site
needs the new server (account deletion, CORS).

**Step A — game server (Railway)**
```bash
cd ~/Desktop/Paigon/MazerGame
git switch main && git merge --ff-only v1/free-play-launch
git push origin main && git push server-deploy main
```
Railway → Variables: add `PAIGON_ENV=production` (it is the default; this
makes it explicit). Wait for the deploy, then check:
`https://mazergame11-production.up.railway.app/config` shows
`"realMoney":false` and `/health` shows the new build.

**Step B — site and games (Vercel)**
```bash
cd ~/Desktop/Paigon && npm run check:bundles      # must pass
cd game-website && git switch main && git merge --ff-only v1/free-play-launch && git push origin main
```

**Step C — Firestore rules**
```bash
cd ~/Desktop/Paigon && npm run test:rules && npm run deploy:rules
```

**Step D — record it**
```bash
cd ~/Desktop/Paigon && git switch main && git merge --ff-only v1/free-play-launch && git push origin main
```

## 4. Smoke test on paigonco.com (about 10 minutes)

- [ ] Homepage: no "real money", "payouts", balance chip or Tournaments link;
      leaderboard and activity render.
- [ ] Register a new account with email → you get a username (this failed
      before). Repeat from a game page, e.g. /dash.
- [ ] Each game opens; lobby shows Free only (Mazer: Practice + Free).
- [ ] Play one free match with 2 other people (3 needed). The winner appears
      in the activity feed; Account shows the match and updated stats.
- [ ] Account → Delete account on a throwaway account → it is gone.
- [ ] /tournaments says tournaments are not available yet.

## 5. Rollback

Fastest, no git needed:
- **Site:** Vercel → Deployments → the previous production deployment →
  "Promote to Production".
- **Server:** Railway → Deployments → the previous deployment → Redeploy.
- **Rules:** Firebase console → Firestore → Rules → history → restore.

With git (keeps history; reverse order of deploy):
```bash
git -C game-website revert --no-edit 67a895a..main && git -C game-website push origin main
git -C MazerGame revert --no-edit 58e90d7..main && git -C MazerGame push origin main && git -C MazerGame push server-deploy main
```
(`67a895a` and `58e90d7` were `main` before this work.) Roll back the site and
server together: the new site needs the new server.

## Known and accepted for V1

- Desktop only; phone layouts are not a launch target.
- TypeStrike and Reflex cannot yet tell a bot from a person (docs/SECURITY.md).
- Tournaments stay hidden until rebuilt on the V2 ledger.
- Legal pages carry factual corrections only; full counsel review is pending.
- The hosted development environment needs accounts you create
  (docs/ENVIRONMENTS.md); local development works today.
