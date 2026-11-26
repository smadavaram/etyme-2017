# 120 — Train-to-bench and pods are plugins, off by default (2026-11-25)

## The owner's ruling, via the tester

Two extra modules become plugins: not installed by default, activated
per tenant, off by default for every tenant including Tapin and the
second firm. Build order: (1) train-to-bench, (2) pod-to-project
fulfillment. Built after record 119; deployed in the Saturday batch
unless the owner overrides. The full instruction is kept as received
(mechanics, the two modules, and the tester's acceptance steps).

## Plugin mechanics

- A per-tenant switch per plugin, OFF by default for every tenant.
- Switched by the tenant's Owner in Settings in one action, or by a
  Superadmin from the staff tools.
- While off: no menu entry, and every route of the module refuses in
  one sentence, as outreach refuses a client.
- Switching off hides and never deletes; switching on restores.
- Every switch is on the ledger with who and when. No agent ever switches
  a plugin. An agent's acts inside an active plugin are metered as usual.

## The owner's answers on two conflicts named before building

1. **Tables are not created at activation.** The schema is shared by
   every tenant, so a plugin's tables arrive once, in a deploy, for all
   tenants, and stay empty until a tenant switches the plugin on.
   Switching on writes the flag only. (Answer: "Flag only".)
2. **A Superadmin may switch a tenant's plugin** as a staff tool that
   touches only the switch, reads no tenant data, and is logged with who
   and when. This is a narrow exception to "Superadmin uses platform
   tools only, never a company's data". (Answer: "Staff tool, switch
   only".)

## The modules (in brief; the instruction holds the detail)

1. **Train-to-bench**: Course, Enrollment and the Training tab exist.
   Add Cohort, Assessment and Certification, and the conversion: a
   finished trainee becomes or updates her row on the existing bench,
   with proof (cohort, her consent date and method, scores,
   certification), never a second bench and never without her yes. The
   existing Training tab and /api/training come under the switch. A
   train-to-hire fee goes through the existing money loop. The record-56
   rules on training stand: a client never reads "training", a finished
   course reads as a certification.
2. **Pod-to-project fulfillment**: a Pod (named team, roles, members as
   the same person records, rate card or sprint price). A sold pod makes
   a project on ProjectOrder and Engagement. Deliverables: name, due,
   planned, in progress, submitted, accepted or rejected with a reason,
   acceptor and date; all accepted is fulfilled. Milestone billing uses
   OrderMilestone to invoice, no new money path. Margin per project is
   read only by a seat that may read margin. The client reads
   deliverables, states and acceptance only. The outreach "project team"
   offer stays a letter.

## Addendum from the tester, 2026-11-25

1. A Superadmin's switch touches the switch only, never tenant data. It is
   logged with who and when, and the tenant's own Owner sees that row on
   the company's record: who switched which plugin, and when. The Owner
   can also switch their own plugins on and off. No agent switches one.
2. Both modules build on the standing agent architecture, with no new
   pattern. Skills first: fewer agents, more skills. Any agent act inside
   a module follows the generator/verifier split: the generator acts; the
   verifier only reads and gives a reason with every verdict; success is
   read from the record, never from the agent's report. Money, signing,
   people and compliance-publish acts are an automatic FAIL for an agent.
   Each agent act is metered on the ledger.
3. The tester works as BA and architect on this build. Every conflict or
   gap is stopped and named, never improvised past. Each module's
   completion is reported with its commit; the tester retests in
   production after the Saturday deploy.

## The owner's yes to the four proposals, and the tester's conditions, 2026-11-25

The owner said yes to all four proposals. The tester's conditions travel
with that yes.

1. **The fee is the conversion fee only.** It is charged on the sell
   line when she is placed. A course's price is catalogue information
   only. No screen implies that Etyme bills or collects it. A path for
   charging a course is a future build, not a gap.
2. **Finishing a course gives the firm "Ask her onto the bench".** Only
   her yes makes the bench row. A firm's own W-2 employee is told, not
   asked. The ask (its date and method) and her answer are both on the
   ledger.
3. **Courses on a storefront.** They are hidden on every storefront
   while the plugin is off. Tapin's storefront hides them always, as a
   setting for that tenant, not a rule for all. Every other tenant may
   list courses while its plugin is on.
4. **Who certifies, and when the ask comes.** The assessor or the
   cohort's trainer issues a certification, never a recruiter. The ask
   is offered when her own course is complete; it does not wait for the
   whole cohort.

Two rules are confirmed:
- A client never reads "training", a cohort or a score. To a client, a
  finished course reads only "Certified: title, issued, expires".
- Her yes date and method appear only after she gives her yes. Nothing
  is pre-filled and no consent is implied.

**Build notes that are part of the spec:**
- The pods plan passes the same gate before any code is written.
- Prove, never claim: every claim has a named check.
- Validate at write time, on the side the rule protects.
- Dedupe by identity.
- One record: refer to it, never copy it.
- Simplicity is a hard gate.
- Lane C masking applies in these modules.
- The stability bar: every status is visible, a failure can be
  reprocessed, and the journal runs end to end.
- Every acceptance number can be read back from the record.
- Commits stay small, and STATE.md is kept current.
- A conflict is named the moment it is seen.

## Pods: the owner's yes to the five proposals, 2026-11-26

The owner said "yes to all five proposals" from the pods plan gate.

1. **Switching pods off.** The supplier's pages and routes are gone. The
   client still reads and decides the deliverables already sold, so money
   already owed is never stranded. Nothing is deleted.
2. **One named acceptor.** For pod deliverables, only the acceptor named
   on the deal accepts or rejects. The supplier proposes that person, and
   the client's yes confirms them. Other milestones are unchanged.
3. **A time-and-materials pod bills hours and has no deliverables** in
   version 1. "Fulfilled" applies only to fixed-price and milestone
   projects.
4. **A bench member's own bench yes is enough** for her to be sold as
   part of a team; there is no second yes. A firm's own employee is
   told, not asked.
5. **Plugin tables are never seeded**, because every plugin starts off.
   The happy-path test builds its own world.

**The lead's rulings, recorded under record 108:**
- A fixed price is one deliverable or several, whose amounts sum exactly
  to the price.
- The client's yes goes through the one approval route. If that route
  cannot serve a card to another company's seat, the lead stops and
  names it.
- Pod margin is accepted milestone revenue minus pay, burden and
  premium. It is null when any member has no pay record. Only a seat
  that may read margin reads it.
- The client reads deliverables, their states, the acceptor and date,
  the reason for any rejection, and roles and headcount. It never reads
  member names, ids, costs or a firm below. The words are project,
  deliverable and team, never pod.
- The client's milestone list is narrowed to the same set.
