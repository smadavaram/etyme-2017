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

Facts verified against the code on **2026-09-15**. Anything that changes
should change this file in the same commit.

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
`__tests__/invariants/bench-scope.test.ts`.

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

Recomputed from the module on 2026-09-15:

| | Count |
|---|---|
| Actions named in the automation log | **99** |
| Unprompted — the system did it and nobody asked | **13** |
| Enforcement — the system decided what a person was allowed to do | **3** |
| Attributed — a person did it and the row is the record | **83** |

**The finding is the last row.** Most of what sits in an automation log
is an audit trail of human acts, not automation. Giving those a rung
would inflate every claim.

Of the thirteen unprompted actions, **twelve are plain rules** — a date
comparison, a threshold, a count. `cron/end-contracts` is fully
autonomous and is also `endDate < today`; both are true and the product
says both. The thirteenth is proactive matching, whose basis is read from
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
