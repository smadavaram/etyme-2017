# Etyme — build spec

Companion to `schema.prisma`. Read the schema first; it is the part that is expensive to change.

Stack: Next.js 14 App Router, TypeScript, Prisma, Postgres with pgvector, NextAuth, Vercel, Claude API. One language, one repository, one deploy.

---

## 1. Ground rules the code has to hold

These are enforced in the data layer, not in the UI. If a rule only exists in a React component it does not exist.

1. **A Person is never deleted and never merged away.** Credentials and contexts come and go around it.
2. **No submission without a live `BenchListing` granted by the consultant.** Checked in the service, not the route.
3. **`Submission` is unique on `(requirementId, personId)`.** The database enforces first-submitted-wins. Do not resolve this in application code.
4. **`SubmissionKind` is computed from ownership**, never accepted from the client.
5. **Rate bands live on `RequirementInvitation`.** A requirement never carries a pay rate that a recipient could read.
6. **Every read of another person's data writes an `AccessLog` row**, including refusals, with the reason.
7. **Anything the system does unprompted writes an `AutomationLog` row** with `reason` in plain words and an honest `reversible` flag.
8. **Match scores always carry `factors`, `basis`, `confidence` and `unknowns`.** A bare number is a bug.

---

## 2. Permissions

One flat list. Roles are bundles; the template pack ships seven of them.

```
consultants.read consultants.write consultants.cost
requirements.read requirements.write requirements.distribute
submissions.read submissions.create submissions.rate
assignments.read assignments.write assignments.terminate
timesheets.read timesheets.approve
invoices.read invoices.issue payments.record
vendors.read vendors.manage
utilization.read margin.read pnl.read
team.manage settings.manage
```

**The field-level rules that matter most**, because they are the ones a screen will quietly get wrong:

| Field | Requires |
|---|---|
| `Assignment.payRate` | `consultants.cost` or you are the person |
| `Assignment.billRate` | `margin.read`, or you are the client on the MSA |
| Bench burn, any aggregate cost | `consultants.cost` |
| Margin percentages | `margin.read` |
| Consultant name in a talent view | the owning vendor released it |
| Client name on a network requirement | the prime released it |

A recruiter gets everything except `*.cost`, `margin.read`, `pnl.read`. That single exclusion is what stops them back-calculating salaries from a bench total.

---

## 3. API surface

Next.js route handlers. All under `/api`. Everything returns `{ data }` or `{ error: { code, message, field? } }`.

### Auth and identity
```
POST   /api/auth/[...nextauth]          NextAuth: Microsoft, Google, Email, SAML
GET    /api/me                          person, credentials, contexts, active context
POST   /api/me/context                  switch active context
POST   /api/me/credentials              link another way in
DELETE /api/me/credentials/:id          unlink (never the last one)
GET    /api/me/access-log               who looked, and when, including refusals
DELETE /api/me/contexts/:id             revoke a context you were granted
```

### Onboarding
```
POST   /api/companies                   { name, slug, entityType, kind }
                                        → creates Company, 7 Roles, owner Context,
                                          fires site generation, sets siteLiveAt
GET    /api/companies/slug-available    ?slug= — checks reserved list and collisions
POST   /api/companies/:id/template-pack { pack } — contract types, cycles, doc templates, skill seeds
POST   /api/imports                     multipart. Returns Import with proposed mapping
PATCH  /api/imports/:id/mapping         human corrects the AI column mapping
GET    /api/imports/:id/rows            paginated, searchable, filter by issue
PATCH  /api/imports/:id/rows/:rowId     fix one row inline
POST   /api/imports/:id/commit          creates People, ConsultantProfiles, Assignments.
                                        Rows with issues still commit at INTERNAL visibility
GET    /api/companies/:id/directory     Microsoft Graph or Google Directory, if consented
POST   /api/companies/:id/invitations   [{ email, roleId }]
```

### Supply
```
GET    /api/consultants                 q, skills, availability, workAuth, tier, page
POST   /api/consultants                 create one by hand
GET    /api/consultants/:id             field-filtered by the caller's permissions
PATCH  /api/consultants/:id
GET    /api/bench                       scope=mine|company|network
POST   /api/bench/listings              vendor asks; pending until the consultant grants
PATCH  /api/bench/listings/:id/grant    consultant only
PATCH  /api/bench/listings/:id/revoke   consultant only, effective immediately
```

### Demand
```
GET    /api/requirements                scope=mine|network, sort=priority|recent, q, page
POST   /api/requirements                manual create
POST   /api/requirements/parse          { text } → parsed fields with per field confidence
POST   /api/requirements/:id/distribute { toCompanyIds[], payMin, payMax, expiresAt, message }
                                        → queues one RequirementInvitation each
GET    /api/requirements/:id/matches    scores with factors, basis, confidence, unknowns
POST   /api/submissions                 { requirementId, personIds[], rate }
                                        → batch, per item errors, kind computed server side
GET    /api/submissions                 direction=sent|received
```

