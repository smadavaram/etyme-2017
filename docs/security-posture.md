# Etyme — security posture

**For a client security review.** Every claim below names the file that
proves it, so any line can be checked rather than believed. Where
something does not exist, it is in the "Not there" section with the same
specificity as the things that do.

**Read this first.** Etyme has no SOC 2 report, no ISO 27001 certificate
and no third-party penetration test. It is pre-revenue software with no
paying customers, and this document is written on the assumption that a
reviewer would rather have an accurate gap list than a polished one. A
security document with no gaps is a document nobody checked.

Facts verified against the code on **2026-09-15**. Section 3 was
re-verified on **2026-09-17**, when one of its claims was found to be
false; what was wrong, what was fixed and what is still open is written
there rather than quietly corrected. Anything that changes should change
this file in the same commit.

---

## 1. What the system is

Etyme is the system of record for contingent workers: the layer between a
company and every staffing supplier it uses. Requisition, suppliers,
submissions, screening, interviews, onboarding, timesheets, invoices,
compliance.

It runs no bench and places nobody, which matters to a reviewer for one
concrete reason: Etyme never issues a verdict about whether a person may
work. It records that a check happened — who ran it, when, when it
expires — and the function that would collapse those into a single
cleared-to-place judgment throws by design
(`src/lib/attestation.ts`, `overallVerdict()`). The legal duty stays with
whoever is accountable for it.

**Stack.** Next.js 14 App Router, TypeScript, Prisma, Postgres, NextAuth,
deployed on Vercel. One language, one repository, one deploy target. The
full dependency list is eleven runtime packages (`package.json`).

---

## 2. Identity and access

| Control | State | Where |
|---|---|---|
| Federated sign-in for business users | Built | `src/lib/auth.ts` — Microsoft Entra and Google Workspace |
| Email link sign-in for candidates | Built | `src/lib/auth.ts` |
| A provider with no credentials is not offered at all | Built | `configuredProviders()` in `src/lib/auth.ts` |
| Consumer email domains cannot register a company | Built | `isExcludedDomain()` in `src/lib/auth.ts` |
| Session | JWT cookie, 30 days | `src/lib/auth.ts` |
| Role-based permissions per seat | Built | `src/lib/permissions.ts`, `src/lib/seat.ts`, `src/lib/company-roles.ts` |
| Seat lifecycle — invited, active, suspended, revoked | Built | `src/lib/account-lifecycle.ts` |
| MFA | **Not enforced by Etyme.** Inherited from the corporate tenant where one is connected. The email link path has no second factor. | — |
| SSO enforcement / SCIM provisioning | **Not built.** | — |

**Roles are in the trade's own words**, per kind of company — Account
Manager, Contract Manager, Accounts Receivable, AP & Payroll, Compliance
Officer — rather than generic tiers, and a role added later reaches a
company formed earlier without a migration
(`src/lib/company-roles.ts`).

---

## 3. Multi-tenancy: the walls

**Filtered at the query, not the screen.** A record belonging to another
company does not arrive and then get hidden; it is excluded by the
database query.

**That claim was false for one route until 2026-09-17.** It is written
here rather than fixed silently, because a reviewer checking this
document against the code would have found it and been right to.
`GET /api/placements/:id` hid the supplier's buy leg — the sub-vendor's
name, that firm's insurance certificates, what it charged, the pay days,
and the supplier's own cost and margin — in the React component, behind
a `viewer.isSupplier` flag, while the route returned every one of those
fields to a client seat. The screen looked correct and the payload was a
supplier's cost book, one browser network tab away from any hiring
manager.

Fixed the way the paragraph above describes: the route resolves which
side of the placement the caller sits on from three ids before it reads
the record, and the buy-side queries are not run at all off the sell side
(`src/app/api/placements/[id]/route.ts`, using `contractSide` in
`src/lib/resolve-client-company.ts`). A client's answer now has no buy
contract, no sub-vendor, no cost and no margin in it, rather than having
them and not drawing them.

Two things a reviewer should take from it. **A permission check is not a
place.** Every field-level permission in that route passed for the client,
because a client's own owner holds `*` inside their own company; position
and permission are different questions and the product now asks both.
And **the test asserts the JSON, not the component**, since the component
is what hid the bug — `__integration__/placement-payload.test.ts`, which
reddens on nine sentences against the old route.

