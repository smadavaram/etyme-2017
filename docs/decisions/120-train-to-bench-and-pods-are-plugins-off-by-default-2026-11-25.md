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
