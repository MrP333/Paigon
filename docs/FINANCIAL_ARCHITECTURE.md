# V2 financial architecture (proposed)

**Status: design plus a working simulation with fictional money, on branch
`development` only. Not approved by counsel or any payment provider. Nothing
here runs in production.**

Code: `MazerGame/server/ledger/` · Tests: `server/tests/ledger.test.cjs`
(22, all passing) · Walkthrough: `npm --prefix MazerGame run sim:ledger`

## Why not a balance field

The current paid-play code keeps one number, `users/{uid}.balanceCents`, and
adds or subtracts from it. That cannot answer "where did this money come from",
cannot be reconciled with a bank, loses history when a write fails halfway,
and turns every bug into an untraceable change in someone's balance. The V2
design replaces it entirely.

## Design

**Double-entry ledger.** Money moves between accounts in transactions whose
entries sum to zero. A balance is the sum of everything ever posted to an
account. All balances together always sum to zero, which is checked by
replaying the whole log (`verify()`).

| Account | Meaning | Constraint |
|---|---|---|
| `user:{uid}:available` | spendable | ≥ 0 |
| `user:{uid}:pending` | deposited, not yet settled (ACH can still be pulled back) | ≥ 0 |
| `user:{uid}:held` | reserved for a withdrawal in flight | ≥ 0 |
| `user:{uid}:receivable` | owed by the player after a reversal | ≤ 0 |
| `match:{id}:escrow` | entry fees for a live match | ≥ 0 |
| `platform:fees` | revenue | — |
| `platform:adjustments` | the other side of audited manual corrections | — |
| `provider:{name}:clearing` | money in transit with the payment provider | — |

**Guarantees, each tested:** integer cents only; balanced; atomic;
serialized (two simultaneous spends of one balance: exactly one succeeds);
idempotent per real-world event (a webhook delivered twice credits once; a
reused key with different content is refused); immutable, corrected only by
reversals; every transaction carries actor and reason.

## Lifecycle

| Event | Transaction | Key |
|---|---|---|
| Deposit received, not settled | clearing → pending | `deposit:{provider}:{ref}` |
| Deposit settled | pending → available | `deposit-settle:{provider}:{ref}` |
| Deposit returned (ACH return, chargeback) | pending, then available → clearing; any shortfall → receivable, account frozen | `deposit-return:{provider}:{ref}` |
| Match entry | available → escrow | `entry:{match}:{uid}` |
| Match settled (server-verified result only) | escrow → winner(s) + fees | `settle:{match}` |
| Tie or cancellation | escrow → each player, no fee | `refund:{match}:{uid}` |
| Withdrawal requested | available → held | `withdraw-hold:{id}` |
| Withdrawal paid | held → clearing | `withdraw-paid:{id}` |
| Withdrawal failed | held → available | `withdraw-release:{id}` |
| Manual correction | available ↔ adjustments, named person + reason + ticket | `adjust:{ticket}` |

Settlement requires `{ verified: true }` from the game server. A client
report can never trigger a payout.

## Economics of the proposed model

Fee: 2% of the pool, rounded **down** to the cent (players get the fraction).

| Match | Pool | Fee | Prize |
|---|---|---|---|
| 5 × $5.00 | $25.00 | $0.50 | $24.50 |
| 3 × $1.00 | $3.00 | $0.06 | $2.94 |
| 3 × $0.50 | $1.50 | $0.03 | $1.47 |
| Tournament, 8 × $5.00, split 50/25/15/10 | $40.00 | $0.80 | $19.60 / $9.80 / $5.88 / $3.92 |

**The 2% does not obviously cover costs.** Each $5 entry earns $0.10. Unknown
until the provider quotes them:

- the fee per deposit and per payout (pay-by-bank is usually priced per
  transaction, not as a percentage),
- returns and fraud losses (an ACH return after the money was played is a
  debt that may not be recoverable),
- identity verification per user.

Per player, contribution ≈ `0.02 × total entries − deposit fees − payout
fees − expected losses`. If a player deposits $5 and plays one $5 match, the
platform earns $0.10; any per-deposit fee above $0.10 makes that player
unprofitable. Minimum deposits, minimum withdrawals, withdrawal frequency and
the fee itself are the levers. **Management decision needed once real
pricing is known.**

## Decisions still open

1. **Storage for real money.** The simulation is in memory. For production
   the store must give the same guarantees transactionally. Recommendation: a
   relational database with serializable transactions (Railway offers
   PostgreSQL; usage-based cost — confirm on your plan) rather than Firestore,
   because the constraints (balance never below zero, unique idempotency key)
   are then enforced by the database itself. Approval needed.
2. **Custody.** Whether Paigon may hold player balances at all (stored value),
   or must move money per match, depends on the provider and counsel. The
   ledger supports both: per-match funding is deposit → entry → settle →
   immediate payout.
3. **Reversed deposit inside an open match.** The simulation freezes the
   account and records the debt, but the entry stays in that match's escrow.
   Policy needed: void the match, or let it settle and pursue the debt.
4. **Withdrawal waiting period.** Aeropay's checklist recommends 3 business
   days for new users. Also play-through requirements.
5. **Tax reporting** thresholds and data collection (counsel / accountant).
6. **Ties**: refund with no fee (implemented) vs. split the pool.
7. **Dormant balances and escheatment** (state unclaimed-property law).
