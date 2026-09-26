*The Enterprise Layer for Contingent Talent*

**ADDENDUM E**

Client Workforce Governance

*Amends Master BRD v3.7 (FROZEN BASELINE). Issued under the baseline rule: amendments require a change log, not a rewrite. No section of v3.7 is superseded.*

  --------------------------------------------------------------------------------------------------------------------------------------
  **Field**                    **Value**
  ---------------------------- ---------------------------------------------------------------------------------------------------------
  Addendum                     E

  Amends                       Master BRD v3.7 --- Frozen Baseline

  Status                       RATIFIED --- see E.10

  Trigger                      Client-side review: multi-manager mid-market programme (10+ managers, 14 vendors, decentralised buying)

  Sections extended            §5.3, §8, §10, §17, §20, §27

  Relationship to Addendum D   D covers supply-side retention. E covers demand-side control. E.2 constrains D.3.6.

  Classification               Confidential
  --------------------------------------------------------------------------------------------------------------------------------------

**E.1 THE GAP**

**v3.7 is a supply-side specification. Client governance is not thin --- it is absent.**

A keyword audit of the baseline returns the following. The counts are given because the pattern matters more than any single omission:

  ------------------------------------------------------------------------------------------------------------------------------------------------------
  **Concept**                     **Mentions in v3.7**   **Assessment**
  ------------------------------- ---------------------- -----------------------------------------------------------------------------------------------
  approval / approver             24                     Present, but vendor-side: timesheet and rate approvals inside a vendor\'s own workflow

  procurement                     10                     Referenced as an external actor to integrate with, never modelled as a user

  budget / forecast / headcount   10                     Vendor bench forecasting. No client budget or plan concept

  governance / policy             4                      §18.4 \'Governance Split\' concerns AI site-builder brand controls, not workforce policy

  audit trail / segregation       3                      Incidental

  co-employment / tenure          1                      Line 3488, framed as an MSP liability Etyme avoids --- not as a client exposure Etyme manages

  supplier diversity              1                      Absent in substance
  ------------------------------------------------------------------------------------------------------------------------------------------------------

This is consistent with the declared beachhead (§1.3) and is therefore not a defect in the baseline. It is an unwritten chapter, and it becomes load-bearing the moment a client with more than one hiring manager is engaged.

**The finding that prompted this addendum.**

A mid-market client review showed ten hiring managers buying overlapping skills from fourteen vendors, six of whom had made a single placement each, with rate variance of approximately \$556,000 per year on identical skills. Every one of those managers behaved rationally. The dispersion was not a discipline failure --- it was the absence of a fast compliant path.

**Governance that is slower than the workaround produces the workaround. This addendum is written to that principle throughout.**

**E.2 CO-EMPLOYMENT AND TENURE**

**The single largest client exposure in contingent labour, and the baseline has no concept of it.**

Where a client directs a contractor\'s daily work, sets their hours, and retains them long enough, a court or agency may find a common-law employment relationship notwithstanding the contract. The reference case is Vizcaino v. Microsoft, which produced a settlement reported at approximately \$97 million and reshaped enterprise practice across the sector.

Consequently, most enterprises operate a tenure policy. Typical parameters:

> • Maximum assignment duration, commonly 18 or 24 months at one client
>
> • Mandatory break in service before re-engagement, commonly 30 to 90 days
>
> • Prohibition on employee-style management: no performance reviews, no promotion path, no inclusion in employee programmes
>
> • Visible distinction: separate badge, distinct email domain, separate directory treatment

**E.2.1 The requirement the market currently fails**

**Tenure accrues to the person at the client, not to the assignment or the vendor.**

A contractor who works twelve months through Vendor A and a further twelve months through Vendor B, at the same client, has accrued twenty-four months of tenure. Systems that track tenure per assignment or per supplier record this as two unrelated twelve-month engagements and report compliance. The exposure is real and invisible.

Etyme is unusually well placed here, because it holds the relationship across vendors rather than within one. Aggregating tenure across suppliers is the specific thing a single-vendor system structurally cannot do.

**E.2.2 Specification**

> • TenureLedger, keyed on person and client, accruing across all assignments and all vendors
>
> • Configurable policy per client: maximum days, break-in-service days, warning thresholds
>
> • Alerts at T-90 and T-30 against the tenure limit, routed to the hiring manager and to programme ownership
>
> • Break-in-service enforcement: re-engagement blocked or flagged until the eligibility date, with an eligible-from date shown on every affected profile
>
> • Audit export: tenure position for every current and former contractor, on demand

**E.2.3 Interaction with Addendum D**

**The alumni re-engagement surface specified in D.3.6 is a co-employment risk generator and must be gated.**

