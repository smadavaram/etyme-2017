# 123 — The tester decides architecture; agents draft and propose — 2026-11-25

## The ruling, relayed by the tester (BA and architect)

The owner, on the evening of Nov 25: "Make decisions for Etyme as
business architect and IT architect and let it progress."

From now on, the tester decides every business-architecture and
IT-architecture question in the session. The lead brings those
questions to the tester, records each ruling here with its reasoning,
and keeps building. Only four things go back to the owner:

- money;
- signing;
- anything about a person;
- outside sends.

This narrows record 108 for architecture questions.

## Rulings in force

1. **Agents draft only.** An agent never sends a notice, letter or
   message in a firm's name. A person approves and sends, under the
   one-yes-per-task rule (record 112). Reason: a send in a firm's name
   is an outside send, and an outside send is the owner's to keep
   behind a person.
2. **Agents may propose a chase amount computed from the ledger.** Any
   number that goes out in a message needs the task's approval, like
   any other send. Reason: a proposal is a draft, and the number is
   read from the record, never invented.
3. **The plugin batch proceeds in the recorded order:** the switch,
   train-to-bench, pods, website and content, then outreach. It ships
   on the Saturday release cadence, and each module still passes its
   own plan gate.
4. **A missing model key never blocks a release.** Every agent path
   is built so that the missing key is the only gap. An agent feature
   shows a visible "not configured" state, never a silent failure, and
   everything that is not an agent ships regardless. The tester raises
   the key with the owner once, as a credential item.
5. **The production retest waits on the owner's sign-in.** It stays
   flagged as his one action and does not hold the batch.

## The tester's answers, 2026-11-26

**Ruling 1 is read as (a).** The person's one yes on a task is the send
for every letter in that task (record 112). An agent never sends without
that yes, and it never sends beyond the task. Nothing built changes.

**Yes to all three proposals on the website and outreach plugins (records
121 and 122):**

1. **The website flag ships this Saturday, off for every firm.** Tapin's
   storefront goes dark, `/site/tapin` leaves the deploy's smoke test, and
   Tapin's people are told before Saturday that the link in their
   invitation goes dark. The content is kept.
2. **Until the website module is built, the website switch refuses to
   turn on.** It says: "The site goes public after three checks: your
   branding, your domain, and any compliance pass." Turning it off always
   works.
3. **Outreach is gated on its send paths only.** That covers the batch
   send, its follow-ups, and the dormant-contact and submission-chase
   letters. Drafting and preview stay open. A batch already approved
   stays a draft until the Owner switches outreach on.

## The tester's follow-up rulings, 2026-11-26

**Agent sends, reading (a) ruled.** An agent may send only inside a task
that a person has approved with that task's one yes. It sends only the
text that was approved. Outside an approved task, agents only draft. This
is what ruling 1 means, so there is no conflict between them.

**Website flag: the two live doors are grandfathered.** This replaces
answer 1 above.
- Tapin's storefront and the second firm's storefront keep rendering
  after Saturday's deploy. The deploy itself takes nothing dark.
- The flag governs new activations and the content editor.
- Every other tenant starts off.
- An Owner who switches their own site off takes it dark, and the
  content is kept.
- `/site/tapin` stays in the smoke test.

**The checklist for switching a website on is enforced in code.** The
switch refuses to turn on until all three checks hold:
- the Owner has approved the branding;
- the domain is pointed;
- a compliance pass is recorded where one is required.

A refusal names the missing check. Nothing is blocked silently.

**The outreach flag starts off for every tenant**, the internal one
included (record 122).
- Inbound doors are not outreach and are unaffected.
- An approved task that is already running when the flag lands either
  completes visibly or pauses visibly. It is never dropped silently.
- Drafting stays available while the flag is off.
