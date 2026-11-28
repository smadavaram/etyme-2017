## A thousand jobs, twenty hires through every rung, every kind of worker — the founder, 2026-11-08

*"Do bottom up down testing for 1000 jobs and 20 hires go through
multiple levels. Include all types of workers: students, international
students, visa workers, employment authorization, permanent residents
and citizens."* Read as: the simulation harness runs a thousand jobs on
the generated world, at least twenty awards walk the whole chain (a bench
vendor's person, put forward through a sub-vendor and a prime to the
client, and the client's job sent down the same rungs), every worker
class the founder named is on the bench in proportion, and each class
meets the paper rule that governs it at the start, positive and negative.
- **Worker classes on the record** (`WorkAuth` in `lib/seed-scale/types`):
  US citizen; permanent resident (green card); H-1B and TN visa workers;
  a worker on an employment authorization document (EAD) that is not a
  student's; an F-1 international student on CPT (still enrolled, the
  employer named on the I-20) and on OPT (an EAD after study, with the
  STEM extension where it applies); a domestic student (a citizen or
  resident still studying, no permit needed); and the negative case, an
  international student with no CPT or OPT, who can be interviewed and
  never started for US work. Each is a distribution in the generated
  world, never a hand-written case.
- **The rule for each class is confirmed with its source before it is
  enforced** (regulatory), and until confirmed it warns and never blocks,
  except where the law already blocks today (no I-9, no right to work).
  What regulatory expects to confirm: an F-1 student with no CPT or OPT
  may not start US work; CPT must name the employer and the school's
  authorization; an OPT EAD has an end date and a 90-day unemployment
  limit (150 with STEM); an H-1B is tied to the petitioning employer, and
  a change of employer rests on a new petition (portability lets work
  begin once the petition is filed); an EAD is good only to its end date;
  a permanent resident and a citizen show only an I-9 list document.
  Nothing about status refuses a person at screening without a recorded
  lawful basis (the 2026-11-03 rule stands).
- **Bottom up and top down are both walked.** Bottom up: the person's
  consent on the bench, the bench vendor's put-forward to its sub-vendor
  or prime, the prime's submission to the client, the client's award, the
  start through every rung's papers, the week filed once and accepted
  down, the bill up and the invoice receipt at each rung. Top down: the
  client's job, sent to the prime, the prime sending it down, the
  sub-vendor to its bench. Twenty hires at least are proven on four
  rungs; the report says how many rungs each award walked.
- **Never on production.** The run is the simulation on a copy of the
  generated world on the session's box, after release pass 39 and its
  fixes, because the pass runs alone; the report lands under `reports/`
  and its verdict is recorded under this line, with the refusals per class
  as the test the founder reads.
- **Built in this order, on disjoint files:** the worker classes in the
  generated world's people (supply: `lib/seed-scale/people`, the
  `WorkAuth` type); the papers each class holds and the start rule per
  class with its source (regulatory: `lib/seed-scale/papers`,
  `stages/regulatory`, the start gate); the chain routing so twenty awards
  walk four rungs and the report counts rungs (demand: `stages/demand`);
  the run's flags and the report's table by worker class and by rungs
  (architect: `scripts/simulate/args.ts`, `report.ts`). Then the run.