### Work and money
```
POST   /api/assignments                 → generates the full Cycle chain in one transaction
PATCH  /api/assignments/:id/extend      → extends the Cycle chain
GET    /api/timesheets                  status, period, assignment
POST   /api/timesheets/:id/submit
POST   /api/timesheets/:id/approve      writes the ledger, increments payable
GET    /api/invoices                    aging buckets
POST   /api/invoices/generate           from approved, uninvoiced timesheets
POST   /api/invoices/:id/payments
GET    /api/rolloff                     window=30|60|90
POST   /api/rolloff/:id/claim
```

### The machine
```
GET    /api/automation                  what ran, with reasons
POST   /api/automation/:id/reverse      only where reversible is true
GET    /api/decisions                   what needs a person right now
```

---

## 4. The five workflows worth sequencing carefully

### A. Company onboarding
```
OAuth (Microsoft or Google)
  → domain arrives verified from the tenant; skip the 2017 EXCLUDED_DOMAINS check
  → Person + Credential, or link to an existing Person on the same email
POST /api/companies
  → slug from domain, collision numbered, reserved list checked
  → 7 Roles, owner Context, siteLiveAt = now
  → networkVerifiedAt stays null: the site is public, the network is not
POST /template-pack
  → contract types, Cycle definitions, DocTemplates, skill graph seeds
POST /imports → PATCH mapping → GET rows → POST commit
  → incomplete rows commit at INTERNAL visibility rather than failing
  → any row with an endDate inside 8 weeks immediately creates a RolloffEvent
GET /directory → POST /invitations
```
The ninety second promise is satisfied at `siteLiveAt`. Everything after it is enrichment and skippable.

### B. Requirement in, distributed out
```
Email forwarded to reqs@{slug}.etyme.com, or POST /requirements/parse
  → Claude returns fields with per field confidence; anything under 0.9 is flagged, not corrected silently
POST /requirements → MatchWorker queued
POST /requirements/:id/distribute
  → one RequirementInvitation per recipient, each with its own band
  → queued, not synchronous: fifty vendors must not block the request
  → AutomationLog: which vendors and why (reply rate above the threshold)
```

### C. Submission, both ledgers
```
POST /api/submissions { requirementId, personIds: [...] }
  for each person:
    assert a live BenchListing exists for fromCompany   → else 403
    assert rate >= consultant.rateFloor                 → else 422
    assert rate respects msa.minMarginPct               → else needs approval
    kind = ownsConsultant && ownsRequirement ? INTERNAL
         : ownsConsultant                    ? BENCH
         :                                     NETWORK
    insert; unique violation → 409 with who submitted first and when
  return per item results, never all-or-nothing
```

### D. Rolloff
```
Nightly: assignments with endDate within 28 days and no RolloffEvent
  → create RolloffEvent
  → notify four parties with content scoped to each
  → run matches against open internal demand
  → if H1B and no claim: project the bench cost and surface it on the decision queue
On endDate:
  → state = ENDED, deboard checklist opens, IT revocation carries a same day SLA
  → claimed → new Assignment; unclaimed → BENCH_PAID or listing reactivated
```

### E. Internal supply gate — GSI only
```
POST /api/requirements with company.kind = GSI
  → match against internal bench first
  → if any internal match >= 80: distribution is locked
  → unlocking requires a recorded reason, written to AutomationLog
  → the reason is visible to the practice head
```
This is the one workflow that differs by company kind. Everywhere else the same code serves a vendor and a GSI.

---

## 5. Background jobs

| Job | When | Does |
|---|---|---|
| `matchRequirement` | requirement created or skills changed | vector similarity plus availability, rate, visa readiness, location. Writes factors and unknowns. |
| `matchConsultant` | profile or availability changed | the same, the other way round |
| `generateCycles` | assignment created or extended | the nineteen kinds, business day shifted, one transaction |
| `dueCycles` | hourly | fires timesheets, invoices, pay runs, vendor bills |
| `rolloffScan` | nightly | the D sequence above |
| `parseInbox` | on inbound mail | requirements and VMS notifications into structured records |
| `sendInvitations` | on distribute | fan out, retry, expire |
| `expireInvitations` | nightly | status EXPIRED past `expiresAt` |
| `visaWatch` | nightly | T-90, T-60, T-30 |
| `siteGenerate` | company created | config JSON plus copy, publishes `{slug}.etyme.com` |

Vercel cron for the scheduled ones. A queue (Inngest or QStash) for fan-out, because sending fifty invitations inside a request will time out.

---

## 6. Coverage against the 2017 application

The 2017 codebase carried **134 models and 60 controllers**. This schema has 28 models. The reduction is consolidation, not omission — but some of it is genuine omission, and that is listed honestly below.