- **Outward.** What a firm's own people may see of the market. Wide open
  for a staffing vendor, named people only for a delivery firm where an
  engineer browsing the contractor market is at best a distraction.
  `src/lib/walls.ts`
- **Sideways.** What one account inside a firm may see of another. A
  delivery manager on one client's account cannot see who is staffed at
  another, at what rate, or rolling off when. Expressed by where somebody
  sits — an org unit and everything under it — rather than by another
  permission flag. `src/lib/walls.ts`, `src/lib/account-walls.ts`
- **Seat scoping.** Every read path resolves the caller's company and
  role first. `src/lib/seat.ts`, `src/lib/api-context.ts`
- **Conversations.** A thread belongs to the two companies on the deal. A
  firm not on it is told there is nothing there.
  `src/lib/threads.ts`, `Conversation.withCompanyId`
- **Rate bands** live on the invitation sent to one supplier, never on
  the requirement where a second supplier could read them.
  `RequirementInvitation` in `prisma/schema.prisma`
- **A client's interview notes never leave the client.**
  `src/lib/interview-proposal.ts`

Tested by `__tests__/invariants/walls.test.ts`,
`__tests__/invariants/seat.test.ts`,
`__tests__/invariants/company-walls.test.ts`,
`__tests__/invariants/client-scoping.test.ts`,
`__tests__/invariants/bench-scope.test.ts`,
`__integration__/placement-payload.test.ts`.

### The chain, and whose name is on the row

The fix above was followed by a sweep for the same shape elsewhere, since
one route hiding a field is rarely the only one. What the sweep found is
here in full, and what was undecided when it was written was decided on
2026-09-17.

In a supply chain — a client buys from a prime, the prime buys from a
sub-vendor — **every rung's contract names the client as the site where
the work is done.** So a query written as "everybody at this client"
returns the sub-vendor's leg too, and the sub-vendor is a firm the client
has no contract with and has usually never been told about.

**Rates are closed.** Every client-facing surface that carries money
walks up to the rung the client itself pays, per person or per row
(`chainTop` and `payerRung` in `src/lib/chain-top.ts`); a week that no
single rung covers is shown blank with a sentence rather than priced at a
guess, because a guess there is either the prime's margin on its own
customer's screen or an understated bill. Held by
`__tests__/invariants/chain-top.test.ts` and
`__integration__/full-spine.test.ts`.

**Names are closed too, and the rule is one sentence.** The NDA between a
prime and its sub is what stops the sub going round the prime to reach
the end client. So the client sees the rung it pays and nothing below it
— **unless the client's agreement with the prime requires disclosure**, in
which case it sees the sub by name. That is a term on the
`MasterAgreement` between client and prime, `disclosesSubVendors`, **off
by default**, the client's to demand at signing and never the platform's
to grant. It is amended through `PATCH /api/program/agreements/:id` and
lands on `MasterAgreementVersion` like every other term, so "were we
entitled to that name in March" is answerable from the trail rather than
from today's row.

**What the client always sees, name or no name, is standing** — whether
the firm employing somebody on its site is insured, whether its cover has
lapsed, whether the person is authorized to work. That exposure is the
client's own and no NDA moves it. Nothing in the rule touches a
certificate, a verification or a gate.

**A withheld name is a sentence, not a blank.** The row reads "Supplied
through Computer Systems Inc." A dash reads as missing data, and the firm
the client can actually call about that person is the firm it pays.
Where the chain above a rung is not on file, the row says that instead of
guessing at a supplier.

One function decides it for every surface — `src/lib/chain-names.ts`,
which is to names what `src/lib/chain-top.ts` is to rates, and it sits
beside it so the two cannot drift. It reads the client↔prime agreement
and nothing else: not a permission, because no seat at the client can
grant what the client's paper does not, and not the sub's own agreement
with the prime, which is a deal the client is not party to. A term on a
TERMINATED or EXPIRED agreement discloses nobody; a term on a DRAFT does,
because DRAFT is the honest placeholder the award path writes for a
relationship that plainly exists.

