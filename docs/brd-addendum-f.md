*The Enterprise Layer for Contingent Talent*

**ADDENDUM F**

Go-to-Market Sequencing — The Client as First Payer

*Amends Master BRD v3.7 (FROZEN BASELINE). Issued under the baseline rule:
amendments require a change log, not a rewrite. No section of v3.7 is
superseded. §27 is restated in full at F.5 because it is the one rule this
addendum changes rather than extends.*

| Field | Value |
|---|---|
| Addendum | F |
| Amends | Master BRD v3.7 — Frozen Baseline |
| Status | **PROPOSED — pending founder ratification.** See F.9 |
| Trigger | Founder review, 2026-09-09: "It's not only easier to sell to clients first than vendors, but one client pays for 1000 vendors" |
| Sections extended | §1.3, §27 |
| Sections restated | §27 sequencing rule — the only restatement in this addendum |
| Relationship to prior addenda | D and E both declared "no change to the sequencing rule". F is the addendum that changes it. E.10 is unaffected in substance and better served by it. |
| Phase impact | Reorders **selling**, not **building**. See F.3 and F.5 |
| Classification | Confidential |

---

## F.1 THE GAP

**The baseline's sequencing rule answers two different questions with one
sentence, and those two questions no longer have the same answer.**

The rule, as written in §27 and quoted throughout the working documents:

> Phases 1–2 must ship to PAYING vendors before Phase 4 enterprise work
> begins.

It is doing two jobs at once:

| Question | What the rule says | Still correct? |
|---|---|---|
| What is built first? | The vendor-side transaction spine | **Yes.** Load-bearing. See F.3 |
| Who is sold to first? | A vendor | **No longer.** See F.2 |

The two were the same answer when the rule was written, because building was
expensive and you could only afford to build for whoever was going to pay.
The stated rationale confirms this — the rule exists because "the 2017 sprawl
happened because everything was built at once." That is a *build* argument. It
was never a claim about who the best buyer is; it has simply been read as one
ever since, because the sentence contains both.

**The contradiction this has produced.**

The declared positioning names tenure as the sharpest wedge:

> A contractor's time on site aggregated across every supplier is a number no
> vendor can compute and no client can obtain by asking, and it is a legal
> exposure rather than a saving.

That sentence is exactly right and it is a *client-side* claim. A vendor cannot
buy the tenure product. Not "would not pay much for it" — **cannot buy it**, as
a matter of structure. A vendor sees only its own placements. Aggregate tenure
across every supplier at a client is, by definition, invisible from inside any
one supplier. The same is true of cross-vendor identity resolution, rate
variance across a vendor tail, and co-employment exposure.

So the baseline currently says: the sharpest thing we have is a client
capability, and the last party we will sell to is a client.

Addendum E made this sharper without resolving it. All four of E's ratified
decisions — tenure aggregation, BLOCK/WARN enforcement, Etyme-configured
policy, governance as table stakes — presuppose a client in the room. E was
written for a demand side that the sequencing rule placed last.

**This addendum resolves the contradiction by splitting the rule in two.**

---

## F.2 THE CASE FOR THE CLIENT AS FIRST PAYER

Four arguments, in ascending order of force.

**F.2.1 Margin structure.** A staffing vendor operates on low single-digit net
margins. Software sold into that P&L competes directly with the owner's
drawings, and every renewal is re-litigated against a spreadsheet that costs
nothing. A contingent programme office is not spending its own margin; it is
spending against a budget line that already exists and is already large.

**F.2.2 Distribution.** The founder's own formulation: one client pays for a
thousand vendors. A client mandating its supplier base onto a platform is the
only 1:N distribution event available in this market. Vendor-by-vendor
acquisition is 1:1 and the unit economics never improve with scale.

**F.2.3 Buyer motivation.** A vendor buys efficiency. Efficiency pitches lose
to "we are managing fine" — this is already recorded in the positioning. A
client with a co-employment exposure is not managing fine and knows it. The
buying trigger is a liability, not a saving, and liabilities have budget
holders.

**F.2.4 The wedge is structurally client-side.** F.1 above. This is the
argument that actually settles it, and it is stronger than the two the founder
raised. It is not that clients are a better market. It is that the single
capability no incumbent can replicate — cross-supplier aggregation — has no
buyer other than a client.

---

## F.3 THE CONSTRAINT THAT DOES NOT MOVE

**A client's first screen is computed entirely from suppliers' transactions.
The client surface can be sold before it is built. It cannot be demonstrated,
or delivered, before the supply side transacts.**

This is not a preference and it is not a sequencing philosophy. It is an
arithmetic fact about where the numbers come from:

