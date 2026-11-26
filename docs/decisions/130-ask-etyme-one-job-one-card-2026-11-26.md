# 130 — Ask Etyme: one job, one card — 2026-11-26

**The tester, 2026-11-26:** "help end user do his one thing really well.
Less words more math. Clarity should beat the transparency." The tester
then took the lead's recommendation.

## The rule

One person does one job, and does it well. The screen shows the next
decision for that job, and nothing else.

`Screen = f(role) → 1 job → N decisions → 1 next action`

The chain: Owner → Role → Agent → {Skills ∩ Permissions} → Cards →
Person (Yes or Not now) → Ledger.

## The screen: three zones

1. **The score bar:** Due · Late · On time %.
2. **The next card:** one card, with a name, a figure and an action, and
   two buttons, Yes and Not now.
3. **Below it:** the queue count, the count done today, the agent switch,
   and one input box.

No sentences on a card. The detail (the rule, the source, the ledger)
sits one tap away under "Why".

## The math

**The queue order is:**

`score = urgency × value × confidence`

- **urgency** = 1 / max(1, days to due). A late card is 2.
- **value** = the money at stake ÷ the role's median.
- **confidence** = the skill checker's pass rate.

**The score bar:**

| Figure | Counts |
|---|---|
| Due | cards owed today |
| Late | cards past due |
| On time % | done on time ÷ done × 100 |
| Agent load % | agent cards ÷ all cards × 100 |
| Touch time | median seconds from open to Yes |

## Targets, confirmed

| Measure | Target |
|---|---|
| Cards per decision | 1 |
| Clicks per decision | 1 |
| Words per card | 12 or fewer |
| Touch time | 10 seconds or less |
| Agent pass rate | 95% or more |

## Controls

- **Who sees a card:** the seat that owes it. A named person comes before
  a role.
- **What an agent may do:** skills ∩ the role's permissions ∩ the Owner's
  switch.
- **Sends:** only inside an approved task, and only the approved text.
- **Never an agent's:** releasing money, signing, a decision about a
  person, or publishing compliance copy.
- **The audit:** every card, every yes, every send and every refusal is a
  ledger row: who · what · when · why.
- **Money and bank acts** need a passkey, then a fresh second check.

## The words

The trade's short words, never the system's:
- "Approve week", "Pay invoice", "Not now";
- figures such as 40.0 h, $3,200 and Late 2 d.

## No versions

The tester: "Don't go versioning." Each piece is designed and built
whole. Connecting delivery tools is one sync engine with an adapter for
each tool (a spreadsheet, an issue tracker, a work-management tool, a
service desk), all on one shared status record.

## Build order

1. Roles and permissions on profiles. This exists.
2. An agent per role, with the Owner's switch. This exists.
3. The skill registry and its checkers. Being built.
4. The one-card screen and the queue score. New, and prototyped first.
5. The score bar, plus plan, actual, target and variance (PATV) per agent.
   Being built.
6. The Ask box running skills. Part of this exists.
7. The "Why" drawer. Part of this exists.