| Surface | What a client sees now | Owner |
|---|---|---|
| `GET /api/compliance` | Every firm with somebody on site, and every certificate it holds. A firm below the rung the client pays carries `name: "Supplied through …"`, `nameWithheld: true` and `suppliedThrough`; its cover, its standing and the lapse sentence travel unchanged, the sentence naming the prime rather than the firm | `etyme-regulatory` |
| `GET /api/tenure` | Every day on site, counted once, across every rung. The vendor list and each contract's `vendorName` withhold a firm below the rung the client pays and say which firm it came through | `etyme-regulatory` |
| `GET /api/alumni` | The same vendor list, plus "released by" and "available now", withheld the same way. A firm that holds somebody on its bench and has never placed them here keeps its own name — the client met it on the bench, not behind a prime | `etyme-supply` |
| `GET /api/placements/:id` | A client is a party to every rung at its own site, so it could open the leg its supplier arranged. On that leg the supplier is named through the same rule, and no rate, margin or invoice is computed at all | `etyme-architect` |

All three unmask in full the moment the agreement carries the term, and
close again the moment it comes off. A supplier reading any of the three
about a client it places at reads its own supply chain by name, because
the term being read is the client's agreement rather than theirs.

Three files owned by three other domains were edited for it, each with a
comment saying why and by whom, on the precedent set in `c126c1c4` and
`f901e914`: one rule landing in three routes at once is one change, and
splitting it across three agents is how two individually correct changes
produce a wrong result.

`GET /api/timesheets` puts the employing rung's company **id** — never
its name, never its rate — on a client's copy of a week, so the screen
can work out who may sign it. Ids still travel everywhere a name is
withheld, because a row needs something to hang a certificate on, and a
client cannot turn an id into a firm it has no relationship with
(`etyme-demand`).

Tested by `__tests__/invariants/chain-names.test.ts` — sixteen sentences
on the rule itself, including a firm that is a prime on one row and a sub
on another, a chain three deep, and a rung whose parent is missing — and
by Step 14a of `__integration__/full-spine.test.ts`, which walks Adobe →
Computer Systems → CloudEPA and asserts the JSON of all three routes
under both settings of the term. Asserted on what the route returns,
never on what the screen renders: the screen is what hid the last one of
these.

**Still open after this.** Named rather than implied — including the one
that was open when this was written and is closed now.

- **The term has no control on the agreements screen yet.** The column is
  written and read by the API (`PATCH` and `GET
  /api/program/agreements`), and the screen that would tick it is
  `etyme-demand`'s. What it needs is one line on the terms panel — a
  checkbox reading "Name our sub-vendors to this client", bound to
  `terms.disclosesSubVendors`, with `terms.disclosureSays` under it —
  until which a client that demanded disclosure at signing has it
  recorded through the API rather than by its supplier's contract
  manager.
- **Nothing refuses a prime that lists a sub as a supplier elsewhere.**
  The wall is on the read surfaces; it is not a constraint the database
  enforces. **The scanner is built** —
  `__tests__/invariants/client-facing-names.test.ts`, which runs in the
  pure suite on every commit. It reads source rather than payloads, and
  it fails on any database read that is scoped to *every rung at a
  client* (`endClientFilter`, or an `endClientCompanyId` matched by hand)
  and asks the selling firm for its name, unless those rows are handed to
  `nameForClient` / `namesForClient` or reduced by `chainTop` /
  `payerRung` to the rung the client pays first. A list scoped by
  `payerScope` or a plain `clientCompanyId` is deliberately not flagged:
  it returns the rung the client is the buyer of, and that firm's name is
  the client's own supplier's.

  **What it names today**, none of them fixed here because each file
  belongs to another agent and a file belongs to exactly one: the
  client's "needs you" queue (`api/decisions`) falls back to the
  employer's own name where the rung the client pays is not on file;
  cross-vendor identity resolution (`api/identity`), the client's Network
  register (`api/people`), one person's page (`api/people/[id]`) and the
  org view (`api/program/org`) all carry `vendorName` off every rung; and
  the client dashboard's approval queue (`api/program`) names the firm a
  timesheet or expense was filed against, which below a prime is the
  sub. All six are `etyme-demand`'s, are listed in the test with what
  each gives away, and a seventh appearing anywhere fails the build on
  the commit that adds it.

  **What the scanner cannot see, and is written down rather than
  implied.** A name fetched in a second query — select `companyId` off
  every rung, look the names up separately — carries no client scope on
  the second read and is not caught; fourteen files query a company by id
  for ordinary reasons, so a rule over those would be noise. Where rows
  are reduced by `chainTop` it trusts the reduction, so a route that
  reduces its rows for one panel and keeps the raw ones for another would
  read clean. And it does not cover a record fetched **by id** and gated
  by a party check in code rather than by a filter — a party check is not
  a filter and one instance is not a population.

