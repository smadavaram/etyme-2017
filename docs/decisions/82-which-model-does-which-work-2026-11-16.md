## Which model does which work — 2026-11-16

**What he said.** The founder set the model split for the build work, in
effect from the next batch onward.

- **The lead stays on the strongest model.** The main thread of the session does
  architecture, reading the spec, spotting clashes, reviewing code and
  merging. The lead is never downgraded.
- **Workers run on the standard model by default.** These are the agents the lead
  spawns to implement well-specified work against the written layer
  specs. That includes wording fixes, template rendering, mapping tables
  and distribution plumbing.
- **At most three workers at once.** Each has its own slice of files, and
  no two workers edit the same files. Width is capped to protect
  mergeability, not for lack of allowance. The pull request already
  carries merge conflicts at two.
- **Strongest-model workers only for correctness-critical pieces.** These are:
  - the Layer 7 security work: SSO enforcement, the sign-in leak proof,
    the bank-detail flow and the security ledger;
  - the lane enforcement in model routing (record 81), meaning the
    Lane B and Lane C tests.

  A subtle miss there is a data leak, not a typo.
- **The layer discipline is unchanged.** One layer ships and is retested
  before the next starts. The split changes which model does the work,
  not the order or the gates.
- **Each batch note says which model ran which piece**, so the founder
  can see the split is real.

**How it is held.**
- The lead passes the model to each agent it spawns: the standard model
  by default, the strongest only for the pieces named above. It names the model in each
  batch note.
- Read-only readers and walkers count toward the three.
- The pull request into the old Rails branch shows conflicts because this
  branch replaced that app. Production deploys by replaying the source
  to the deploy branch through its gates (CLAUDE.md, "Release"), not by
  merging that pull request.
