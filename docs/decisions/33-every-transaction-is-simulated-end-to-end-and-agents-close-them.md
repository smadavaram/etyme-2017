## Every transaction is simulated end to end, and agents close them without asking — decided by the founder, 2026-10-20

*"Post and simulate transactions in every step from job posting to
approval to submissions to matching to interviewing and hiring to
contract on buy and sell sides for all parties, timesheets submission,
approval, expenses submission and approval and billing and payroll or
vendor payments — load test with hundreds of simulated transactions.
Don't ask for my approvals — let agents talk to each other, harness,
learn like humans do and close transactions like in the real world."*

What this changes, and the shape it takes:

- **A simulation harness drives the real routes, as each party's seat.**
  Never rows written into tables: a hiring manager posts a job through
  `POST /api/requisitions`, HR and Procurement clear it through the
  approval routes, suppliers submit through `POST /api/submissions`
  with the person's consent on a bench listing, the worker files the
  week through the worker's own route, the client signs it, each rung
  accepts, bills are generated and sent, invoice receipts recorded,
  the three-way check run, the AP clerk pays, payroll runs. Every
  actor is a seeded seat opened through the demo door, so the same
  rules, refusals and logs apply as to a person. The harness lives in
  `scripts/simulate/` and runs against a local build on a fresh copy of
  the seeded world template (`__integration__/templates.ts`).
- **Hundreds of placements, in parallel, with timings.** Across the
  three seeded clients and every seeded supplier and sub-vendor, a
  year of weeks each. The run reports what closed at every station,
  what refused and why, and how long each route took under load. That
  is the load test; a route that falls over under two hundred
  concurrent weeks is a fault with an owner.
- **A refusal is a lesson, not a stop.** When a rule refuses an actor
  (a missing I-9, a supplier not cleared, a week over the line), the
  harness records the sentence and the owning domain decides: the
  actor was wrong and learns (files the I-9 first, asks Procurement to
  clear the firm), or the rule was wrong and is fixed. Either way the
  run goes again. The founder is not asked; every change is reversible
  in a sentence and recorded here.
- **The new test files the testing budget held back are now allowed
  for this:** the simulation itself, and the screen-by-screen walk that
  opens every link and tab of every seat against the simulated world,
  asserts every figure on a screen against its own API, and keeps a
  screenshot per page to diff against the last run.
- **Built in this order**, one domain per set of files: the harness,
  the actors and the report (architect); the job-to-award stage
  (demand); bench, consent and matching (supply); paperwork and the
  start (regulatory); weeks, expenses, bills, receipts, payments and
  payroll (money); the notices between parties as the handoffs
  (conversation). Then one full run, a release pass and the report.
- **What the seed becomes:** the simulation's closing state is a
  world of thousands of real transactions made the way people make
  them, and that is what the demo shows. The hand-written seed stays as
  the day-one world the simulation starts from.

