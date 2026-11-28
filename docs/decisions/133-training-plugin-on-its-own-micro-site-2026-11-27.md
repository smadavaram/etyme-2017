# 133. The training plugin runs on its own micro-site — 2026-11-27

Relayed by Pax (architect) from the owner's rulings of Nov 27.

## Plugin surface rule (all plugins)

A plugin is built on its own micro-site, never inside the core dashboard.
The core surfaces get only a door, a link in. Every learner has a micro
dashboard inside the plugin: path, next lesson, mentor, progress,
completions. The plugin reads and writes the one record underneath: no
forked data, no second record, no new core panels or workflows.

## Training paths

A path is prompt-generated (a learner's goal, a mentor's instruction, or a
client or job requirement) or system-generated (from the record: role,
skills, bench status, client and compliance requirements, gaps, prior
completions). A named mentor assigns, adjusts, reviews and approves; the
learner is never left alone with a catalog. Lessons are anchored to
video; frames from the video become animations and interactive steps.
Each path records its provenance: generation type, source prompt or
signals, mentor, video source. Completion writes back to the worker's
record.

## Adoption and creation

A course stays owned by the tenant that made it. Another company may adopt
it and assign it to its own teams; adoption creates the assignments and
paths inside the adopter's tenant, and progress and completions live on
the adopter's record. The creator sees aggregate completion counts only,
unless the adoption grants named learner evidence. The mentor may be the
creator's or the adopter's. A company may create its own course from
another supplier's content; the new course is its own, with the source
content and supplier in its provenance.

Etyme has no course-charge money path. Course and plugin pricing is
deactivated for the learning window (through about Feb 2027): courses are
free to take, adopt and assign, and no screen shows or implies a price.

## The first course

"Working in the AI era — Tapin onboarding", on the Tapin micro-site. An
opening question routes the learner to one of four tracks (Kids/student,
Entry Level, Non-IT, IT — Upgrade). Each track has nine chapters in three
levels, one lesson per screen: intro, example, an interactive try-it,
an exercise with instant feedback. IT — Upgrade is a product walkthrough
(chatbot, then answering from documents, then an agent). Stamped
"Version: Dec 2026". Original content and graphics only. Built IT first.

## Division of work

The builders build content, page mechanics, data wiring and graphics. UI
and animation are Pax's seat: built to Pax's UI rules, reported
function-ready, accepted by Pax's visual pass. Nobody else marks the UI
done.

## Gateway

The course is free and public. Onboarding links from the Tapin door and,
subject to the home-page rules (prototype first; the home page speaks to
the client and never leads with AI), from Etyme's main page. At completion
a join path is offered; a signed-in worker's completion is ledgered on her
record.

## Three foundational terms, Simple level first (Pax, 2026-11-28)

Every track teaches three terms in its Simple level, chapters 1 to 3, in
this order and in plain words, at the track's reading level (story words
for Kids/student):
1. Agent: a helper that does not just answer; it does steps for you. It
   looks things up, uses tools, and finishes a small job.
2. Skill: one job the agent knows how to do well, written down as steps,
   like a recipe card. More skills mean more jobs it can do.
3. Agentic: working step by step toward a goal and checking as you go. It
   is how an agent works when it does a whole task, not just one answer.
None of the three words appears anywhere in a course before the Simple
chapter that builds it.

## The door and progress mechanics (Pax, 2026-11-28)

The training plugin works with the tenant's own website (its door) through
the record, the way jobs and applications do:
- a job's requirements generate a system path ("get job-ready");
- an applicant from the door can be routed into a path;
- a pod's skill gaps generate team paths;
- completions and badges show on the door as proof: counts and skills from
  the record only, real numbers, honestly labeled;
- featured courses and the tenant-branded graphics and animation package
  dress the door.
Learning stays on the micro-site; the door is entry and proof.

Progress mechanics only:
- points for lessons, exercises and projects, projects worth most;
- badges per level and per course completion, stored on the worker's
  record and shareable to LinkedIn;
- a weekly streak on the micro dashboard, with no punishment;
- a cohort board the mentor sees; a ranking the learner sees only where
  the tenant switches it on.
Never: coins or any currency, random rewards, a public or global
leaderboard, or anything that can be bought.
