# Briefing for gaming counsel

Prepared by the engineering side to make a first consultation efficient. It
states facts about the product and asks questions. **It contains no legal
conclusions**, and nothing in the codebase should be read as one.

## The company

- Paigon LLC, a Wyoming LLC, owned 50/50 by two members.
- No gaming counsel retained as of October 2026. No payment processor approved.
- **No real-money transaction has ever occurred.** A Stripe integration exists
  in test mode only and is now disabled by server-side flags.

## The product today (V1)

Free-to-play online competitions in five browser games, lobbies of 3–5
players, no entry fees, no prizes, no cash-convertible currency. Results feed a
public leaderboard. Users must be 18+ (date-of-birth gate plus a checkbox).

## The proposed product (V2) — the subject of the advice

Players deposit US dollars, represented as Paigon Credits (proposed 1 credit =
$0.10). Credits pay entry fees for matches; the winner receives the pool minus
a 2% platform fee (5 × $5 entries → $24.50 prize, $0.50 fee). Players may
withdraw eligible balances to their bank. Also proposed: tournaments (prize
split 50/25/15/10), and a subscription product ("Shark Mode").

## The games: how outcomes are decided

All five share these properties:

- **Identical content.** Every player in a match receives the same game,
  generated from one seed (the room code): the same maze, the same targets,
  the same shape sets, the same course, the same passage.
- **No random events during play** decided by the game's rules.
- **Results checked by the server**, not taken from the player's browser.

| Game | What the player does | How the winner is decided | Evidence available |
|---|---|---|---|
| Mazer | navigates a 3D maze to the exit | fastest time among players the server saw reach the exit | per-match route efficiency (optimal moves ÷ moves taken), computed by the server |
| Reflex Chains | clicks appearing targets for 30 s | server-computed score | per-hit timing |
| Odd Signal | picks the odd shape out of six, repeatedly, for 30 s | most correct answers (server-counted), time as tiebreak | per-answer correctness and time |
| Dash | steers a runner for a fixed 90 s, collecting tokens | most tokens, from the server replaying the player's inputs; published tiebreaks | full input trace per run |
| TypeStrike | types a passage | fastest accurate completion, bounded by the server's clock | progress stream |

**Measured skill dominance (Dash, simulation).** In 5-player lobbies, a
player 50 ms faster to react than four otherwise-identical opponents wins
93.1% of matches at a 2% error rate and 77.6% at 5%, against a 20% chance
baseline. Similar studies can be run for the other games from recorded data.

**Factors a reviewer may treat as chance-like, which we have not eliminated:**
who you are matched against (no skill-based matchmaking yet); network latency
and hardware (mitigated in Dash by fixed-step simulation, not eliminated
elsewhere); a tie broken by published rules; a disconnect.

## Questions for counsel

1. Under which states' laws could the proposed V2 constitute gambling, a
   lottery, or a regulated contest, and which test (dominant factor, material
   element, any-chance, or statutory) applies in each?
2. Is the current self-assessed restricted list (AZ, AR, CT, DE, IN, IA, LA,
   MD, MT, SC, SD, TN) right? Its origin is not documented and it has not been
   reviewed by a lawyer.
3. Do player-funded prize pools with a platform fee change the analysis
   compared with sponsor-funded prizes?
4. Does holding player balances create money-transmission or stored-value
   obligations, or can the payment provider's structure carry them?
5. Do tournaments, multi-place prize splits or a subscription product change
   anything?
6. Age verification standard required (self-attested DOB today), and
   identity verification at deposit or at withdrawal?
7. Geolocation: is billing-address or IP-based restriction sufficient, or is
   device geolocation required in some states?
8. Tax reporting obligations for winnings, and what to collect from players.
9. Required consumer disclosures, responsible-gaming tools (deposit limits,
   self-exclusion, cooling-off), and complaint handling.
10. Review of Terms of Service (governing law is Wyoming; arbitration clause;
    an HTML comment already flags the Wyoming choice for review), Privacy
    Policy (Mixpanel analytics now disclosed), Restricted States and
    Responsible Gaming pages.
11. Is it acceptable to describe paid competitions publicly as "a possible
    future feature, subject to legal review and payment-provider approval"
    (current site wording)?

## What counsel will likely ask us for

- Formation documents and operating agreement.
- A product walkthrough and the rules of each game.
- The proposed money flow (see FINANCIAL_ARCHITECTURE.md) and fee schedule.
- Payment-provider correspondence (see AEROPAY.md).
- Data on skill dominance per game (we can generate this from recorded
  matches and simulations).
- Current Terms, Privacy, Restricted States and Responsible Gaming pages.

## Changes made to public pages without legal review

Factual corrections only, to stop the site describing features that do not
exist: a "Current status" notice on Terms, Privacy, Restricted States; removal
of "Paigon does not constitute gambling under applicable US law" and similar
conclusions; removal of statements that Stripe processes payments, that
identity checks and IP fraud monitoring run, and that "all other states are
permitted for paid competition". Terms section 1 now separates account
eligibility (18+) from paid-competition eligibility. Every page should be
reviewed as a whole by counsel before V2.