Re-engaging a former contractor is precisely the action a break-in-service rule exists to control. The \'ask for them back\' action must therefore check the TenureLedger before it is offered, not after it is taken. Where a person is inside their break period, the surface shows the eligibility date instead of the action.

This is a constraint on Addendum D, not a contradiction of it. Alumni re-engagement remains the strongest demand-side feature in the platform; it simply cannot be offered blind.

**E.3 THE CLIENT IS NOT ONE PERSON**

The baseline models a client contact. A real programme has at least three distinct roles operating on three different time horizons, with no shared data between them. That absence is the root cause of the dispersion described in E.1.

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Role**               **Owns**                                         **Horizon**              **Measured on**                              **In v3.7**
  ---------------------- ------------------------------------------------ ------------------------ -------------------------------------------- ---------------------------------
  Hiring manager         The work and the person doing it                 This week                Delivery, speed to fill                      Partially --- as client contact

  Indirect procurement   Suppliers, rate cards, MSAs, category strategy   Contract cycle, annual   Cost avoidance, supplier count, compliance   No

  Workforce planning     Headcount plan, forecast, run rate               Quarterly, annual        Plan accuracy, budget variance               No

  Finance                Budget, accrual, invoice approval                Monthly close            Accuracy, spend control                      No

  Legal / Compliance     Classification, MSA terms, tenure policy         Continuous               Exposure, audit outcome                      No

  IT Security            Access provisioning and revocation               Same-day                 Revocation SLA                               Partial --- in rolloff fan-out
  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**The structural problem: the manager acts today, procurement negotiates annually, planning forecasts quarterly, and none of the three sees the same data.**

Etyme\'s contribution is not to add approval steps. It is to give the three roles one shared record, so that procurement sees demand as it forms rather than as it appears on an invoice, and planning sees commitments rather than reconstructing them.

**E.4 REQUISITION APPROVAL**

**Design principle: the majority of requisitions must clear without human approval.**

A governance layer that stops everything is routed around, and the routing around is the fourteen-vendor tail. Approval exists to catch the exception, not to process the norm.

  -------------------------------------------------------------------------------------------------------------------------------------------------
  **Condition**                                    **Path**
  ------------------------------------------------ ------------------------------------------------------------------------------------------------
  Within rate band, within plan, approved vendor   Auto-cleared. Manager publishes directly. Logged, not reviewed.

  Outside rate band                                Procurement approval. Reason captured and reported.

  Not in headcount plan                            Planning approval. Becomes a plan amendment, not a silent addition.

  New vendor required                              Procurement, then legal, then security. Tracked as an onboarding pack with a visible position.

  Named person inside break-in-service             Blocked. Eligibility date shown. No approval path --- this is policy, not preference.

  Annual value above threshold                     Finance approval. Threshold configurable per client.
  -------------------------------------------------------------------------------------------------------------------------------------------------

Every cleared requisition records the basis on which it cleared. An auto-cleared requisition is not an unreviewed one --- it is one where the review was executed by rule and recorded.

**E.5 RATE BANDS AND EXCEPTIONS**

> • Rate bands defined by skill, region and seniority, owned by procurement, versioned with effective dates
>
> • Visible to hiring managers at the point of raising a requisition, not discovered at approval
>
> • Exceptions permitted with a captured reason, never silently
>
> • Exception reporting by manager, by vendor, by skill --- the input to the next negotiation
>
> • Renewal prompts where an active rate sits above band, actioned at contract renewal rather than mid-term

The mid-market review found rate dispersion of \$29 per hour on a single skill across three managers. None of them was acting improperly; none of them could see the others. Publishing the band at the point of demand removes most of that dispersion without a single approval step.

**E.6 AUDIT TRAIL AND SEGREGATION OF DUTIES**

Required for regulated clients irrespective of size. A medical device manufacturer carries quality system obligations that a software company of the same headcount does not.

**E.6.1 Immutable audit events**

> • Actor, action, subject, timestamp, and the basis on which the action was permitted
>
> • Written for every approval, exception, policy override, access change and rate change
>
> • Retained per client policy; exportable in full for audit without engineering involvement

**E.6.2 Segregation of duties**

> • Timesheet approver may not approve the resulting invoice
>
> • Vendor onboarder may not approve that vendor\'s first placement
>
> • Rate band owner may not approve their own exception
>
> • Violations are blocked at the point of action and reported, not detected in a later reconciliation