| Client-side figure | Computed from |
|---|---|
| Tenure across suppliers | Assignment and timesheet records filed by each supplier |
| Rate variance by skill and manager | Sell contracts held by each supplier |
| Vendor tail — who placed one person once | Submission and award records across suppliers |
| Alumni memory and re-engagement eligibility | Completed assignments and the tenure ledger |
| Co-employment exposure | The same tenure ledger, aggregated per person per client |
| Approval-chain throughput | Requisitions that actually cleared and produced placements |

Not one is entered by a client. Every one is a derivation over supplier
activity.

**The evidence is recent and internal.** Building a client view that showed
anything at all required first seeding twenty firms, eight placements, sixteen
consultants and four weeks of timesheets. That was not scene-setting — it was
the minimum input for the client screens to compute a non-empty result. In
production the same constraint holds with no seed to fall back on: sign a
client on Monday and their dashboard is blank until their suppliers are filing
real records.

**Consequence.** The build order in §27 is correct and stays. What changes is
only the claim, never actually argued in the baseline, that the build order
dictates the sell order.

---

## F.4 THE RISK THIS CREATES

Three, stated plainly, because an addendum that only argues one side is a
memo and not a specification.

**F.4.1 Compelled users produce no signal.**

A thousand vendors who log in because their client instructed them are not a
thousand adopters. They will tolerate a poor product indefinitely and never
say so, and the telemetry cannot distinguish *working* from *endured*. This is
the precise failure mode in the company's own history: the 2017 build reached
4,197 commits and stalled on adoption, not on engineering. Mandated usage
recreates that blind spot and adds revenue on top of it, which makes it harder
to see.

*Mitigation, specified:* at least one supplier in the first client's programme
must be a firm that was **not** mandated — one that would have signed up
anyway. Their behaviour is the control group. Where every supplier on the
platform arrived under instruction, the vendor-side product has no evidence
behind it at all.

**F.4.2 Neutrality.**

The constraint is absolute and is restated here unchanged: Etyme never runs a
bench and never places anybody, because the moment it competes with its own
suppliers the network stops growing.

Client-mandated deployment does not breach that rule, but it creates a
narrower version of the same danger. A platform a supplier is instructed to
use arrives as the client's compliance instrument. If the vendor side
experiences Etyme as something done *to* them, the bench, rolloff and
releasing-soon modules — the genuinely differentiated supply-side work — never
become a business, and the platform converges on being a VMS.

*Mitigation, specified:* every supplier onboarded under a client mandate
receives the full vendor product, including the modules that serve their own
business and are invisible to the mandating client. What a supplier does with
its own bench is not client-visible data and must not become so as a
convenience of the mandate. Rate visibility remains per-requirement and
vendor-set, per Addendum D.

**F.4.3 Revenue concentration.**

One client leaving is the whole business. Five paying vendors are five
independent validations that the product is worth money, and no single one of
them can end the company. Concentration is the price of the 1:N distribution
in F.2.2 and should be recorded as accepted, not discovered later.

*Mitigation, specified:* the vendor product remains independently sellable and
independently priced. The client engagement must not be permitted to become
the only commercial motion, because that is the point at which the roadmap
belongs to one customer.

---

## F.5 SPECIFICATION — THE SEQUENCING RULE, RESTATED

§27's single rule is replaced by three. This is the only text in the baseline
that this addendum supersedes.

**F.5.1 The build rule — unchanged in substance.**

> The supply-side transaction spine — bench listing, submission, contract,
> timesheet, invoice, payment — ships before any client-only surface. Every
> client-side figure is a derivation over that spine and cannot be built ahead
> of it.

This preserves the anti-sprawl intent of the original rule in full. Nothing
about what gets built first changes.

**F.5.2 The sell rule — new.**

> The first paying customer may be a client. A client engagement may begin at
> any point, including before any vendor pays, provided it is sold on the
> supply spine plus the governance computed from it — and not on client
> surfaces that do not yet exist.

**F.5.3 The demonstration rule — new, and protective.**

> No client surface may be shown to a prospect against an empty dataset, and
> none may be shown against a synthetic one unless it is labelled as a
> demonstration world in the interface itself.

This exists because F.3 makes an empty client dashboard the default state of a
new client, and because the failure it guards against has already happened
once: a demo where "the flow was missing" and the reviewer's verdict was
"didn't get what it is, looked unfinished". A client surface computing zeroes
over an empty supplier set produces exactly that verdict, and does it in front
of the highest-value prospect available.

**F.5.4 What is deliberately not changed.**

