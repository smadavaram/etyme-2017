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
