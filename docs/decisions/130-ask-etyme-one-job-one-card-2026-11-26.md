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

## Ask Etyme is the end user's harness (the tester, 2026-11-26)

The tester: "Ask Etyme is the end user harnesser."

Ask Etyme is where a person drives their own agents. It is the
harness's only surface for the end user.

- **In:** a card's Yes or Not now, or the Ask box. A request in the box
  calls a skill.
- **Run:** the agents run the role's skills, within the Owner's
  permissions.
- **Out:** a card, a figure, or a ledger row.
- **No second door.** The daily run, Teams and the web all end on the
  same card and the same single approval route.
- **The Owner configures; the person operates.** The Owner sets the
  roles, the permissions and the agent switches. The person works only
  inside them.

## The capability goal (the tester, 2026-11-26)

The tester: "Make it that dangerous." That means as capable as the
leading general-purpose assistants. The power is in what Ask Etyme can
do; the safety is in what it is allowed to do. The four targets are
confirmed:

`Power = Coverage × Autonomy × Accuracy × Speed`

| Measure | Formula | Target |
|---|---|---|
| Coverage | skills reachable by ask ÷ all role skills | 100% |
| Autonomy | acts done without a person ÷ acts allowed alone | 100% |
| Accuracy | checker pass rate | 95% or more |
| Speed | answers in 2 s or less ÷ all answers | 90% or more |

**It never acts alone on these:**
- releasing money;
- signing;
- a decision about a person;
- publishing compliance copy;
- reading another company's data;
- sending outside an approved task.

It does everything else within the role's permissions on its own, then
shows one card.

**Build order:**
1. The skill layer.
2. The model gateway.
3. The Ask box turns a request into a plan of skills, possibly several
   steps, then acts.
4. Triggers fire as work arrives, not only once a day.
5. Each seat keeps a memory of its open tasks and recent asks.

## The prototypes are approved (the tester, 2026-11-26)

The three one-card prototypes in `prototypes/ask-etyme-one-card/` (commit eb58f532b) are approved as drawn. Build them.

In the build:
- Every figure on the screen comes from the record, never from the drawing.
- The real fonts are used.
- The "Why" drawer is closed until the person taps it.
- Until the skill layer grades a skill, its confidence counts as 1.

## The lead's rulings for the one-card build (2026-11-26)

- **Yes and Not now** go through the verdict route each row already has: the twin approval route or the decision-item route. A row with no verdict route offers one button that opens its record. No new route is added.
- **Urgency** falls back to the days a row has been open, because decision items have no due date. Adding a due date would be a schema change and is not made now.
- **On time 