- **That by-id door was open, and is closed.** Found by hand while
  building the sweep: a client is a party to every rung at its own site,
  because every rung names that site, so `GET /api/placements/:id` let a
  hiring manager open the contract *its supplier's supplier* holds and
  read that firm by name, what it charged, and the invoices between two
  other firms. The route now resolves `END_CLIENT` — the position of
  being the site but not the buyer of this rung — and on it the supplier
  is named through `chain-names`, the rates are not computed, and the
  invoice lines are not fetched, with `money.says` explaining the blank
  in a sentence rather than leaving a screen of dashes. Walked as
  Step 21a of `__integration__/full-spine.test.ts`, on the JSON.

---

## 4. Access logging

Every read of a person's record on the routes that read one writes an
`AccessLog` row: the person read, who read it, which company they sat at,
what they were doing, whether they were allowed, and where they were not,
why. **Refusals are logged as carefully as reads**, which is the half most
systems drop and the half an investigation needs.

`src/lib/access-log.ts`, `AccessLog` in `prisma/schema.prisma`.

**Coverage, stated honestly.** Nineteen route files call `logAccess` or
`logBulkAccess`, out of 231 API route files. They are the routes that
read a named person: a profile, a consultant record, a resume file, a
placement, submissions, a shared document packet, a bench list, an alumni
list, match results, a compliance record, a classification position, a
program roster, an org view and the tenure ledger. It is not every
endpoint in the product and this document does not claim it is. The
remaining routes are overwhelmingly company-scoped records — invoices,
cycles, orders — rather than reads of another person.

Logging is fire-and-forget by design so a log failure cannot block a
response. The trade-off is explicit: a database failure could lose a log
row without failing the request.

---

## 5. Segregation of duties, enforced

Not advisory. The refusal blocks and names whose rule blocked it, in a
sentence rather than a code.

- An approver who is the beneficiary is refused.
  `src/lib/governance.ts`
- Somebody who recommended a supplier cannot sit on a desk deciding it —
  "You recommended this firm, so the desks decide it without you."
  `src/lib/governance-authorship.ts`, `src/lib/supplier-onboarding.ts`
- Nobody signs their own requisition; nobody decides two desks on the same
  supplier. `src/lib/requisition-approval.ts`
- Nobody approves their own hours; a supplier cannot award its own
  submission; an AP clerk who is a party cannot activate a start.
  `__integration__/client-programme.test.ts`
- **BLOCK where legally grounded** — tenure limit, break in service, work
  authorization, lapsed insurance, segregation of duties. **WARN, capture
  a reason, proceed** everywhere else. Never silently permit.
  `src/lib/contract-clearance.ts`, `src/lib/governance.ts`
- **A desk nobody has named falls back; it never refuses.** Where a chain
  needs a department lead and no rule names one, the program office
  stands in and the screen says so — because refusing would mean a client
  cannot onboard a supplier until governance is configured, which
  produces the workaround.

---

## 6. Evidence rather than assertion

Four places where the system keeps what it was told rather than what it
concluded. A reviewer should care about all four, because each is a
place where a convenient boolean would have been easier.

1. **Attestations, not verdicts.** A record says "verified by Acme on 12
   March, expires 4 August" — a fact about an event. There is no
   cleared-to-place badge, and the function that would return one throws.
   `src/lib/attestation.ts`
2. **Worker classification keeps the evidence for the position taken**,
   re-derivable rather than trusted, and a position the test contradicts
   requires a written reason — because counsel may legitimately differ,
   and silence may not.
   `src/lib/worker-classification.ts`,
   `__tests__/invariants/classification-call.test.ts`
