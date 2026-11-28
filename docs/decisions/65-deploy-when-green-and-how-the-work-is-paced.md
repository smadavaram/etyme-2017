## "Deploy when green", and how the work is paced — the founder, 2026-11-13

**The founder's words.** *"Deploy when green"*. It is a standing yes:
when a wave is green it is deployed without asking again. And on the
pace of the work, the same day: *"What's the estimate of work of left -
will increasing agents help? Amd we are timing out quickly - is there a
clean up we can do"*; *"How long will it take to complete? Is memory
better now"*; *"Use as many agents and build in full power"*.

**What green means.** Three things, all of them:
1. the reviewers' blockers are fixed;
2. the full release check is green on a quiet copy: type check, unit,
   integration, build;
3. the walk on screens says ships.
A wave that is not green is not deployed, and the founder is told what
is red.

**How the work is paced.**
- **The work is bound by the usage allowance, not by the number of
  agents.** An allowance lasts five hours. On 2026-11-13 it ran out in
  the middle of four builders' work, and eight to eleven hours were lost
  because nothing woke the session when it came back.
- **So the coordinator schedules its own wake** whenever a deploy is not
  out, and again on every wake. When an allowance runs out, the wake is
  set for two minutes after it returns, and the stopped runs are
  resumed from where they were. A builder stopped mid-work leaves its
  edits in the tree; its diff is the handover.
- **One run per owner.** A run holds two agents at a time on this
  machine, so five owners in one run queue behind each other. Five runs
  of one owner each work side by side.
- **CLAUDE.md was cut from 84,000 words to under 10,000** the same day,
  because every agent reads all of it before it starts. The rules stay
  there; the record is here. A test holds it under 15,000.

**Lessons, so they are not paid for twice.**
- A release check never runs across midnight UTC while a test reads the
  clock for a day.
- A private copy of the site started for a photograph rewrites one
  settings file in the tree. It is restored, never committed.
- A reader's finding is checked against the code before it is fixed. A
  builder's claim is checked by a reader who did not build it: the
  second reader found the home page calling an overage "held" after
  three builders and their tests had passed it.
