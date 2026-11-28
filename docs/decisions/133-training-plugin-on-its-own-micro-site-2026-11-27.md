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

## Pax, 2026-11-28: two answers

- "Join the bench" counts as applying for now. An applicant starts a "get
  ready" path only after she signs in and says yes herself. No separate
  apply form is built.
- The foundational-terms check also reads exercise feedback, the
  end-of-track recap and the opening question.

## Hold, 2026-11-28 (owner's word, relayed by Pax)

Tapin training is paused. The home page's Learn block and its lead capture
(the question, the track, an email) still go ahead: the door runs ahead of
the course. The course overview page on the training site is held until the
pause lifts.

## The free training door is etyme.com/start (owner's ruling, relayed by Pax, 2026-11-28)

- The free course's door is Etyme's own /start: "AI from Zero in 3 Hours",
  FREE stated plainly, a grid of topic tiles (LLMs, Agents, MCP, RAG + Data,
  Training, Compute, Cloud, Cost, Performance, Deploy with the sub-line
  "Docker · Kubernetes"), the "What are you?" entry and live lead capture.
  Light, warm house style, never a dark look. The Tapin home page is the
  other team's; its Learn section links to /start.
- Every tile maps to real lessons in the course map (33 lessons); no
  invented topics.
- Door labels are Worker, Recruiter, Fresher and Kid; the four tracks keep
  their names. Kid → Kids/student; Fresher → Entry Level; Worker → Non-IT,
  with a visible "I work in IT" switch to IT — Upgrade; Recruiter → Entry
  Level.
- A door carries an entry or a link, never a claim that Tapin sells
  training. The "project or team, never pod" wording rule governs client
  documents, not a home page offer line.

## The /start Learn section's visual standard (owner-approved, relayed by Pax, 2026-11-28)

The owner-approved animation file start-learn-section-animation-2026-11-28.html
is the visual standard for the /start Learn
section. It is drawn in Etyme's own brand kit: cream canvas, serif
headings, Inter, violet, orange and green washes, 12px corners. This
replaces the earlier navy, teal, Sora and Manrope direction for /start.
The pattern: the headline; a progress line that draws across; the ten
topic tiles lighting one by one as the line reaches them; ending on
"Course complete — on your record" and "Join the bench". It plays once
when the section scrolls into view, never loops, is fully off under
reduced motion, and never shifts the layout.

## The Etyme home page gets the Learn section too (Pax, 2026-11-28)

The Etyme home page carries the same Learn section as /start: "AI from Zero
in 3 Hours", FREE stated plainly, the ten topic tiles and the approved
animation pattern. It is the front porch: its call to action leads to
/start, where the "What are you?" entry and the one lead capture live. The
capture form is never duplicated on the home page.

Lead's note on building it: the home page files (src/app/page.tsx and
src/lib/public-site/home-page-words.ts) are being changed on the other
team's branch. The section is built once as a shared component on /start;
the home page places that same component, so the two never drift and the
two branches do not edit the same lines.

## Everything the learner sees is ours (owner's words, relayed by Pax, 2026-11-28)

"The content should look like proprietary." Every surface a visitor or
learner sees is Etyme's own: our voice, our examples only (Milo at Maple
Mart), Etyme or Tapin branding, the "Version: Dec 2026" stamp, and
credential and completion pages issued in the tenant's name. /start, the
home page Learn section and every course surface present as an original
Etyme product. No reference to any outside video, creator or course
appears anywhere: copy, code, metadata, file names or comments. Knowledge
is fair to teach; the expression is ours. A draft that reads as adapted is
rewritten in our voice before it ships.

## The door's address is /learnai (owner's ruling, relayed by Pax, 2026-11-28)

The free training door lives at etyme.com/learnai. The home page Learn
section's call to action points to /learnai. Correction the same night
(owner: "No need for start at all."): /start does not exist in any form, no
door and no redirect. The door is /learnai only and the signed-in setup is
/setup only; every internal link that pointed at /start goes to /learnai or
/setup as fits. Same page, same capture, same animation.