- Phase 1 scope as listed in the baseline. Unchanged.
- The prohibition on scaffolding Phase 3 or 4 while Phase 1 is unshipped.
  Unchanged. F.5.2 permits *selling* into Phase 4 territory; it does not permit
  building it early.
- Horizontality. A client-led motion pulls hard toward that client's vertical.
  Nothing in the core may assume IT staffing, and a first client in one sector
  does not license a sector-specific core.

---

## F.6 THE ENGAGEMENT PATTERN

The shape that satisfies F.2 and F.3 simultaneously. A client is both the
buyer and the distribution channel; the product they and their suppliers first
touch is the same supply-side spine that was always going to be built first.

| Stage | Client provides | Etyme delivers | Gate before proceeding |
|---|---|---|---|
| 1. Engagement | Supplier list, one programme, one hiring manager group | Supply spine, live | Signed, with governance scoped to what F.3 permits computing |
| 2. Supplier onboarding | The mandate | Full vendor product to every supplier, per F.4.2 | At least one non-mandated supplier active, per F.4.1 |
| 3. Transaction | Real requisitions through the platform | Submissions, contracts, timesheets, invoices | Enough filed history for tenure and variance to be non-trivial |
| 4. Governance | Policy input at onboarding, per E.10.3 | Tenure ledger, rate bands, approval chains, exception log | Figures reconcile against the client's own records |
| 5. Expansion | Further manager groups | Same surfaces, wider scope | — |

Stage 4 is where the money is and stage 2 is where the risk is. The gate
between them is the whole discipline of this addendum: the governance product
is not shown until the transactions underneath it are real.

---

## F.7 CONSEQUENTIAL MATTERS — NOT DECIDED HERE

**F.7.1 Pricing.** The standing decision is: free while testing, with the price
set after five real vendors are using it. That trigger condition assumes
vendors are the first payers, and F.5.2 removes the assumption. The trigger
therefore needs restating.

**No figure, range, unit or basis is proposed in this addendum.** The pricing
decision is recorded as the founder's alone and nothing here alters that. What
is flagged is only that a condition expressed in vendor counts no longer has a
defined meaning if the first payer is a client.

**F.7.2 Phase placement of the client surface.** The client portal sits in
Phase 4. If a client is the first payer, some part of it necessarily ships
earlier. This addendum does not move it, because moving it without deciding
*which* part moves is how the anti-sprawl rule gets lost. F.9 puts the question
to the founder.

**F.7.3 The beachhead, §1.3.** Stated in terms of vendor firm size. Addendum D
already asked whether it should be restated around work-authorisation
transition. F adds a second reason to reopen it: if the first customer is a
client, a beachhead defined by vendor characteristics does not describe the
first customer at all. Recommend §1.3 be restated once, addressing both.

---

## F.8 SECTIONS EXTENDED

| Section | Change |
|---|---|
| §1.3 Beachhead | Flagged for restatement. Not restated here — see F.7.3 |
| §27 Phase Plan | Sequencing rule **restated** at F.5. Build order unchanged; sell order unbound from it; two new rules added |
| Addendum D §D.2 (rate visibility) | Unchanged and reaffirmed. Per-requirement vendor setting survives a client mandate — F.4.2 |
| Addendum E §E.10 | Unaffected in substance. All four ratified decisions are better served by an earlier client engagement, not worse |
| Pricing decision, 2026-08-29 | Trigger condition flagged as undefined under F.5.2. No replacement proposed — F.7.1 |

---

## F.9 OPEN QUESTIONS — FOR FOUNDER RATIFICATION

This addendum is proposed, not ratified. Five decisions remain:

- **Does F.5 supersede §27's sequencing rule?** This is the ratification. The
  rest of the addendum is contingent on it.

- **Which part of the client surface moves out of Phase 4, and which stays?**
  Recommended split, for acceptance or amendment: the tenure ledger and rate
  variance view move to Phase 2, because they are the wedge and they compute
  from data the spine already produces. Approval chains, the full audit trail
  and multi-manager org views stay in Phase 3 or later. Everything else stays
  in Phase 4.

- **What replaces "five paying vendors" as the pricing trigger?** Founder's
  alone, per the standing decision. Nothing is proposed.

- **Is revenue concentration accepted?** F.4.3 recommends recording it as
  accepted rather than discovering it. If not accepted, F.5.2 needs a cap —
  for example, a client engagement may not proceed past stage 4 while it would
  represent the entirety of revenue.

- **Is §1.3 restated now, covering both D's question and F.7.3, or deferred to
  the next major revision?**

---

*Recorded against Master BRD v3.7 — Frozen Baseline. On ratification, increment
to v4.0 — a major increment rather than v3.10, because this is the first
addendum to supersede baseline text rather than extend it.*
