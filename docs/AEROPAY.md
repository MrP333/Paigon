# Aeropay: requirements and open questions

Compiled October 2026 from Aeropay's public developer documentation and
announcements, cited inline. Anything not found there is listed as a
**question to ask Aeropay**, not assumed. No Aeropay code exists in the
repository; nothing here is integrated.

## Confirmed from the developer docs

- **Model.** Pay-by-bank: users link a bank account through Aeropay's
  aggregator ("Aerosync"); deposits are "standard transactions" (user →
  merchant) and payouts are "payout transactions" (merchant → user), whose
  documented uses include withdrawals and rewards.
  [API overview](https://dev.aero.inc/docs/api-overview) ·
  [Quick start](https://dev.aero.inc/docs/api-quick-start)
- **Key endpoints** (v2): `POST /v2/user`, `POST /v2/confirmUser`,
  `GET /v2/bankAccounts`, `POST /v2/transaction`, `POST /v2/payoutTransaction`
  (with an `rtp` flag for real-time payments), `POST /v2/reverseTransaction`
  (void / partial / full refund), `GET /v2/transaction/{id}`,
  `POST /v2/transactionSearch`, and transaction reports for reconciliation.
  [Docs index](https://dev.aero.inc/llms.txt)
- **Amounts** are integer cents, USD only — the same as the V2 ledger.
- **Idempotency.** Optional `Idempotency-Key` header on transaction, payout
  and preauth calls; honoured for at least 24 hours; a reused key returns the
  first response even if the body differs. Paigon's ledger keeps its own
  permanent idempotency, so the provider key is a second layer, not the only
  one.
- **Settlement timing.** Transactions stay `pending` until 3 business days
  after creation; declines can arrive later with ACH return codes (e.g.
  `R01`), and voids can arrive hours after completion.
  [Webhooks](https://dev.aero.inc/v1.1/docs/webhooks-1)
- **Webhooks.** Topics include `transaction_completed`, `transaction_voided`,
  `transaction_declined`, `transaction_refunded`, `user_suspended`,
  `user_active`. Required for production: voided, declined, user_suspended,
  user_active. Up to 5 retries with backoff.
- **Webhook signing is optional** (HMAC-SHA256, `ap-signature` header,
  one key per merchant, rotation invalidates the old key immediately, no
  replay protection described).
  [Webhook security](https://dev.aero.inc/docs/webhook-security.md)
  → Paigon must enable signing **and** confirm every event by fetching the
  transaction (`GET /v2/transaction/{id}`) before crediting anyone.
- **Launch checklist** requires SMS MFA (email-only not approved for
  production), checking `userStatus` before every payment and payout,
  re-crediting users when a payout is declined or voided, handling voids that
  arrive hours later, name matching as part of KYC, and — for stored-value
  wallets — freezing or deducting funds on fraud, a withdrawal waiting period
  for new users (3 business days recommended) and play-through requirements.
  Approval is by an Aeropay Solutions Engineer reviewing demo videos and
  answers, plus Aeropay's Terms and Privacy excerpts in Paigon's own pages.
  [Launch checklist](https://dev.aero.inc/docs/launch-checklist-api-integrations.md)

## Public context (not commitments)

Aeropay markets pay-by-bank to gaming operators and names PrizePicks as a
client; trade press reports banking partners UBank (same-day ACH) and Cross
River (RTP / FedNow).
[Aeropay × PrizePicks](https://www.aeropay.com/blog/game-changing-payment-solution-aeropay-teams-up-with-prizepicks) ·
[Banking Dive](https://www.bankingdive.com/news/aeropay-partners-cross-river-ubank-sports-betting-payouts/706913/) ·
[Aeropay gaming payments](https://www.aeropay.com/blog/gaming-payments-options)

## Questions Aeropay must answer in writing before any build

1. Will Aeropay approve **skill-based competitions with player-funded entry
   fees and prizes** for Paigon specifically? Under what merchant category,
   and with what conditions?
2. May Paigon hold **stored player balances** (a wallet), or must funds move
   per match? If stored: who holds the funds — Paigon's operating account, a
   segregated FBO / custodial account, or a partner bank?
3. Does Paigon need its own **money-transmitter licensing**, or does
   Aeropay's (or a partner bank's) arrangement cover the flow of player funds?
4. **KYC**: what does Aeropay verify (name, DOB, SSN, address)? Is it enough
   for Paigon's age (18+) and identity requirements, or is a separate
   provider needed?
5. **Geolocation / state eligibility**: does Aeropay restrict by state for
   this use case, and does it provide any location verification?
6. **Pricing**: per deposit, per payout (standard vs RTP), returns, refunds,
   monthly minimums. Needed for the economics in FINANCIAL_ARCHITECTURE.md.
7. **Payout destinations**: always the same bank that funded the deposit?
   Limits per payout and per day?
8. **Returns after payout**: if a deposit returns after the player has
   withdrawn, who bears the loss?
9. **Reserve / rolling holdback** requirements on Paigon's settlements.
10. **Reconciliation**: which report gives transaction-level settlement
    status, and how often?
11. Is the documented `Idempotency-Key` window (≥ 24 h) configurable?
12. Requirements for Terms, Privacy and responsible-gaming disclosures.

## How it plugs in

Implement `MazerGame/server/ledger/providers/aeropay.cjs` against the
contract in `providers/provider.cjs`:

| Contract | Aeropay |
|---|---|
| `initiateDeposit` | `POST /v2/transaction` (after user + bank linking) |
| `getDepositStatus` | `GET /v2/transaction/{id}` |
| `verifyWebhook` | `ap-signature` HMAC check, **then** re-fetch the transaction |
| `initiatePayout` | `POST /v2/payoutTransaction` |
| `getPayoutStatus` | `GET /v2/transaction/{id}` |
| `listTransactions` | `POST /v2/transactionSearch` / transaction reports |

Webhook → ledger: `transaction_completed` on a deposit → `creditDeposit`
(pending); 3 business days without a decline → `settleDeposit`;
`transaction_declined` / `transaction_voided` with a return code →
`reverseDeposit`; payout completed → `completeWithdrawal`; payout declined or
voided → `failWithdrawal` (Aeropay requires the re-credit).

Existing Stripe code stays in place, disabled by the flags, until the
provider decision is final; it should then be removed rather than kept
alongside.