**The harness is built, 2026-10-20 (architect).** `npm run simulate --
--placements 200 --weeks 12` copies today's world template to
`etyme_sim_<stamp>`, builds the app into `.next-sim` when anything
changed (never `.next`, which somebody's `next dev` may be writing),
starts it on a free port, runs the stations, stops it by its pid, and
writes `reports/simulation-<stamp>.md` with the JSON ledger beside it.
What a station author needs to know:
- **A station is one file in its owner's folder**,
  `scripts/simulate/stages/<domain>/<station>.ts`, and `stage.ts` says
  what it is handed: the seats (`ctx.cast`), the facts earlier stations
  made (`ctx.world`), the run's flags, `ctx.parallel` and
  `ctx.expectRefusal`. `stages/demand/post-jobs.ts` is the worked
  example. Every other station is a stub that says whose it is.
- **Every seat opens through the demo door.** A worker or a firm's
  role the demo page has no door for gets the same signed session the
  door would set, keyed `worker/` or `staff/`, never a row.
- **Reading is allowed, writing is impossible.** `ctx.read` connects as
  a database role that can only select, in read-only transactions.
- **There is no clock override.** "Today" is the real day; a station
  works in real weeks, and the nightly jobs run when a station calls
  `ctx.cast.cron('<name>')`.
- **Nothing leaves the machine.** The server is started without the
  email, model and Teams keys.

**The first full run, 2026-10-20, after one fix wave.** A hundred
jobs and twelve weeks, from an isolated copy of 10220d0a7, every one of
the twenty stations: 87 of 100 jobs published themselves within plan
and 13 were approved by the people they were routed to; 269 people put
forward, 534 matches, 180 interview rounds booked with all three sides,
80 awarded (the one refusal a time limit, correctly); 83 of 83 started,
56 of them refused first and learning (an I-9 filed, a certificate
sent); 168 weeks filed by the workers, 163 signed by the client (23 by
email evidence, 5 left waiting on purpose), 161 accepted by every rung
below; 9 expenses accepted up the chain; 66 bills landed as invoice
receipts and passed the three-way check, 2 keyed-in ones held over the
hours and one waived with a reason; 71 paid; 39 pay periods worked out
before they were paid. No server error on any route; every route's
95th percentile under a second except the nightly twin run at 8.8
seconds (architect). The handoffs station read 260 seats: 659 of 757
handoffs told by a notice, the mark matching the greeting on every
seat, no notice sent twice word for word; what was still wrong was the
approve-by-email path saying "Timesheet approved" without the week and
the twin's question title saying nothing about what, both fixed in the
wave after. What the fix wave itself changed, so it is not re-derived:
a person on a placement, a submission or a bench listing with no seat
anywhere gets their own company-less seat on first sign-in; the seeded
plans let most jobs publish themselves; payroll cannot be processed
before it is worked out; a worker files their own expense; every
notice names who and what; the queue holds the invoice receipts a
person owes a payment on; the award reads its facts at once.

**The world is built to the founder's scale next. Set by the founder,
2026-10-20:** *"10 clients, 10 system integrators, 5 MSPs, 100 prime
vendors and sub vendors and bench vendors and at least 2000 candidates
— freshers to very experienced, moving from bench to self-employed,
some looking for a job while employed, some experienced in different
industries and domains."* The hand-written world is 7 clients, 2
integrators, 2 MSPs, 16 suppliers, one one-person firm and 145 people,
so the simulation so far is a correctness run with timings, not a load
test at the scale the founder means. Decided, on his "don't ask for my
approvals": a generated world at that scale, in its own folder
(`lib/seed-scale`), built one domain at a time — the firm frame, seats,
agreements and who trades with whom (architect); two thousand people
with careers and papers in every state (supply, regulatory); jobs and
rate cards across industries (demand, money) — and the simulation run
on it, locally for correctness and then against a preview deployment
with its own database for the real numbers, because timings from a
four-core container say nothing about the hosted platform. Nothing in
the core may assume IT: the world carries healthcare, manufacturing
and finance beside it, per "horizontal, never vertical".

**Nine decisions for the generated world, made by the coordinator on
the scout's brief, 2026-10-20, each reversible in a sentence:** it is
a separate sealed template (`etyme_tpl_scale_<day>`), built in the same
call and keyed to the same day as the base template, because 199
integration files copy the base and assert its shape; a client's panel
holds six to twelve suppliers and an MSP runs five of the ten clients;
ended careers carry no cycles; the generated live placements get the
order header through money's existing function and no ledger; every
generated person's address ends `.scale.invalid` and the four base
reads that sweep reserved suffixes exclude it, with generated ids
sorting after the base world's; `demo-volume` and `seed-world` export
their random and anchor helpers; `createCompany` takes an optional
`createdAt`; the folder gets its matrix row and its domain entries in
the first commit (`lib/seed-scale` platform, `/people` supply,
`/papers` regulatory, `/jobs` demand, `/rates` money); and the
generator may have one test file, because it is the simulation's own
world and the 2026-10-20 decision admits the simulation's tests: every
generated firm holds the roles the simulation looks for, a second
seeding writes nothing, no two people at one firm share a name, no
skill is under four letters, every job's skills come from its
industry's list, every person opens as a seat. Prime, sub-vendor and
bench are positions, not a kind: `supplierPosture` is written
explicitly, which no seed has done before, so every screen that reads
it meets a value for the first time.

**Ten thousand documents through the real routes. Set by the founder,
2026-10-20:** *"Exchange 10000 documents like insurance, W-9, NCA
during submissions and screening and background checks."* So the
simulation gains a documents station (regulatory): on a supplier's
first submission to a client it sends what a supplier owes (W-9,
certificates of insurance, good standing, the signed NDA and NCA, the
MSA where none stands); at screening the candidate sends what a
candidate owes from their own page (résumé, ID, the I-9 completed from
a named document, education, the consent and identifiers for a
background check, never the report) and HR examines each; the
background-check package goes out and the provider's verdict comes
back verbatim with name, reference and date. Every file is a real
small file through the real upload routes, every ask tells the person,
every refusal is a lesson, and the report counts documents by kind and
bytes stored, with the paper routes' timings under that load. The
station runs unchanged on the generated world.

**Ten thousand documents moved, 2026-10-21 (regulatory, 9ea70513d).**
One run at 520 placements and two weeks moved 10,990 documents through
the real routes as the real seats and stored 2,792 real files (8.8
MB): at a supplier's first submission to a client the compliance
officer asks for the W-9, three certificates of insurance, good
standing, the signed NDA and non-compete, and the MSA where none
stands, the supplier answers each with a file and the client examines
it (82 papers from 12 suppliers); at screening 1,600 papers from 400
candidates; 29 sent back with a reason and answered again; 359 of 372
placements started, 246 refused first and learning, 13 on hold after a
flagged background report with the pre-adverse notice given and the
wait not over. No server error; every paper route's 95th percentile
under half a second. Two moves that did not exist were built:
`POST /api/documents/:id/examine` (accepted with the dates and edition
printed on it, an agreement countersigned, a certificate recorded on
the supplier's standing, or sent back with a reason) and
`POST /api/compliance/adverse-action` (the FCRA steps, the waiting
periods kept as data per place, refused outside the US rather than
guessed). **The founder's screening list was corrected by the rule
table, not dropped:** asking for the ID, the I-9 and the background
check before an offer is unlawful in most of the US (document abuse;
criminal checks before a conditional offer), so those move to the
award and the two questions that stand in for them are asked at
screening. Every expected refusal held: a worker cannot send a
background report, a paper nobody asked for cannot go on file, nobody
examines their own paper, the AP clerk examines nothing, a supplier
cannot open another supplier's paper, the final adverse notice is
refused during the wait. The walk's fixes landed in 81ec7ab50 with a
sentence each; the I-9 edition retirement dates are from research and
are to be checked before anybody relies on them.

**The document flow was walked as every person, 2026-10-21, on the
founder's "Can you test the docflow."** The rules hold: nobody starts
without an I-9; an I-9 is refused unless the document it was completed
from is named; lapsed cover blocks; work authorization cannot be
waived; a supplier cannot change what its client's order asks for; the
AP clerk can neither start anybody nor read people's papers; the
sub-vendor's name stays hidden from the client while the client sees
that firm's insurance standing; a provider's verdict is recorded
verbatim with name, reference and date. Five things broke trust, and
the verdict was "do not ship the document flow as a finished trust
layer" until they are fixed, each with an owner: the no-sign-in link
that asks a worker for her start papers stores the file's name and
not the file (regulatory); a newer "flagged" background report is
ignored when an older "clear" one exists (regulatory); an I-9 on an
old edition starts a person without a word, because the start never
reads the edition list (regulatory); the first nightly check sent 266
emails, 21 to one compliance officer, and told workers to "upload the
renewal" of a background check they never hold (conversation); HR is
told a person is "due to start today" a week early (regulatory). Also
found: a corp-to-corp line never reaches its own default set; a blank
waiver writes an override instead of refusing; the client's page and
the nightly check disagree by a day on a lapse; good standing is
required on running lines and nothing watches it; the supplier's
onboarding link keeps no file (demand); "work may begin" on a start a
week early (money). The note above that four readers "still carry
their own list" is out of date: they merge the line's set over their
own floor since 2026-09-22, and disagree in three named places. This
fix wave goes ahead of other work, per "the two trust flows get the
first seat at every release"; it does not hold the account chooser,
which touches no paper.

**Papers at every stage, walked on screens, 2026-10-22, on the
founder's "simulate request of documents at every stage and give me a
test script."** The script is published for him
(https://claude.ai/artifact/Az8wBZ9ELQmB7d6r7TBK5e): 41 steps across
the seven stages, each walked in a browser on a fresh seeded world.
The lesson, written down because the simulation hid it: **the rules
hold through the routes, and the screens do not reach them.** A paper
that arrives has no button to accept it or send it back; recording an
I-9 with its named document, a provider's verdict and the adverse-action
steps are API only; so a person whose I-9 is missing can never be
started from the screens alone. A simulation that drives routes proves
the rules; only a walk on screens proves a person can do the job. Also
found: a firm can ask a candidate for a passport before any offer from
the Paperwork screen; a person only invited reads as on the bench and
can be asked for papers before her yes; every Extend button asks for a
reason and gives no box; a licensed job is checked only at the start;
supplier onboarding marks the MSA and NDA on file with no signed copy.
Each has an owner; the screen fixes go ahead of new work, because the
document flow is a trust layer and the verdict was "do not ship it as
finished". From now on **every wave that changes a trust flow ends
with a walk on screens, not only a simulation.**