**E.7 SUPPLIER GOVERNANCE**

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Control**                  **Specification**
  ---------------------------- -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  Vendor tiering               Preferred, occasional, one-time. Tier assigned from placement volume and scorecard, with policy consequences attached to each tier.

  Compliance certificates      Insurance, W-9, background check attestation, security review. Expiry tracked with advance alerts. Lapse suspends new placements, not existing ones.

  Performance scorecards       Fill rate, time to submit, median tenure of placements, exception frequency. Feeds tier assignment on a defined cycle.

  Onboarding cost visibility   Full cost of adding a supplier surfaced at the point a one-time vendor is proposed: legal, security, insurance verification, AP setup.

  Supplier diversity           Diverse supplier classification recorded and reported against target where the client operates one. Required for clients holding federal contracts with subcontracting plans.
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**E.8 DATA MODEL EXTENSIONS**

Additive. No baseline entity is altered.

+--------------------------+-------------------------------------------------------+
| **Entity**               | **Definition**                                        |
+==========================+=======================================================+
| TenureLedger (new)       | person_id                                             |
|                          |                                                       |
|                          | client_id                                             |
|                          |                                                       |
|                          | cumulative_days                                       |
|                          |                                                       |
|                          | contributing_assignment_ids                           |
|                          |                                                       |
|                          | break_started_at                                      |
|                          |                                                       |
|                          | eligible_from                                         |
|                          |                                                       |
|                          | policy_id                                             |
+--------------------------+-------------------------------------------------------+
| Policy (new)             | client_id                                             |
|                          |                                                       |
|                          | type: tenure, rate_band, approval_threshold, sod_rule |
|                          |                                                       |
|                          | params                                                |
|                          |                                                       |
|                          | effective_from                                        |
|                          |                                                       |
|                          | version                                               |
+--------------------------+-------------------------------------------------------+
| ApprovalChain (new)      | trigger_condition                                     |
|                          |                                                       |
|                          | ordered steps                                         |
|                          |                                                       |
|                          | role_required per step                                |
|                          |                                                       |
|                          | sla_hours                                             |
|                          |                                                       |
|                          | escalation_target                                     |
+--------------------------+-------------------------------------------------------+
| RateBand (new)           | client_id                                             |
|                          |                                                       |
|                          | skill                                                 |
|                          |                                                       |
|                          | region                                                |
|                          |                                                       |
|                          | level                                                 |
|                          |                                                       |
|                          | min                                                   |
|                          |                                                       |
|                          | max                                                   |
|                          |                                                       |
|                          | effective_from                                        |
|                          |                                                       |
|                          | owner_id                                              |
+--------------------------+-------------------------------------------------------+
| Exception (new)          | type                                                  |
|                          |                                                       |
|                          | subject_id                                            |
|                          |                                                       |
|                          | reason                                                |
|                          |                                                       |
|                          | requested_by                                          |
|                          |                                                       |
|                          | approved_by                                           |
|                          |                                                       |
|                          | approved_at                                           |
|                          |                                                       |
|                          | policy_id                                             |
+--------------------------+-------------------------------------------------------+
| AuditEvent (new)         | actor_id                                              |
|                          |                                                       |
|                          | action                                                |
|                          |                                                       |
|                          | subject_type                                          |
|                          |                                                       |
|                          | subject_id                                            |
|                          |                                                       |
|                          | basis                                                 |
|                          |                                                       |
|                          | at                                                    |
|                          |                                                       |
|                          | immutable                                             |
+--------------------------+-------------------------------------------------------+
| SupplierCompliance (new) | vendor_id                                             |
|                          |                                                       |
|                          | client_id                                             |
|                          |                                                       |
|                          | cert_type                                             |
|                          |                                                       |
|                          | status                                                |
|                          |                                                       |
|                          | issued_at                                             |
|                          |                                                       |
|                          | expires_at                                            |
+--------------------------+-------------------------------------------------------+
| Requirement (§8)         | \+ budget_code                                        |
|                          |                                                       |
|                          | plan_reference                                        |
|                          |                                                       |
|                          | approval_state                                        |
|                          |                                                       |
|                          | rate_band_id                                          |
|                          |                                                       |
|                          | auto_cleared (boolean)                                |
+--------------------------+-------------------------------------------------------+
| Assignment (§10)         | \+ tenure_contribution_days                           |
|                          |                                                       |
|                          | break_required_at                                     |
|                          |                                                       |
|                          | client_tenure_ledger_id                               |
+--------------------------+-------------------------------------------------------+
| Company, client kind     | \+ policy_set_id                                      |
|                          |                                                       |
|                          | diversity_target                                      |
|                          |                                                       |
|                          | audit_retention_months                                |
+--------------------------+-------------------------------------------------------+

