# 127 — Pricing strategy, every number for approval — 2026-11-25

**Registered by the tester (BA and architect), under the owner's
delegation (record 123).** The owner asked for "a pricing strategy like
Anthropic would do for Claude". The full document is
pricing-strategy-2026-11-25.md, in the tester's goal files.

**Every number below is [FOR APPROVAL].** Price points are the owner's
money decision. None of them is an adopted price, and no agent quotes one
on any page, screen, card or letter.

## Editions

| Edition | Who | Price |
|---|---|---|
| User | Free forever, inside another tenant's record (record 126, recursive) | Free |
| Starter | A supplier running its own business | [FOR APPROVAL] |
| Business | [FOR APPROVAL]; the tester recommends folding it into Starter at launch | [FOR APPROVAL] |
| Enterprise | Custom annual contract, with a free 60-day pilot (record 126) | [FOR APPROVAL] |

## The usage layer

- Agent actions are metered per action through the ledger, against one
  published rate card.
- The rate card is priced by model-capability tier, following the routing
  in record 125.
- One rate card for everyone; scale does the work.

## The worked example

500 active contractors at $20 per contractor per month comes to $120,000
a year. [FOR APPROVAL]

## Open for the owner

1. The $20 unit per contractor per month.
2. The Enterprise platform fee, and any discount for paying in advance.
3. Whether Business folds into Starter at launch. The tester recommends
   folding it.

## Unchanged

No live price or copy changes before the Saturday release. The home page
line stays "Enterprise free for 60 days".

## LOCKED: the owner approved the strategy and its numbers, Nov 25

The owner adopted the strategy and its numbers as proposed. This replaces
every [FOR APPROVAL] above, except the one figure still open below.

- **Unit:** $20 per active contractor per month. Starter has a floor of
  $199 per month.
- **Enterprise:** the same rate per contractor, plus an annual platform
  fee, after a free 60-day pilot (record 126). Anchor: 500 contractors
  come to $120,000 a year, before the fee and usage.
- **Agent usage:** each action is metered on the ledger and charged from
  a published rate card, priced by capability tier. A tenant that brings
  its own model and keys pays the platform-only rate per action.
- **Paying a year in advance:** about 15% off usage.
- **Editions at launch:** User (free), Starter and Enterprise. Business is
  folded into Starter and is added only when a tenant outgrows Starter.
- **Still open:** the amount of the Enterprise platform fee. The tester is
  putting a proposed figure to the owner. No agent invents one in code or
  in copy.

**Build:** the Saturday batch may include the pricing implementation:
- each tenant's edition;
- the 60-day trial clock;
- the read-only state from day 61;
- the home page line "Enterprise free for 60 days";
- the published rate card.

**The day-61 read-only state is built to the tester's recommendation,
behind one switchable rule.** New work is blocked. Timesheets and invoices
already in progress complete, so workers already placed are paid. The
release notes flag the rule, so the owner's answer can change it without
a rebuild.

## The platform fee is locked: $12,000 a year (the owner, Nov 25)

The Enterprise platform fee is $12,000 a year. No number in the strategy
is still open.

| Item | Price |
|---|---|
| User edition | Free forever, inside another tenant's record, at every level of the network |
| Starter | $20 per active contractor per month, with a floor of $199 a month and a 60-day trial |
| Enterprise | $20 per active contractor per month, plus a $12,000 annual platform fee. A free 60-day pilot first, then a custom annual agreement |
| Usage | Each agent action is metered on the ledger. A published rate card prices actions by capability tier. Paying a year ahead takes about 15% off. A tenant that brings its own model pays the platform-only rate per action |
| Consulting | $200 an hour, unchanged |

The Saturday batch's scope now includes the whole pricing build and the
published rate card page, with these exact figures.

## The tester's answers on the rate card and the timing, 2026-11-26

- **The rate card is published with the locked figures.** Agent usage is
  listed by tier and reads: "Metered per action; rates published before
  metered billing begins."
  - The meter records every action from now on.
  - Nothing is charged per action until the per-tier rates and the
    platform-only rate are approved.
  - No agent invents those rates.
- **Pricing may slip a weekend** (record 107: one item ships each
  weekend). Saturday ships only what has passed its release check and its
  walk by Friday night. Anything that misses is named in the release
  notes and takes next weekend's first slot.

## The supplier platform fee is locked: $1,000 a year (the owner, Nov 25)

The supplier platform fee is $1,000 a year, charged once a year like the
Enterprise fee.

**Starter** is now $20 per active contractor per month plus a $1,000
annual platform fee. The floor stays at $199 a month.

**The rate card's example for a supplier:** 15 contractors cost $3,600 a
year in usage (15 × $20 × 12). Add the $1,000 platform fee, and the total
is $4,600 a year.

The published rate card in the Saturday batch includes this figure.

## The floor covers the contractor charge only (the tester, 2026-11-26)

The $199 monthly floor applies only to the charge per contractor. The
platform fee is always added on top and never counts toward the floor.

Example: a supplier with 3 contractors pays $199 a month, because 3 ×
$20 is $60, which is under the floor. It also pays the $1,000 platform
fee for the year.

## Amendment from the owner, Nov 25: Starter at $19.99, and affiliates earn 40%

The owner: "Let starter be 19.99+ user and offer 40% to affiliates."

1. **The Starter unit is $19.99 per active contractor per month.** It was
   $20.
   - The Starter floor stays $199 a month, and the $1,000 annual platform
     fee is unchanged.
   - The rate card's example: 15 contractors cost $299.85 a month. Over a
     year that is $3,598.20, plus the $1,000 fee, so $4,598.20 all-in. The
     tester quoted it as $4,598, rounded down.
   - The floor example: 3 contractors come to $59.97, which is under the
     floor, so the charge is $199 a month. The $1,000 a year is added on
     top.
   - The Enterprise rate per contractor stays $20, unless the owner
     extends the change. No agent changes it.
2. **Affiliates earn 40%. The 40% is locked; how it is paid is open.**
   - The tester's proposal is with the owner: 40% of the referred tenant's
     subscription revenue, for the first 12 months.
   - No affiliate terms appear on the rate card, or anywhere else, until
     those mechanics are ruled.

**The tester, 2026-11-26:** the rate card shows the supplier example exactly: $4,598.20 a year. A published price is never rounded.

## The affiliate terms are locked (the owner, Nov 25): "And 20% forever."

An affiliate earns:
- 40% of the referred tenant's subscription revenue for the first 12
  months;
- then 20%, for as long as the referred tenant keeps paying.

Subscription revenue is the charges per contractor plus the platform fee.
Usage metered per agent action is not subscription revenue. Neither is
consulting at $200 an hour. The rate card may now state these terms.
