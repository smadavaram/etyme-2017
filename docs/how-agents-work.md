# How several agents build this without standing on each other

The founder cannot read code and cannot adjudicate a merge conflict.
That single fact decides the whole shape of this.

Parallelism here is bought with a **boundary**, not with coordination.
Five specialists work at the same time because their files do not
overlap, not because they talk to each other often.

---

## The eight

| Agent | Owns | Use it for |
|---|---|---|
| `etyme-money` | Cycles, project order, journal, invoices, payroll, pay models, bench reserves, currency, profitability, AP/AR | Any change to how a figure is calculated, when it is billed, what somebody is paid |
| `etyme-regulatory` | Documents, work authorisation, background checks, classification, tenure, governance, attestations, access | Anything with a legal consequence |
| `etyme-conversation` | Notifications, email, SMS, Teams, invitations, interview scheduling, wording | How something is said, to whom, on which channel, how often |
| `etyme-demand` | Requisitions, approvals, supplier release, submissions, screening, award, the seat | Between a manager needing somebody and a person being chosen |
| `etyme-supply` | Bench, matching, fit, burn, releasing-soon, rolloff, scorecards, resumes | The bench as a business |
| `etyme-architect` | Schema, database client, auth, company identity, design system, shell | A schema change, a shared component, a decision crossing two domains |
| `etyme-scout` | Nothing — read only | "Does this already exist and who owns it" |
| `etyme-release` | Nothing — read only | Deciding whether it ships |

---

## The boundary is a test, not a page

`src/lib/domains.ts` maps every file to exactly one owner.
`__tests__/invariants/domain-ownership.test.ts` fails when a new file has
no owner, or two domains claim the same path.

A page describing who owns what is wrong within a month. A test is wrong
for exactly one commit.

`mayWrite(agent, path)` answers before an edit rather than after. An
agent that discovers it was out of bounds by breaking somebody else's
tests has already cost more than the check would have.

---

## The one queue

`prisma/schema.prisma` belongs to nobody.

Every domain wants a column and they all want it in the same file, and it
is the one artefact where two individually correct changes still produce
a wrong result. So schema changes serialise through `etyme-architect`.

A domain agent that needs a column **says what it needs and why, and
stops**. It does not edit the file.

This is the cost of the parallelism. It is worth paying, and it is the
only such queue.

---

## How one piece of work moves

**1. Scout.** `etyme-scout` answers whether it exists already, who owns
the files, what depends on them, and whether the schema is involved.
Cheap, read-only, and it is the step that stops the same thing being
built twice under two names.

**2. Schema, if any.** `etyme-architect` adds the column, runs format,
validate, generate and the full suite, and says who else is affected.
Nothing else starts until this lands, because everything else compiles
against it.

**3. Spec, as test names.** The domain agent writes five to fifteen
English sentences describing what will be true when it is done, *before
writing code*. If the sentence cannot be written, the requirement is not
yet understood. These are the names the founder reads.

**4. Build.** Pure arithmetic in `src/lib/` with no database in it, then
the route, then the screen. Unit tests on every branch carrying money, a
date, or a legal consequence.

**5. Release.** `etyme-release` runs the type check, the whole suite and
the build, then walks the feature as a person — including the five states
most features ship with one of: loading, empty, error, partial, denied.
It computes one number by hand from the underlying rows, because that is
where money bugs are found. Then it says ship or do not ship, in a
paragraph a non-technical person could read.

**6. Preview.** A URL the founder clicks. If he cannot click it, it is
not done.

---

## Running several at once

Safe: **different domains, same time.** Money reworking allocations while
supply rewrites the match filter — no shared file, no conflict.

Not safe: **two agents in one domain**, or anything touching the schema
concurrently. That is what the single queue is for.

Before starting a batch, check the boundaries do not overlap. If two
pieces of work want the same domain, they run one after the other. This
is slower and it is still faster than a merge conflict nobody can
adjudicate.

---

## What gets work rejected

**A number nobody can stand behind.** Where the data does not support a
figure, return null and say why. A plausible wrong number is worse than a
blank, because nobody audits good news.

**Silence about a gap.** Reporting a feature as done when a column exists
and nothing writes to it. Adding a column is not building a feature.

**A red test.** No exceptions and no "will fix next commit".

---

## Where the domains map onto the delivery matrix

Each domain answers for named L2 groups, carried in `DOMAINS[].l2` so the
matrix and the code cannot drift apart:

| L1 stream | L2 groups | Owner |
|---|---|---|
| Source to contract | L2.1.1 Demand intake · L2.1.3 Evaluation | `etyme-demand` |
| Source to contract | L2.1.2 Supply response | `etyme-supply` |
| Contract to onboard | L2.2.1 Commercial papering | `etyme-demand` |
| Contract to onboard | L2.2.2 Party onboarding | `etyme-architect` |
| Contract to onboard | L2.2.3 Compliance clearance | `etyme-regulatory` |
| Work to approve | L2.3.1 Capture · L2.3.2 Approval | `etyme-demand`, `etyme-conversation` |
| Approve to invoice | L2.4.1–3 Billing, AR, credit | `etyme-money` |
| Approve to pay | L2.5.1–3 Worker pay, AP, statutory | `etyme-money` |
| Record to report | L2.6.1–2 Ledger, profitability | `etyme-money` |
| Record to report | L2.6.3 Integration | `etyme-architect` |
| Govern and protect | L2.7.1 Workforce risk · L2.7.3 Data and access | `etyme-regulatory` |
| Govern and protect | L2.7.2 Commercial risk | `etyme-supply` |

L3 is the process with an owner and a service level. L4 is the task an
agent actually picks up. Both are in the delivery matrix, and a change to
either belongs in the same commit as the code that caused it.