**E.9 SECTIONS EXTENDED**

  ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Section**                            **Extension**
  -------------------------------------- ------------------------------------------------------------------------------------------------------------------------
  §5.3 Work Authorization & Compliance   Tenure and co-employment added alongside work authorisation. Distinct concerns, same compliance surface.

  §8 Requirements                        Approval state, budget reference, plan reference, rate band binding.

  §10 Assignment                         Tenure contribution and break-in-service eligibility.

  §17 VMS & Procurement Integration      Procurement modelled as a user with a role, not solely as an external system to integrate with.

  §20 Analytics                          Rate variance by skill and manager, exception frequency, tenure exposure, supplier tier distribution, diversity spend.

  §27 Phase Plan                         Tenure ledger and rate bands enter Phase 2 with the client surface. Approval chains and full audit trail in Phase 3.

  Addendum D §D.3.6                      Alumni re-engagement gated on tenure eligibility, per E.2.3.
  ---------------------------------------------------------------------------------------------------------------------------------------------------------------

**E.10 RATIFIED DECISIONS**

Four decisions were outstanding at drafting. All four are now settled. The reasoning is recorded so that each is revisited on evidence rather than relitigated on instinct.

**E.10.1 Cross-vendor tenure aggregation --- ACCEPTED as a Phase 2 engineering commitment**

Tenure will be aggregated across suppliers, which requires resolving that a person supplied by one vendor and later by another is the same individual.

**Rationale: this is the only control a single-vendor system structurally cannot offer.**

Without it, tenure tracking is equivalent to the incumbents and is a checkbox. With it, Etyme reports an exposure that Fieldglass, Beeline and VNDLY cannot see, because they sit inside one supplier relationship at a time. This is the difference between governance as a feature and governance as the reason a client moves.

Implementation constraints:

> • Deterministic matching on authorised identifiers where consent exists; never on unconsented personal data
>
> • Probabilistic matches surfaced for human confirmation, never silently merged
>
> • Coverage limitation stated plainly to clients: complete only for assignments that ran through the platform. Prior history is client-attested, and marked as such

**E.10.2 Enforcement --- BLOCK where legally grounded, WARN elsewhere, never silently permit**

  -----------------------------------------------------------------------------------------------------------------------------------------------------
  **Control**                                  **Behaviour**                                 **Basis**
  -------------------------------------------- --------------------------------------------- ----------------------------------------------------------
  Tenure limit and break in service            Block                                         Co-employment exposure. Legally grounded

  Work authorisation invalid or expired        Block                                         Statutory

  Supplier insurance or certification lapsed   Block new placements only                     Contractual and insurable. Existing assignments continue

  Segregation of duties violation              Block                                         Control integrity. No legitimate override

  Rate above band                              Warn, capture reason, proceed                 Commercial preference, not law

  Outside headcount plan                       Warn, route to planning, proceed              Budgetary, not legal

  Non-preferred or one-time vendor             Warn, surface full onboarding cost, proceed   Efficiency, not compliance
  -----------------------------------------------------------------------------------------------------------------------------------------------------

**Reasoning on both sides of the line.**

A block that is not legally grounded pushes hiring off the platform, and off-platform hiring is invisible hiring --- which defeats the purpose of the system and reproduces the fourteen-vendor tail. A warning that is ignored, however, creates a durable record that the client was informed and proceeded. Where the underlying matter is legal exposure, that record is worse for the client in litigation than having no system at all. Etyme must not manufacture evidence against its own customers.

**E.10.3 Policy configuration --- ETYME-CONFIGURED at onboarding, client-editable thereafter**

Client policy is drafted with the client during onboarding and handed over once live. Configuration is not presented as a blank form to a client who has never written a tenure policy.

**Rationale: with no installed base, correctness on day one matters more than configuration at scale.**

Most mid-market clients do not have a written contingent workforce policy. Presenting an empty policy engine produces either an unused feature or a wrong one. A drafted starting position, derived from segment norms and adjusted with them, produces a correct policy immediately and a well-informed client.

Revisit when client count exceeds the capacity to run onboarding personally. That is a good problem and a later one.

**E.10.4 Commercial treatment --- TABLE STAKES, not an enterprise upsell**

Governance is included for any client with more than one hiring manager. It is not gated behind an enterprise tier.

**Rationale: incumbents assume governance, so pricing it as premium loses the deal at evaluation rather than at negotiation.**

A client comparing Etyme against a VMS does not experience policy enforcement as an added benefit. They experience its absence as a disqualification. Governance is the reason a client leaves a spreadsheet; it is not an addition sold to one who already has.

The enterprise tier differentiates on integration depth, single sign-on, dedicated environment, data residency and support commitments --- not on whether the platform enforces the client\'s own policy.

*Recorded against Master BRD v3.7 --- Frozen Baseline. On ratification, increment to v3.9 or consolidate at the next major revision.*
