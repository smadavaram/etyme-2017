# How this product is tested

Three levels. Each answers a question the one below it cannot, each is a
single command, and each gets slower and more real as you go up.

You do not need to read code to use this page. Level 1 prints sentences.
Level 2 and 3 print what happened. If a sentence is wrong, the product is
wrong.

---

## The seed files come first

Levels 2 and 3 are only worth running on real data. Invented data agrees
with whatever you built, which is the one thing a test must not do.

Two commands turn a folder of vendor spreadsheets into a database that
can process transactions:

```bash
python3 scripts/sheets-to-json.py ~/sheets > seed.json
node scripts/seed-from-sheets.mjs seed.json
```

From the seven files supplied, that produced:

| | |
|---|---|
| Companies | 60, each on its own corporate domain |
| People at those firms | 119 |
| Consultants on a live bench listing | 148 |
| Work authorisation recorded | 49 |
| Work authorisation deliberately left blank | 99 |

The 148 listings are the point. A live `BenchListing` is what makes
somebody submittable at all, so before this step no transaction was
possible and after it every one of the 148 is.

**Two things it refuses, and says so out loud.**

It carries no grouping by national origin. One supplied file was headed
`DESI CLIENTS` beside another called `American Prime Vendors`. The firms
in it are real and were imported; the grouping was dropped and the drop
is printed, because a record of having removed it is a defence and
removing it quietly is not.

It records no work authorisation the source did not state precisely. A
tab named `H1's` says H-1B, so that is recorded. A file named
`GC_Citizens` names two different statuses and does not say which, so
nothing is recorded — guessing would be a guess about somebody's right to
work.

---

## Level 1 — the rules, on their own

```bash
npx vitest run
```

**3,711 tests, about 23 seconds, no database.** Every rule in isolation,
with nothing else running.

The test names are English sentences and they are the specification:

> *a consultant cannot be submitted without an active bench listing*
> *never lets anybody approve their own hours*
> *warns on a mismatch instead of failing it, and says a reason must be recorded first*

Read them. If a sentence describes behaviour you did not want, that is a
bug found for the price of reading, before anybody built on top of it.

**What it proves.** That each rule, given inputs, produces the right
answer.

**What it cannot prove.** That the rule is ever called. A perfect rule
nobody invokes passes Level 1 every time. That is what Level 2 is for.

---

## Level 2 — one real transaction, end to end

```bash
bash scripts/db-local.sh
npx vitest run --config vitest.integration.config.ts
```

**Real route handlers, real Postgres, in the order a person would hit
them.** Not mocks and not arithmetic — the same code the website runs.

The story is a one-person consulting corporation on a gmail address and
the hiring manager at their client: register, record the client and the
contract, work a week, approve it from both sides, invoice it, get paid,
see the margin.

**What it proves.** That the pieces are wired to each other. Every
failure here is one a real tenant would have hit on day one, found for
the price of a test run instead of a reputation.

**What it cannot prove.** That it still works on day fifty, with fifty
days of rows underneath it and five kinds of company working at once.

---

## Level 3 — the whole network, under load

```bash
STRESS_DAYS=50 STRESS_PER_DAY=200 npx vitest run --config vitest.integration.config.ts
```

**10,000 transactions across 50 simulated days, six companies, about
135 seconds.**

The chain, and every hop is a real relationship with a different view of
the same worker:

| | |
|---|---|
| **Oxford Corp** | the client — buys, never learns who the sub-vendor is |
| **Yoh Services** | the MSP — runs the programme, is invoiced, never touches a CV |
| **Teleworld** | the GSI — delivers with its own people and bought ones |
| **Insight Global** | the sub-vendor — holds the paper on somebody it did not source |
| **Consultis, Techni Power** | the bench vendors — sourced them, furthest from the money |

Four of the nine people share one domain, so the client has four hiring
managers. Addendum E says governance is table stakes for a client with
more than one, and a single-manager fixture can never reach an approval
chain.

Every simulated day it checks three things that must never stop being
true:

- no submission exists without a bench listing from the submitting firm
- no requirement and person pair was submitted twice
- no placement has a pay rate above its bill rate

**A refusal counts as a pass.** A route saying no for a stated reason is
the product working. The failures worth finding are crashes, leaks, and
invariants that stop holding.

**What it proves.** That the thing survives volume, concurrency and time.

**How to read the output.** Latency is reported per action in tenths of
the run. A flat row is a healthy route. A row that climbs is a query with
no limit on it:

```
people.read   26  39  49  59  66  99  106  123  129  134
```

That is the real finding from the last full run — `/api/people` runs the
duplicate matcher, which compares every pair of people, on every single
request. Everything else stayed flat.

---

## Which one to run, when

| | |
|---|---|
| Before every commit | **Level 1.** It is 23 seconds and it gates everything. |
| Before merging a feature | **Level 1 and 2.** |
| Before a release, or after touching money, matching or permissions | **All three.** |
| After loading real data for the first time | **Level 3**, because that is where volume shows. |

Never merge on a red test at any level. There is no "will fix next
commit" — the 2017 build had 4,197 commits and stalled on adoption, not
on engineering, and every one of those commits was somebody sure they
would come back to it.

---

## What none of this covers yet

Said plainly, because a testing page that only lists what passes is
worse than none.

- **Nothing above clicks the website.** Levels 2 and 3 call route
  handlers directly. A page that renders wrong passes all three — which
  is exactly how `/packet/[token]` shipped broken and was found by hand.
- **The three consultant messages are not sent.** There is no email
  provider in a test run, so they are recorded and marked as never sent.
  Correct, and not the same as proving delivery.
- **No level runs at the real number.** The largest bench here is 148
  people against a source table holding about 2.3 million, and the
  duplicate matcher is quadratic. Level 3 finds the shape of that
  problem. It does not find where it falls over.