3. **Exempt status is recorded and never decided.** Whether an employee
   is exempt from overtime turns on what they actually do day to day,
   which only their employer knows, and it is an affirmative defense
   that employer has to prove. So the employer asserts it, naming which
   exemption under 29 CFR §541 it stands on, and Etyme holds the
   assertion with who made it and when. What the platform may do on its
   own is arithmetic in one direction only: it can rule an exemption
   out on a pay rate that cannot reach the regulation's floor, and it
   has no verdict that means exempt. The return type carries two values
   and neither of them is EXEMPT, for the same reason the
   cleared-to-place function throws.

   The consequence on the pay side is the one worth checking: a
   client's choice to bank overtime as time off is a billing treatment
   between a client and its supplier, and it never reduces what a
   nonexempt employee is paid — time off in lieu of overtime pay is
   lawful for public agencies only (29 U.S.C. §207(o)). A payroll week
   whose status nobody has asserted is left off the file and named,
   rather than exported at whichever rate was handy.
   `src/lib/worker-classification.ts`,
   `__tests__/invariants/exempt-status.test.ts`
4. **A match score always carries its factors, basis, confidence and
   unknowns.** A bare number is treated as a defect.
   `src/lib/match-engine.ts`, `src/lib/why.ts`

---

## 7. What the software does without being asked

Named with SAP's autonomy ladder, because that is the vocabulary every
enterprise buyer is currently being taught, and recorded per action in
`src/lib/autonomy.ts`.

Recomputed from the module on 2026-09-16:

| | Count |
|---|---|
| Actions named in the automation log | **103** |
| Unprompted — the system did it and nobody asked | **14** |
| Enforcement — the system decided what a person was allowed to do | **3** |
| Attributed — a person did it and the row is the record | **86** |

**The finding is the last row.** Most of what sits in an automation log
is an audit trail of human acts, not automation. Giving those a rung
would inflate every claim.

Of the fourteen unprompted actions, **thirteen are plain rules** — a date
comparison, a threshold, a count. `cron/end-contracts` is fully
autonomous and is also `endDate < today`; both are true and the product
says both. The fourteenth is proactive matching, whose basis is read from
the row rather than asserted, because the match engine falls back to
arithmetic when no model key is set and a week where the key was
misconfigured must not read as a week the model got free.

Where a row could have been either and does not say, `decidedBy()`
returns `UNRECORDED` — "a model may have done this work and the row does
not say which. We will not guess." A plausible wrong answer there is a
claim about how much of the product is AI, made to the person evaluating
exactly that.

A new automated action with no rung fails the build on the commit that
adds it (`__tests__/invariants/autonomy.test.ts`).

Every unprompted row carries a plain-English reason and an honest
`reversible` flag (`AutomationLog` in `prisma/schema.prisma`).

---

## 8. Where personal data reaches a third-party model

Stated plainly because it is the disclosure most easily buried.

| Path | What is sent | Falls back to |
|---|---|---|
| Match scoring (`src/lib/match-engine.ts`) | Candidate name, skills, headline, location, work authorization class, rate floor, availability date; plus the role | Deterministic rule scoring, with `no ANTHROPIC_API_KEY — scored with rules, not the model` recorded on the row |
| Resume evidence check (`src/app/api/submissions/[id]/check/route.ts`, `src/app/api/requirements/[id]/screen/route.ts`) | The extracted text of the resume and the skills claimed for it | Does not run; the finding says the claims are unchecked |
| Import (`src/lib/extract.ts`) | Up to 60,000 characters of the file or paste being loaded | Returns null; only a spreadsheet with recognizable headings can be loaded |
| Public page drafting (`src/lib/consultant-portfolio.ts`, `src/lib/site-voice.ts`) | The words the page will carry | Not drafted |

Provider: **Anthropic**, via `@anthropic-ai/sdk`. Models are configurable
(`MATCH_MODEL`, `CHECK_MODEL`).

**No model output awards, rejects or bars anybody by itself.** Every path
above is advisory and every score carries its reasoning.

**A deployment can turn all of it off** by not setting
`ANTHROPIC_API_KEY`. The product degrades honestly rather than silently:
it says it scored with rules, or that nobody verified the claims.

---

## 9. Secrets, tokens and machine access

- **API keys are stored as a SHA-256 hash only** and compared in constant
  time. A key cannot be shown again after it is minted — "a system that
  can show you a key again is one that stored it."
  `src/lib/service-accounts.ts`
- **Outbound webhooks are signed** with an HMAC-SHA256 over a timestamp
  and the payload. `src/lib/service-accounts.ts`
