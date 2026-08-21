# Every loop, and where each one stops

Probed against the codebase, not remembered.

## The finding, in one line

**Twenty-eight modules in this build decide pass or fail. Exactly one of
them loops.** The others check once, say something, and are never counted,
never sampled, never allowed a second attempt, and never noticed when they
start being wrong.

## What a complete loop needs

From the graph: do it → check it → a person fixes it → **the fix is saved
so it cannot happen twice**. Six parts, and a loop missing any of them is
a check with a good reputation it has not earned.

| Part | Why |
|---|---|
| **Verdict** | pass or fail, per named check |
| **Evidence** | what it read to decide. A claim with no evidence can only be believed |
| **Fix text** | what to do, upstream where possible |
| **Attempts** | a cap, so a loop that cannot converge stops costing money |
| **Ledger** | what it cost and how often it needed a second go |
| **Human sample** | a person confirming the machine is still right |

## Where each one stands

Three are on the harness. The rest still check once and answer to nobody.

| Surface | Verdict | Evidence | Fix text | Attempts | Ledger | Sample |
|---|---|---|---|---|---|---|
| **Submission check** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Requirement quality** | ✓ | ✓ | ✓ | ✓ | ✓ | n/a — rules only |
| **Invoice three-way match** | ✓ | ✓ | ✓ | ✓ | ✓ | n/a — rules only |
| Match / triage | ✓ | ✓ | — | — | partial | — |
| Governance evaluation | ✓ | — | ✓ | — | — | — |
| Requisition approval | ✓ | ✓ | ✓ | — | — | — |
| Timesheet authority | ✓ | ✓ | ✓ | — | — | — |
| Lead → opening collapse | ✓ | ✓ | — | — | — | — |
| Representation holds | ✓ | ✓ | ✓ | — | — | — |
| Worker classification | ✓ | ✓ | ✓ | — | — | — |
| Resume upload | ✓ | ✓ | ✓ | — | — | — |
| Requirement quality | **missing entirely** | | | | | |

## The three failures this produces

**1. Confidence nobody earned.** ~~The invoice match blocks a payment on a
receipt check and nothing anywhere counts whether that check has ever been
right.~~ **Fixed.** Every submission now writes a ledger row and keeps all
eleven verdicts with their evidence. Still true of governance, timesheet
authority, worker classification and requisition approval.

**2. A dead end with a signpost.** ~~A lead that is *probably* the same
seat is flagged "might be a duplicate — have a look", and there is nowhere
to look.~~ **Fixed.** The queue takes anything any loop was unsure about,
and reports which surfaces it can sample at all.

**3. Every new check gets reassembled by hand.** ~~The submission loop
took a day.~~ **Fixed, and the drift was already real** — the two copies
of `decide()` disagreed on their summary sentence, which is how the test
suite caught it when one was deleted. Requirement quality took an hour;
the invoice match took twenty minutes and did not touch the arithmetic.

## The fix

One harness. A surface declares what it checks; everything else — running
rules before models, the ledger row, the Check rows, the attempt cap, the
fix list, the human sample, the pattern detector — happens because it is
the harness, not because somebody remembered.
