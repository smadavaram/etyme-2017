# Sourced contacts are scaffolding

**Decided 2026-09-07. Amended the same day, and the amendment is the
important part.**

## What they are

A bought list of roughly 2.3 million people, exported from the 2017
Rails `candidates` table. Not a product and not a feature. Scaffolding,
solving two problems that only exist while the network is small:

- **Traffic.** Something to bring people to the platform before the
  platform is the reason to come.
- **A thin bench.** A vendor short of contracts needs somebody to put
  forward this week, and their own bench may hold four people.

Both problems disappear once enough vendors are here, because then the
network is the supply.

## The decision

**It ends.** The target is a thousand vendors and roughly two years, and
then every line of it is deleted — the table, the loader, the module,
the nav item, this document.

That is the design, not an aspiration. A feature nobody plans to remove
becomes load-bearing by accident: something references it, then
something references that, and by the time anybody wants it gone it is
holding up the building and the deletion is a project instead of a
chore.

So three things are true by construction rather than by intention.

**The dependency arrow points one way.** A sourced contact graduates into
a `Person`, a `ConsultantProfile` and a `BenchListing` at the moment
somebody answers and grants one. Nothing in the core points back —
`__tests__/invariants/sourcing-is-removable.test.ts` fails on the commit
that breaks that, checking both imports and schema relations. A foreign
key is the harder dependency: it survives the code being deleted and
turns removal into a migration nobody wants to write.

**Ranking makes it lose on purpose.** A vendor's own contacts outrank
sourced ones ten to one. The pool is always the last resort, so its share
of real work only ever falls.

**Graduation eats the pool.** Every person who joins a bench leaves it.
Success is measured by the thing shrinking, which is unusual enough to
state plainly: a sourcing feature that is growing is failing.

## When to take it down

`src/lib/sourcing-exit.ts` turns "we will remove it later" into a number,
because otherwise it never happens.

Two conditions, and both are required:

| | |
|---|---|
| **A thousand active vendors** | working their own benches |
| **Sourced share at or under 5%** | of live bench listings |

Five per cent rather than zero, because a handful of people who first
arrived from the list will still be on a bench years later and waiting
for a true zero is waiting forever.

Both, not either, and the reason is the case that reads like success and
is not: **a small sourced share on a small network means the list is not
working.** Removing it then would take away the only thing feeding a
network too small to feed itself. That is a reason to fix it, and the
criterion says so in those words rather than reporting a tidy number.

## Why it lives outside `Person`

The original reasoning stands, and the demolition date makes it
stronger — none of this would be reversible if the rows went into the
core tables.

**Tenure would stop being true.** Tenure aggregates across every vendor
for one person at one client, and it is the product's sharpest claim.
The legacy table has no unique index on email: 30,266 duplicate
addresses in 196,605 rows, about 15%, which is roughly 350,000 duplicate
people at full scale. In `Person` that is the tenure ledger counting one
worker two and three times before anybody has done anything wrong.

**189 unpaginated queries become live hazards on the same day.** They
stay small because `Person` is small. Two point three million rows
converts a latent problem into an outage with no warning.

**Identity resolution is not ready for it.** `bestMatchPerPerson` now
blocks on normalised name and phone, which is a large improvement and
still not a plan for millions of rows. Staging keeps the matcher pointed
at people who have actually engaged.

**Consent has to be a moment, not an assumption.** A submission requires
a live `BenchListing` granted by the consultant. A purchased 2020 record
has granted nothing, and separate tables make that structural — you
cannot submit a sourced contact, because a sourced contact has no
listing to grant.

**Blast radius.** A staging table can be truncated and reloaded when the
first import is wrong, which it will be. `Person` cannot.

## What is not built

`SourcedContact` is a new model and therefore a schema change, which
queues through `etyme-architect` and needs `DB_PUSH_ON_BUILD` opened
deliberately for the deploy that carries it. Nothing is in the schema
today.

The removability test and the exit criterion are in, and both are
deliberately ahead of the code they govern. The boundary is cheapest to
draw before there is anything on the other side of it.