### Consolidated
| 2017 | Now |
|---|---|
| `contract`, `buy_contract`, `sell_contract`, `contract_admin`, `contract_term`, `contract_buy_business_detail`, `contract_sell_business_detail` | `MasterAgreement` + `Engagement` + `Assignment` |
| `candidate`, `user`, `admin`, `owner`, `consultant`, `consultant_profile` | `Person` + `Credential` + `Context` + `ConsultantProfile` |
| `company_doc`, `company_candidate_doc`, `company_vendor_doc`, `company_customer_doc`, `company_employee_doc`, `company_legal_doc` | `DocTemplate.audience` |
| `buy_send_document`, `buy_emp_req_doc`, `buy_ven_req_doc`, `sell_send_document`, `sell_request_document`, `attachable_doc` | `DocInstance` |
| `contract_cycle` with 19 type constants | `Cycle.kind` |
| `job`, `job_application`, `job_invitation`, `job_requirement`, `job_applicant_req`, `job_application_with_recruiter`, `job_application_without_registration` | `Requirement` + `RequirementInvitation` + `Submission` |
| `salary`, `salary_item`, `contract_salary_history`, `contract_book` | `Timesheet` approval writes the ledger; pay runs read `Cycle` |
| `chat`, `chat_user`, `conversation`, `conversation_message`, `group`, `message` | one `Conversation` model — **not yet written, see gaps** |
| `candidates_company`, `shared_candidate` | `BenchListing` with a tier |

### Deliberately dropped
`coupon`, `package`, `subscription`, `etyme_transaction`, `porposal_chat`, `portfolio`, `slider`, `favourite_chat`, `branchout`, `application_table_layout`, `custom_field`, `rating_category`, `criminal_check`, `share_link_preview`, `free_email_provider`, `seq_timesheet`.

Billing is Stripe. The CMS slider is replaced by generated site config. `free_email_provider` is unnecessary once the domain arrives verified from an OAuth tenant.

### Real gaps — must be built before this replaces 2017
1. **Conversations.** 2017 auto-created a thread per job, per contract and per document request. There is no model here yet. It is the connective tissue and its absence will be felt immediately.
2. **Notifications and preferences.** No model. Needs type × channel routing including Teams and email digests.
3. **Expenses.** `expense`, `expense_item`, `expense_type`, `client_expense`, `contract_expense` — five models, nothing here. Client-billable expenses appear on invoices.
4. **Leave and holidays.** `leave`, `holiday` — the holiday calendar is load bearing, because business day shifting depends on it.
5. **Commission.** `commission_queue`, `contract_sale_commision`, `csc_account`. Partner earnings have no home.
6. **Interviews.** `interview` — a pipeline stage with no record.
7. **Bank details and tax.** `bank_detail`, `tax_info`, `billing_info`, `invoice_info`.
8. **Vendor bills.** `vendor_bill` exists in 2017; here it is implied by `Cycle.kind` but has no table. C2C payables need one.
9. **Change rate history.** `change_rate` with PaperTrail. Rate changes must be versioned or the timesheet valuation is unreliable.
10. **Blacklist.** `black_lister` — filters candidates and companies out of search, feeds and contracts.

**Assessment:** the schema covers onboarding, supply, demand, matching, submission, assignment, timesheets, invoicing and rolloff. It does not yet cover conversations, notifications, expenses, commissions, vendor bills, rate history or the holiday calendar. Items 1, 2, 9 and 10 are needed for a first paying customer. Items 3 to 8 can follow.

---

## 7. Build order

**Week one.** Schema, migrations, NextAuth with Microsoft and Google, `/api/me`, company creation with slug and roles, template packs. Nothing visible except sign-in and a company record.

**Week two.** Import: upload, mapping, the dense review table, commit with progressive visibility. This is the screen everything else depends on, because without data nothing else can be demonstrated.

**Week three.** Requirements, parse, distribute, invitations. Matching worker with factors and unknowns. Submissions with both ledgers and the batch endpoint.

**Week four.** Assignments, cycle generation, timesheets, the rolloff scan. The automation log and the decision queue on top of what already exists.

Then stop and show it to the three vendors who asked for a demo, before building invoicing.

---

## 8. What will hurt

**Cycle generation is the hardest correct thing in the system.** Nineteen kinds, five frequencies, business day shifting against a per company holiday calendar, February, month ends, and idempotency on extension. The 2017 implementation in `payroll_cycles.rb` and `contract_cycle.rb` is correct and was earned over years. Port the arithmetic, not the architecture, and write the tests first.

**Field level permissions cannot be retrofitted.** Every read path must filter by context from the first commit. Adding it later means auditing every query.

**The undo promise on the principles page is a real commitment.** Reversing a distributed requirement means retracting invitations vendors may already have acted on. Decide now which actions are genuinely reversible and mark the rest final in `AutomationLog`.

**Serif numerals lack tabular figures.** Keep them for headlines and hero numbers. Any column of figures needs `font-variant-numeric: tabular-nums` and a sans face.
