# Where 2.3 million sourced contacts live

**Decided 2026-09-07. Delegated to the build for stability and reliability.**

## The question

A 2020 export of the legacy Rails `candidates` table holds roughly 2.3
million people — names, personal email addresses, mobile numbers, a free
text skill and a city. Do those rows become `Person` and
`ConsultantProfile` records in the new schema, or do they live somewhere
else?

## The decision

**Somewhere else.** A separate staging model, `SourcedContact`, holding
the imported rows and nothing else. A row leaves it and becomes a real
`Person` + `ConsultantProfile` + `BenchListing` at one moment and one
moment only: when the person answers and grants a listing to a named
vendor.

`Person` stays what it is now — somebody who has actually engaged with
the platform.

## Why, in order of how much damage the alternative does

**Tenure would stop being true.** Tenure aggregates across every vendor
and every assignment for one person at one client, and it is the
product's sharpest claim. The legacy table has no unique index on email
and the export carries 30,266 duplicate addresses in 196,605 rows —
about 15%. At 2.3 million that is roughly 350,000 duplicate people. Put
those in `Person` and the tenure ledger is counting the same worker two
and three times before anybody has done anything wrong.

**Every unpaginated query becomes a live hazard on the same day.** There
are 189 `findMany` calls in `src/` with no `take`. Most are scoped to one
company and stay small. They stay small because `Person` is currently
small. Loading 2.3M rows into the same table converts a latent problem
into an outage, all at once, with no warning and no obvious cause.

**Identity resolution is O(n²) and is not ready.** `bestMatchPerPerson`
compares every pair. Measured at 600,000 pairs per second, 2.3M rows is
2.6 × 10¹² comparisons — 51 days single-threaded, and it would exhaust
memory long before that. Blocking has to come first. Staging keeps the
matcher pointed at people who have engaged, where n is small enough to
be honest, until blocking exists.

**Consent has to be a moment, not an assumption.** CLAUDE.md's hardest
supply-side invariant is that a submission requires a live `BenchListing`
granted by the consultant. A purchased 2020 record has granted nothing.
Keeping the two populations in different tables makes that structural
rather than a flag somebody can forget to check — you cannot submit a
`SourcedContact` because a `SourcedContact` has no listing to grant.

**Blast radius.** A staging table can be truncated and reloaded when the
import is wrong, which the first import will be. `Person` cannot: it is
referenced by submissions, contracts, timesheets, access logs and the
tenure ledger.

## What this makes cheap

Ranking follows from the shape rather than needing to be bolted on.
A live `BenchListing` is already a `(person, company)` pair, so *"vendor
contacts outrank sourced data"* needs no new concept on the vendor side —
the bench listing **is** the ten. Sourced contacts are the one. A person
graduates per vendor, which is also the only reading that survives the
company wall: Ravi joining one vendor's bench must not make him a warm
contact for a vendor he has never heard of.

Source and freshness stay two dimensions. A 2020 record that answered a
check-in last week is still low-provenance and high-freshness, and
collapsing them would either flatter a cold record or punish a
responsive one.

## What this costs

An extra hop. Anything that wants to search across both populations has
to query two tables and union them, and the batch allocator described in
the ten-vendor plan is exactly that. That cost is real, it is paid in one
place, and it is worth it.

## Not yet built

`SourcedContact` is a new model and therefore a schema change, which
queues through `etyme-architect` and needs `DB_PUSH_ON_BUILD` opened
deliberately for the deploy that carries it. Nothing here is in the
schema today.

The piece with no schema dependency is the skill normaliser — the legacy
skill column is free text with 31,064 distinct values for 141,912 people,
and crude token normalisation alone takes usable skill-by-state niches
from 507 to 1,823. That can be built and tested against the export
without a single new column.