- **Public links** — a supplier's application, a document packet, a reply
  — carry a bearer token from a cryptographic random source rather than a
  sequential identifier, because a `cuid` is ordered and guessable from a
  neighbor. They stop working once the thing they are for is decided.
  `src/lib/signed-link.ts`, `SupplierRequest.token`
- **Scheduled jobs** require a shared secret compared in constant time,
  and a deployment with no secret refuses every scheduled call.
  `src/lib/cron-auth.ts`. This is a fixed bug worth naming: eleven cron
  routes previously compared against the literal string
  `"Bearer undefined"` on a deployment with no secret set, so anybody
  sending exactly that could run a job. Found and fixed across all of
  them on 2026-09-13.
- Secrets are environment variables on the deployment. There is no secret
  manager, no key rotation schedule and no envelope encryption.

---

## 10. Financial data handling

- **No full bank account or routing numbers are collected or stored.**
  The supplier application takes a bank name, the name on the account and
  the last four digits, and says so on the page: "Full details go on the
  payment form the client sends once you are approved."
  `src/app/api/supplier-apply/[token]/route.ts`,
  `src/app/apply/[token]/page.tsx`
- The remit-to record carries the same three, marked in the schema as
  display only. `RemitTo` in `prisma/schema.prisma`
- **No card data anywhere.** Etyme is out of PCI scope.
- A client pays only what came through the three-way match — never an
  invoice a supplier has not submitted — and a payment records who paid
  whom. `src/lib/three-way-match.ts`, `src/lib/invoice-match.ts`

---

## 11. File handling

Resume bytes are stored in the database (`Resume.storage = 'DB'`,
`Resume.bytes`). Other documents are recorded by file name against the
item they answer, with a URL supplied by whoever uploaded them, and a
SHA-256 hash so the same file twice is stored once
(`VerificationDoc.fileHash`).

**There is no object storage service in the loop.** `.env.example` still
carries S3 keys from an earlier plan and nothing in `src/` reads them.
The same is true of the DocuSign keys: signature here is an attestation
from the person's own page, recorded with who attested and when.

**Not there:** virus scanning on upload, content-type enforcement beyond
what the browser reports, a signed-URL scheme, or a size cap enforced
server-side across every path.

---

## 12. Monitoring and incident handling

**What exists.**

- Every failure in an API route goes through `reportError`: an `Incident`
  row, and one email per place per hour to `ETYME_STAFF_EMAILS`.
  `src/lib/alerts.ts`
- A page that throws shows a sentence and reports itself.
  `src/app/error.tsx`, `src/app/global-error.tsx`
- The daily job writes a `JobRun` before its first job and after its
  last, and sends a heartbeat either way — so the alert channel is proven
  on a day nothing broke. `src/app/api/cron/daily/route.ts`
- `/ready` measures the edges with the outside world and distinguishes
  three states per edge: missing, configured but never used, proven.
  Nothing counts as production-ready while a required edge is unproven,
  however many tests are green. `src/lib/readiness.ts`

**Not there.** No severity scale, no on-call rotation, no defined
notification clock, no named customer contact, no rehearsed runbook, no
log aggregation or SIEM beyond the platform's own request logs, no
alerting on anomalous access patterns.

**Vulnerability reporting.** `SECURITY.md` at the repository root is a
real policy now — how to report, what happens next, what is in scope,
what is out, and a coordinated-disclosure posture. **The address in it is
a visibly marked placeholder**: `security@etyme.example` does not exist
and nobody reads it. The policy says so at the top of its own file rather
than reading as though it were live. Setting the real address and
pointing it at a watched mailbox is the founder's, and until it is done a
reporter is told to use their commercial contact. No response-time
commitment is made, because nobody has made one.

---

## 13. Software assurance

- **4,724 tests across 243 files** at the commit this document was last
  revised on (2026-09-15), run on every change. Never merged on a red
  test — a stated rule, not an aspiration.
- Tests are named as English sentences, because the founder cannot read
  code and reads test names to confirm the behavior is what he meant.
- **Invariants enforced as tests rather than documented as pages**, on the
  principle that a page describing what is true is wrong within a month
  and a test is wrong for exactly one commit:
  - every file under `src/` has exactly one owning domain
    (`__tests__/invariants/domain-ownership.test.ts`)
  - the delivery matrix cannot claim BUILT without naming files that
    exist and tests that exist (`__tests__/invariants/matrix.test.ts`)
  - a new automated action with no autonomy rung fails the build
    (`__tests__/invariants/autonomy.test.ts`)
  - chart colors are recomputed for contrast rather than pinned
    (`__tests__/invariants/chart-colors.test.ts`)
