## How work is verified

The founder cannot read code. This is the compensating discipline.

1. **Every module ships with tests named as English sentences.**
   Good: `"a consultant cannot be submitted without an active bench listing"`
   Bad: `"test submission validation"`
   He reads the test names to confirm you built what he meant.

2. **Never merge on a red test.** No exceptions, no "will fix next commit".

3. **A Vercel preview URL per feature.** He clicks it. If he cannot click it,
   it is not done.

4. **One module at a time, sequentially.** Do not run parallel agents on
   overlapping files. He cannot adjudicate a merge conflict.

5. **When you are uncertain, stop and ask.** A wrong rate calculation that looks
   plausible is worse than a delay. Especially in: timesheet valuation, invoice
   generation, cycle date arithmetic, tenure math.

7. **Builders test their own files; one release pass tests everything.**
   Decided by the founder, 2026-10-06. A builder runs the unit and
   integration files that cover its module, by name, and never the full
   suite. The full suite runs once per wave, on a quiet tree, and its
   red list is routed to owners. See `docs/how-agents-work.md`.

8. **A screen is tested against the route it calls, and a form is
   tested by pressing Save. Decided by the founder, 2026-11-02**, on the
   I-9 dialog that could never be accepted (*"What's the right way to
   test so we can catch and fix bugs like the I-9 field?"*). Three
   layers, each catching what the one below cannot:
   - **The route's own tests** prove the rule: a refusal for every
     missing field, in a sentence. They cannot see a screen.
   - **A contract test between every screen and its route** proves the
     screen can satisfy the rule: for each field a route refuses
     without, the dialog that calls it offers that field, and a route
     that gains a required field fails the build until its screen gains
     the field in the same commit (`every question a route asks, its
     screen has a field for`). Cheap, in the unit suite, on every push.
   - **A browser test per form that presses Save on the seeded world**
     and proves the record three ways (the sentence, the record on
     reload, the row), for every form on the two trust flows (papers
     and money) before any deploy that touches them, and for every form
     of every party nightly. The simulation, which calls routes, can
     never replace it.
   And a bug found on a screen by a person becomes all three before it
   is called fixed: a browser case that fails first, the contract line
   that would have caught its class, and one line here.

6. **Ready is the edges, and `/ready` is the only measure of it.** Tests
   prove the inside. An edge with the outside world — a real tenant
   signing in, a real file imported, an email that left, a Teams channel
   that heard, a company that is not seed — is proven only when the
   outside world has done it once on that deployment (`lib/readiness`).
   Every edge has three states: missing, set up but never used, proven.
   Nothing is production ready while a required edge is not proven,
   however many tests are green. The matrix's BUILT means built.
