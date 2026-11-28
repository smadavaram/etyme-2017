## Two homes, and who decides build questions — 2026-11-21

Two rulings from the owner, sent through his tester.

**1. There are two homes, and they are kept apart.**
- *The public home page is a marketing page.* Its design source is
  the set of prototypes already in this repository:
  `prototypes/homepage/approved-2026-11-18.html`, `prototypes/storefront/`
  (the supplier's door, the build, the published storefront, share it,
  and their stylesheet), `prototypes/client-console.tsx`,
  `prototypes/Etyme_Demo_AllViews.jsx`, `prototypes/Etyme_Onboarding.jsx`,
  `prototypes/Etyme_UX_Stress_Test.md` and `prototypes/rolloff-console.tsx`.
  The owner's words on that set: easy to understand, better conversion.
  The public site is built from those prototypes: storefront doors,
  then the demo, then onboarding, in plain language, conversion first.
  Record 104's process still applies: the page of 2026-11-18 stays live
  until the replacement passes the tester's retest in production, and
  then it swaps.
- *The signed-in home is the decision queue* (Flow A2, record 107).
  That ruling was always about the signed-in screen, never the public
  page. This corrects the earlier message that joined the two.

**2. Build, release and architecture decisions are the tester's.**
The owner: "I was never an IT release guy or architecture guy —
complete the app your way and your rules."
- Release rhythm, batching, architecture, the form of a specification
  (screen-to-screen flows) and acceptance (the tester's retest in
  production) are decided by the tester's documents: the execution
  pack, the weekend release contract and the flow specifications.
- Where those documents do not answer a build question, the lead makes
  the call that best fits them and writes it in STATE.md as a
  delegated decision. It is not parked as a question for the owner.
- Still the owner's alone: decisions about money, signing and people
  inside the product's guardrails; anything sent outside; and his
  standing gates: the keys he pastes, the directory-wide mailbox
  access, who at the sister firm receives anything, and the sign-in of
  the one person whose mailbox stays untouched.

**What this changes in the standing rules.**
- "Experts first" (record 94) stands for what still reaches the owner.
  A build question now stops at the lead and the tester's documents.
- The words on a public page are still held by the positioning rules
  (no real company named, no price invented, no superlative). Those are
  the owner's own rulings about what Etyme says, not build questions.
- The public site built from the prototypes has no slot on the weekend
  calendar yet. Delegated decision: it is not in week 1; the lead
  proposes its slot to the tester with week 2's note.

**Delegated decisions made on 2026-11-21, under ruling 2.**
1. The four real decision items, Tapin's placements and customers, and
   the two payroll periods are typed by a person on the screens after
   the deploy. No agent writes production data; no real record enters
   the repository.
2. Proof on a decision item is text plus links to records. An uploaded
   file is added only where a later flow asks for it.
3. Flow B follows Flow A in the same weekend, and ships in the one
   deploy only if it is green; otherwise it is week 2's first item.
4. Tenant colors on signed-in screens are built with Flow B, as two
   stored colors per firm applied to the shell's accent, never to the
   semantic colors (attention, verified, danger).
5. The rest of the handover's Batch 1 (record 104) goes to week 3 with
   the money loop, and what does not fit to week 4.
6. The left column stays on the decision-queue home.
7. The meter is a count of actions and the cap reads "Not set", until
   the owner sets a price.