- Type checking with `tsc --noEmit` on every change.
- **Not there:** no dependency scanning in CI, no SAST, no DAST, no
  signed commits requirement, no branch protection documented here, no
  SBOM.

---

## 14. Not there — the full list

Stated in one place so a reviewer does not have to assemble it.

**Certification and assurance**
- No SOC 2 Type I or Type II.
- No ISO 27001.
- No third-party penetration test, ever.
- No bug bounty and no reward of any kind; `SECURITY.md` says so plainly.
- **No live vulnerability disclosure address.** The policy exists; the
  address in it is a marked placeholder until the founder sets a real
  one.
- No PGP key published for encrypted reports.
- No legally reviewed safe harbor. `SECURITY.md` states an intent not to
  pursue good-faith research in scope, and flags the binding wording as
  counsel's.
- No cyber insurance disclosed here.

**Data lifecycle**
- **No retention schedule.** Nothing is deleted on one. Ending somebody's
  access revokes a seat and erases no record, deliberately, so an audit
  six months later can still find them (`src/lib/account-lifecycle.ts`).
- **No erasure path and no self-service export.** A data subject request
  is handled by hand. No file under `src/` mentions retention, erasure,
  GDPR, CCPA or a data subject request.
- **No return or deletion of customer data on termination.**
- The only scheduled deletion in the product is demo workspaces nobody
  returned to (`src/app/api/cron/reap-demos/route.ts`).
- A resume a candidate removes is soft-deleted: hidden from their list,
  still readable by a company it was already sent to, because Etyme
  cannot unsend it (`Resume.deletedAt`).

**Infrastructure**
- No data residency control. One deployment, one database, no regional
  pinning anywhere in the software.
- Encryption at rest and in transit is whatever the managed Postgres host
  and Vercel provide. **It is not configured or verified in this
  repository** and should be confirmed against the operator's providers
  rather than taken from this document.
- No field-level or application-level encryption of sensitive columns.
- No key management service, no rotation schedule.
- No backup or restore procedure documented, and no restore has been
  tested.
- No disaster recovery plan, no RPO, no RTO.
- No rate limiting, no WAF rule and no bot protection in the application.
- No security headers configured — no CSP, and no HSTS beyond the
  platform default (`next.config.mjs` sets no `headers()`).

**Organization**
- No named security officer. No formal access review of Etyme staff
  access to production. No background checks on Etyme's own staff. No
  security awareness training. No vendor risk assessment of Etyme's own
  sub-processors, and no data processing agreement with any of them
  recorded in this repository.

**Coverage gaps in controls that do exist**
- A sub-vendor's **name** is withheld from the client on all three
  chain-aggregating surfaces unless the client's agreement with the prime
  requires disclosure (section 3). What remains is that the wall lives in
  the read surfaces rather than in a constraint, so a surface written
  tomorrow can leak the same way, and the disclosure term has no control
  on the agreements screen yet. The employing firm's **id** still travels
  on a timesheet row, deliberately.
- Access logging covers 19 route files of 231 (section 4).
- Access logging is fire-and-forget, so a log write failure does not fail
  the request.
- MFA is inherited, not enforced.

---

## 15. Planned

Only things somebody has actually committed to, per the rule that
"planned" must not be decoration.

- **A live vulnerability disclosure address.** The policy is written and
  committed (`SECURITY.md`); what remains is the founder setting a real
  mailbox and replacing the marked placeholder in it. One change, no
  dependency on anything else.
- **The retention and erasure question** is on the counsel list at
  `/dpa` and `/privacy` and blocks the first paying client. No period is
  stated anywhere until one is implemented.

Everything else in section 14 is **absent with no committed date**. That
is the honest answer, and inventing a roadmap here would undo the point
of the rest of the document.

---

## 16. Who to ask

`SECURITY.md` at the repository root is the policy for reporting a
vulnerability — scope, process and coordinated disclosure.

**The address in it is a placeholder and nobody reads it.** Until the
founder sets a real one, both a vulnerability report and a question about
this document go to the commercial contact who sent it to you.
