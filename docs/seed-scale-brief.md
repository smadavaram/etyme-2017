# Design brief: a generated world at scale (`src/lib/seed-scale/`)

Written by the scout, read-only. Paths are under `/home/user/etyme-2017`. Line numbers are as of today's tree.
Nothing here is an implementation. Where a type is shown it is the contract the architect must lay first.
The firm that runs a client's program is an MSP, and a person is named by role.

---------------------------------------------------------------------------------------------------

## 0. The short answers

| Question | Answer |
|---|---|
| Does a generator already exist? | No. `src/lib/demo-volume.ts` (`addVolume`, line 189) is the nearest, and it is not reusable as called: it throws on any company with `isDemo: false` (line 199) and it fills visitors' sandboxes. Its **material** is worth lifting: a seeded random generator (`rng`, `hash`, `pick`, `weighted`), 24 horizontal roles with skills, bands and a manager's sentence (healthcare, manufacturing, finance, IT), 16 places, 35 first and 35 last names. None of it is exported. Export it, do not copy it. The name pools can combine into people the hand-written world already has (Priya Raman, Daniel Osei, Karthik Menon, Amara Nwosu and others are all built from them), so a generator must exclude those full names. |
| Is there an L3 for it? | **No.** Nearest rows in `src/lib/matrix.ts`: L3.2.2.8 "The demo door" (carries the hand-written world; `seed-world.ts` is in its `implementedBy`) and L3.6.3.6 "Every transaction simulated end to end, as each party" (the harness). A generated world has no process behind it. The architect adds the row first (suggest L3.6.3.7, "A scaled world to simulate against"), status not built, and adds `implementedBy` files only as they exist. |
| Does it need the schema? | **No.** Every row below maps to an existing column. One optional ask, not needed for the simulation: `Company.industry`. Today "industry" is hand-typed text on `src/app/demo/seats.ts`. There is no industry column, no skills table, no taxonomy, and no career or experience table. Keep industry in code. Deterministic ids (section 4) remove the need for the unique keys that Context, Role, Requirement and Verification lack. |
| Who builds what? | Section 5. The architect lays types, kit, industries and frame first; supply, regulatory, demand and money then build in parallel on disjoint files. |
| Biggest risks | (a) three existing seed files sweep **every person at a reserved address**, so generated people are swept into the hand-written world's steps on any later deploy (section 7, hazard 1); (b) the simulation sends every job to **every** supplier on a client's panel, so panel size, not people, sets the cost (section 6, loop 1); (c) the demo door and the catalog only open slugs that start `world-` (section 4.3). |

---------------------------------------------------------------------------------------------------

## 1. One firm of each kind: what the seed writes, in order

### 1.1 What is shared and what is hand-written

- **Nothing in the seed calls `createCompany`.** `src/lib/company-create.ts:95` (`createCompany`) is what sign-up and "Add company" use. It writes, in order: the Company (pack from `packFor`, country, currency, pay rhythm, `outsideAccess`, site words from `writeFromRules`, `claimedAt` when `seatAsOwner`), the optional `CompanyDomain`, **every role from `rolesFor(kind)`** (`src/lib/company-defaults.ts:441`), the Owner Context, the `ConsultantProfile.ownCompanyId` link for `CONSULTANT_CORP`, a primary `CompanyLocation`, and two years of Holiday rows for US, GB and IN. About 15 to 20 queries per firm. It uses `create`, not upsert, so the caller checks the slug first. It cannot set `createdAt` (the seed needs `day(0)`): either the architect adds an optional `createdAt` to `CreateCompanyInput`, or the frame updates it afterwards.
- **The world seed writes each firm by hand**, `src/lib/seed-world.ts:554-762` (`firm()` inside `seedWorld`): `company.upsert` by slug (`createdAt: day(0)`, `isDemo: false`, `defaultPaymentTerms` 45 for a client and 30 otherwise, no `templatePack`, no `supplierPosture`, no `domain`, no pay or week settings, so every column default stands); **one** Role named Owner with `['*']` (`:582-584`); the owner Person at `world-<slug>@demo.etyme.local` (`:585-590`); one EMPLOYEE Context (`:591-595`). The full role set, the other seats and everything else come from later steps, firm by firm.
- `ensureDefaultRoles` (`src/lib/company-roles.ts:13`) adds missing default roles and applies `RENAMED_ROLES`, `GRANTED_SINCE`, `REVOKED_SINCE` at runtime. The seed copies this inline for Brightmoor (`seed-world.ts:1811-1837`) and for each client (`seed-programmes.ts:623-632`). A generated firm made through `createCompany` already has the full set.

### 1.2 Per kind

Order is the order the seed writes. All of it is by hand per seeded firm; the only shared helpers are `trade` and `agreement` (closures inside `seedWorld`, `seed-world.ts:764-782`), `cover()` (inside `seedProgrammes`, `seed-programmes.ts:589-601`), `seedCalendar` (`seed-calendar.ts:140`, takes a map of firms) and `rolesFor`.

| Row | Client | GSI | MSP | Prime | Sub-vendor | Bench firm | One-person firm |
|---|---|---|---|---|---|---|---|
| Company, slug `world-<slug>` | `seed-world.ts:556` | same | same | same | same | same | `seed-doors.ts:571-583`, `kind: 'CONSULTANT_CORP'` |
| `supplierPosture` (PRIME or BENCH) | n/a | **never set** | n/a | **never set** | never set | never set | never set |
| Domain | none: seeded firms have no `Company.domain` and no `CompanyDomain`; seats sit at `@demo.etyme.local` | | | | | | |
| Roles | Owner `:582`, then all of `rolesFor('CLIENT')` at `seed-programmes.ts:623-632`, **only for the 3 program clients**; Harlow, Meridian, Corveldt, Nordway get Owner and Approver only | Owner; per-discipline roles for W2 staff (`seed-world.ts:1594-1603`, permissions `assignments.read`, `timesheets.read`); Delivery Manager `:1642-1650` | Owner (+ Compliance Officer at Kestrel `:2019-2025`) | Owner; AP & Payroll, Recruiter, Account Manager at named firms only (`:1901-1973`) | Owner | Owner (+ Recruiter, Resource Manager at Techpeple `:1867-1879`) | Owner `['*']`, `seed-doors.ts:642-646` |
| Seats (Person, Context) | Owner; VP with the Approver role (`:607-632`); six role seats from the six-role array at `seed-programmes.ts:62-78` (Program Manager, Hiring Manager, HR Partner, Procurement Lead, AP Clerk, Compliance Officer), `side: 'BUY'`, `orgUnitId` Apps or Technology (`:634-650`) | Owner; 4 W2 staff each (`:1566-1579`); 1 or 2 Delivery Managers (`:1642-1660`, `seed-internal-moves.ts`); AP & Payroll clerk | Owner (+ 1 compliance person at Kestrel) | Owner (+ AP clerk, recruiter, account manager at Pinnacle) | Owner | Owner (+ recruiter, resource manager at Techpeple; finance and recruiter at the niche firm, `seed-bench-profit.ts:79-82`) | the one person, `seed-doors.ts:641-657` |
| Locations | `seed-standing.ts:114-130`: a primary `CompanyLocation` for each roster firm that has none | same | same | same | same | same | none |
| Holidays | `seed-calendar.ts:140-188`: 11 US federal days x 6 years = 66 rows per firm, one `createMany` after one read; Sundara adds Republic Day | same | same | same | same | same | none |
| Org units | **by hand, `seed-world.ts:643-665`**: 8 units (Technology; Apps, Security, Infrastructure, SaaS, R&D beneath it; R&D 1, R&D 2 beneath R&D) | none | none | none | none | none | none |
| Cost centers + headcount plan | `:668-708`: 3 centers (Apps, Security, R&D 1), a plan for `seedPlanYear()`; Apps 6 heads and $2.4M, others 4 heads and $1.2M | none | none | none | none | none | none |
| Value rules | `:724-757`: "Over $500k" (approver = VP, rank 1), "Technology — over $400k" (scoped to Technology), "Program lead" (no threshold, rank 2) | none | none | none | none | none | none |
| Standing approval rules | `seed-programmes.ts:~660-690`: HR and Procurement rules on Technology (`kind` HR, PROCUREMENT) | none | none | none | none | none | none |
| Governance policy + 4 rules | `seed-programmes.ts:703-733`: TENURE_CAP (BLOCK, 18 or 24 months), BREAK_IN_SERVICE (BLOCK, 90 days), RATE_BAND (WARN, cents), INSURANCE_REQUIRED (BLOCK) | none | none | none | none | none | none |
| Counterparty (register, panel, standing) | One pair per tie, `seed-world.ts:764-769`. Relationship written from the seller's side: `CLIENT` (its buyer is a client) or `PRIME` (its buyer is a supplier); from the buyer's side `SUPPLIER`; an MSP adds `MSP` both ways (`:1255-1260`). `tier` (PROBATION, APPROVED, PREFERRED) is **never written**; null reads as APPROVED once an agreement exists (`src/lib/supplier-tier.ts:14`) | | | | | | |
| MasterAgreement + Engagement | `seed-world.ts:771-782` (`agreement`): `findFirst` on (vendor, client), else create (`paymentTerms: 45`, `signedAt: day(-400)`), then an Engagement `MONTHLY`. Nothing is unique on (vendorId, clientId) in the schema | | | | | | |
| MSP seat in a client's program | n/a | n/a | `ProgramSeat`: `seed-world.ts:1739-1768` (Aptiva at Cavanaugh) and `:1988-2043` (Kestrel at Talvern): `clientCompanyId`, `officeCompanyId`, `roleId` = **the client's own** Program Manager or Compliance Officer role, `grantedById` = client owner, `reason` | n/a | n/a | n/a | n/a |
| Cover and standing | none | GL and WC Verification `:1622-1633` | none | GL and WC from `place()` `:962-972` or `cover()` | same | same | GL and WC on her own company, `seed-doors.ts:~889` |
| Bench policy | n/a | n/a | n/a | defaults (`NO_PAY`) | defaults | **only** the niche firm: `REDUCED_RATE`, `benchRateBps 5000`, `benchCarryDays 90` (`seed-bench-profit.ts:96`), plus a `Course` (`:98-105`) and Enrollments | n/a |
| Pay and week settings | **none written by any seed.** `daysOff [0,6]`, `hoursDueWeekday 1`, `approveByWeekday 3`, `payPeriod BIWEEKLY`, `payDaysOfMonth [28]` all stand. Contracts are written with `packId: 'US_IT'` passed explicitly, because `templatePack` is null (`seed-world.ts:892`) | | | | | | |
| Claimed | `step('claim')` (`:2226-2235`) sweeps roster firms that hold a seat. `createCompany` sets `claimedAt` itself when `seatAsOwner` | | | | | | |

### 1.3 What the generator should do instead

- Write each firm **through `createCompany`** (`seatAsOwner: true`, `byPersonId` = a seeded owner Person, `isDemo: false`, `claimDomain: false`, `domain: null`, `posture` PRIME or BENCH). The result looks exactly like a signed-up firm: full default roles, pack, pay rhythm, location, two years of holidays, `claimedAt`. This would be the first time the seed matches sign-up.
- Set explicitly what `createCompany` leaves to defaults and the stations read: `benchPolicy` for bench firms, `defaultPaymentTerms`, `createdAt: day(0)`.
- Write the rest **in batches, not per firm**: seats, org units, cost centers, plans, rules, counterparties, agreements, cover, program seats. Each as one `createMany` after one read of what exists.
- The stations need these exact role names held at each kind. The role-key table that `src/app/api/demo/route.ts` and `scripts/simulate/actors.ts` import maps keys to role names; find it by grepping `'Hiring Manager'` in `src/lib`.
  - Client: Program Manager, Hiring Manager, Procurement Lead, HR Partner, Approver, AP Clerk, Compliance Officer, and the Owner as the first-granted seat. `post-jobs` needs a Hiring Manager (`scripts/simulate/stages/demand/post-jobs.ts:36`); `send-to-suppliers` needs the Program Manager or Procurement Lead (`send-to-suppliers.ts:29`). Today **only 3 of the 7 clients** hold these.
  - MSP: Program Manager, Supplier Manager, Coordinator, AP Clerk, Compliance Officer, and a `ProgramSeat` into each client it runs.
  - GSI: Owner, at least two Delivery Managers (the internal-moves story reads two, `bench-and-consent.ts:461`), AP & Payroll, Recruiter or Resource Manager (`listerAt`, `bench-and-consent.ts:75`), and its W2 staff.
  - Supplier of any kind: Owner, Recruiter, Resource Manager, Account Manager, AP & Payroll, Finance, Contract Manager, Accounts Receivable, Compliance Officer. A small sub-vendor can hold fewer (Owner, Recruiter, AP & Payroll): stations fall back recruiter, resourcing, account, owner (`stages/demand/common.ts`, `supplierSeat`).
  - One-person firm: Owner only.

---------------------------------------------------------------------------------------------------

## 2. One person of each career: the rows, and who writes them today

### 2.1 The base rows every candidate has

| Row | Today's writer | Notes |
|---|---|---|
| `Person` (`primaryEmail` unique, reserved suffix) | `seed-world.ts:806` (`person.upsert`); bulk pattern in `demo-volume.ts` (`createMany` + `skipDuplicates`) | Seeded people sit at `<name>@seed.etyme.invalid`. The catalog opens a worker seat only for a reserved address (`reservedAddress`, `src/lib/demo-session.ts:92`). |
| `ConsultantProfile` | `seed-world.ts:809-816`; `seed-doors.ts:586-598` | `skills: String[]` (free text), `location`, `workAuth` (USC, GC, H1B, TN, OPT), `headline`, `visibility` (`VERIFIED` in seeds), `rateFloor` (cents), `availableFrom`, `confirmedAt` (staleness ranks matches), `ownCompanyId`. |
| Résumé fields | `seed-pipeline.ts:96-120` | **There is no structured career.** A career exists only as: a `Resume` with `textExtract` (the seed writes four lines; `createMany`), ended `SellContract`/`BuyContractCandidate` rows (the tenure ledger's input), `Enrollment` rows, and `VisaPetition` rows. |
| `BenchListing` (consent and duration) | `seed-world.ts:822-829`, `:1295-1301`; `seed-bench-matching.ts`; `seed-bench-profit.ts:330` | Unique on (consultantId, companyId). Columns that matter: `tier` (`RETAINED` the firm's own bench, `MARKETING` offered outward), `state` (GRANTED, INVITED, DECLINED), `invitedAt`, `respondedAt`, `grantedAt`, `revokedAt`, `showInMatches`, `askFirst`, `stayDays`/`staysUntil` (the 5, 7, 15, 25, 50, 60, 500 days or until-cancelled choice, `src/lib/bench-stay.ts`), `lapsedAt`, `rateMin`/`rateMax`, `termsEngagementType`/`termsPayRateCents`. |
| Own seat | `step('own-seats')` `seed-world.ts:2180-2202`; `ownSeatGrantReason` in `src/lib/own-seat.ts:74` | `Context type CONSULTANT`, no company, no role. The simulation's `workerSeat` refuses a person with no seat (`stages/demand/common.ts:127-139`). That step reads **roster** firms only, so people.ts must write the seat itself. |

### 2.2 The four careers and the rows each needs

| Career | Rows (beyond 2.1) | Pattern to copy |
|---|---|---|
| **Fresher just trained** | `Course` owned by the bench firm (`category`, `duration`, `price`); `Enrollment` COMPLETED with `score` and `completedAt`; `BenchListing MARKETING GRANTED` dated after completion; `EDUCATION_EVALUATION` Verification (CLEAR, provider WES); I-9 `PENDING` or `IN_PROGRESS` (not started yet); no contracts; `workAuth` often OPT or H1B | `seed-bench-profit.ts` (Pellwright: `NichePerson.course` COMPLETED, IN_PROGRESS, DROPPED); `lib/training` for the status flow |
| **Ten-year engineer between projects** | 2 to 4 **ended** `SellContract` + `BuyContract` + `BuyContractCandidate` + `ContractLink` at world clients (the tenure ledger sums days on site per person per client across suppliers, `src/lib/tenure-days.ts`, and counts both end days); the latest ends 0 to 60 days before the birthday so `freeForJob` (`src/lib/match-pool.ts:497`) reads them free; I-9 CLEAR + `DocumentBacking` to a `PASSPORT`/`GREEN_CARD`/`VISA` Verification; `BACKGROUND_CHECK` CLEAR with `orderedByCompanyId`; `BenchListing RETAINED` at the employer, or an EMPLOYEE Context at a GSI | `seed-programmes.ts` placements with `state: 'ENDED'`; `place()` `seed-world.ts:785-1162`; backing at `seed-standing.ts:436-480` |
| **Moved from a bench to their own one-person company** | A `Company kind CONSULTANT_CORP` (through `createCompany` with `seatAsOwner: true`, which also sets `ConsultantProfile.ownCompanyId`); the old `BenchListing` with `revokedAt`; GL and WC Verification on the **company**; `GOOD_STANDING`; a `MasterAgreement` (vendor = the corp, client = the prime) and a `SellContract` from the corp; optionally a live corp-to-corp chain | `seed-doors.ts:563-760` (Colleen Byrne, Byrne Critical Care LLC) |
| **Looking while employed** | An EMPLOYEE Context or a live `IN_PROGRESS` SellContract ending 30 to 120 days out; a `BenchListing` with `askFirst true`, `showInMatches`, a future `availableFrom` and a `stayDays` window; stale `confirmedAt`; `DoNotSubmit` on their current client. `freeForJob` drops anyone whose line runs past a job's start, so a share must end **before** the generated jobs' `neededBy` | `match-pool.ts:629-673` (who is dropped); `seed-pipeline.ts:172-184` (`DoNotSubmit`) |

### 2.3 Verification rows in each state

- `Verification.type` values: `I9_EVERIFY`, `BACKGROUND_CHECK`, `EDUCATION_EVALUATION`, `DRUG_SCREENING`, `INSURANCE_GL`, `INSURANCE_WC`, `INSURANCE_EO`, `INSURANCE_CYBER`, `GOOD_STANDING`, `BUSINESS_PARTNER`, `REFERENCE_CHECK`, `RIGHT_TO_WORK`, `PASSPORT`, `GREEN_CARD`, `VISA`, `DRIVERS_LICENSE`, `WORK_PERMIT`, `PROFESSIONAL_LICENSE`.
- `status` values: `PENDING`, `IN_PROGRESS`, `CLEAR`, `CONDITIONAL`, `FLAGGED`, `FAILED`, `EXPIRED`; and a `CLEAR` whose `expiresAt` is in the past.
- Required column: `uploadedById` (a Person id). That is why papers.ts depends on the frame's seats (an HR or compliance person per firm).
- The verdict on a background check is the **provider's**: write `provider`, `referenceId`, `orderedByCompanyId`, `orderedAt`; never write one as if a seat verified it.
- I-9 and `RIGHT_TO_WORK` block a start; background check, education and drug screening warn; lapsed cover blocks (`src/lib/contract-clearance.ts:96-107`, `:372-373`).
- `ExemptAssertion` (unique on buyContractId + personId) is written by `POST /api/contracts/[id]/exempt` and by `seed-rate-change.ts`; a W2 person on a generated live line can carry one.
- `VisaPetition` + `VisaEvent` + `VisaDocument` for H-1B people: pattern `seed-standing.ts:575-640` (status ACTIVE with an `expiresAt`; one in three has an RFE trail; one runs out inside the assignment).
- Files behind seeded evidence carry a `fileHash` that starts `seed:` (`SEED_FILE_HASH`, `seed-cleanup.ts:89`); keep that so the cleanup can tell seeded files from real ones.

### 2.4 Suggested mix for 2,000 (tunable constants in the frame)

- Fresher 25% (500), between projects 25% (500), bench-to-own-company 8% (160, so about 160 extra companies), looking while employed 15% (300), on a live placement 20% (400), other (invited and unanswered, declined, lapsed) 7% (140).
- Of the 2,000, about 400 are W2 staff of the 10 GSIs (EMPLOYEE Context with a discipline Role, no listing, but **with a profile**, because matching only weighs an employee who has skills on record, `match-pool.ts:751`). The rest sit on the benches of sub-vendors and bench firms.
- Industries: IT, healthcare (titles must say "nurse", "therapist" and so on so `licensedOccupation`, `src/lib/packets.ts:238-265`, picks the licensed packet and asks for `PROFESSIONAL_LICENSE`), manufacturing (validation, avionics, PLM, mechanical), finance (Murex, risk, ERP finance).

---------------------------------------------------------------------------------------------------

## 3. A job and a rate

### 3.1 The job

`Requirement` (model in `prisma/schema.prisma`) fields the stations read:

- Identity and money: `companyId` (the owner), `title`, `skills String[]`, `location`, `billMin`/`billMax` (**cents per hour**), `months`, `headcount`, `hoursPerWeek`, `overtimeAfterHours`, `neededBy`, `startDate`.
- State: `status` (DRAFT, OPEN, FILLED, CLOSED, CANCELLED), `approvalState` (DRAFT, PENDING_APPROVAL, CHANGES_REQUESTED, APPROVED, REJECTED, AUTO_APPROVED), `source`.
- Coding, so the job publishes itself within plan: `costCenterId`, `orgUnitId`, `raisedById`, `ownerId`, `reportsToId`, `needKind` (use `openShape()`, `seed-programmes.ts:212`), `workMode`, `justification`, `description`.
- Chain: `endClientCompanyId`, `payerCompanyId`, `mirroredFromId` (a prime's mirror of the client's job).
- Margin: `marginClass` (ARBITRAGE or EXPERTISE) and `rateVisible` exist and **no seed has ever written them**. Money may set them on a share of generated jobs.
- **No unique key.** The seed finds a job by (companyId, title) (`seed-world.ts:833`). A generated job gets a deterministic id (section 4).

`RequirementInvitation` (unique on requirementId + toCompanyId): `fromCompanyId`, `toCompanyId`, `payMin`/`payMax` (cents; **the rate band lives here and never on the Requirement**), `status`, `expiresAt`.
`Submission` (unique on requirementId + personId): `fromCompanyId`, `toCompanyId`, `kind` (the route computes it), `rate`, `status`, `parentSubmissionId` for the onward hop. See `seed-world.ts:1464-1487` for a bench, prime, client chain.

### 3.2 The rate

- Rates descend by rung: the client pays rung 0 and each rung keeps the gap (`PLACEMENTS.rates`, `seed-world.ts:204-221`, for example `[13800, 11200, 8600]`).
- Guardrails the stations check: the client's `RATE_BAND` rule (WARN; `seed-programmes.ts:233`, `band: [7000, 15000]`), the sift drops a person whose `rateFloor` exceeds the job's `billMax` (`bench-filter.ts` `rateWorks`), submit clamps `rate` into the band (`stages/demand/submit.ts` `rateFor`), `MasterAgreement.minMarginPct` and `rateCard`.
- Bench side: `BenchListing.rateMin/rateMax`; `termsPayRateCents` is about 72% of the listed rate in `bench-and-consent.ts`.
- Rates are never visible across rungs, and a sub-vendor's name is the prime's to keep unless `MasterAgreement.disclosesSubVendors` is true (default false). Setting it true on one or two client-and-prime agreements exercises the disclosure rule.

### 3.3 Skills: there is no taxonomy

- Skills are free-text `String[]` on `ConsultantProfile` and `Requirement`. There is no `lib/skills` and no skills table.
- **Three matchers read them, so the vocabulary must be a closed list of canonical strings used verbatim by people and jobs:**
  1. `skillHits` in `src/lib/bench-filter.ts` (the rules sift before any model): lower-cases, strips all but `a-z0-9+#/.`, then **substring either way**. A skill of one or two letters ("C", "R", "Go", "QA") matches inside nearly any word, and "Java" matches "JavaScript". Never generate a skill shorter than four characters.
  2. `scoreDeterministic` (`match-engine.ts:518-541`): case-insensitive exact = 1, substring = 0.5.
  3. The simulation's `skillFit` (`scripts/simulate/stages/demand/common.ts:28-32`): **exact equality** after lower-casing and collapsing punctuation to a space. This decides who is put forward.
- Keep each job to 2 to 4 skills and each person to 3 to 7, from the same per-industry list. Express seniority in the title and rate, never in the skill string.
- Titles also feed `submit.ts fit()` (a role name inside the job title adds weight), the licensed-packet rule, and `post-jobs`, which copies each hiring manager's **own seeded jobs** as templates: every client needs several historic or open jobs with `billMax` set, `skills` non-empty, and a cost center and org unit, or `post-jobs` says "No client has a job in the seed to copy".
- `templatesFor` (`bench-and-consent.ts:81-120`) gives each supplier its recruiting templates from jobs sent to it or from clients it trades with. **A supplier with no tie to a client that has jobs on record recruits nobody.** Every one of the 100 suppliers needs at least one client tie, direct or through a prime.

### 3.4 How `lib/match-pool` finds people (so generated people are findable)

`poolFor` (`match-pool.ts:533`) reads `tiesOf` (`:409`), then `BenchListing` where `state GRANTED`, `revokedAt null`, and `staysUntil` null or in the future, in four circles:

1. OWN: the viewer's own listings.
2. PANEL: `MARKETING` listings at firms in the viewer's `SUPPLIER` Counterparty rows, its agreements as client, or contracts that bill it.
3. TRADING: other Counterparty ties either way.
4. SUGGESTION: only for a client on its own job, `MARKETING` + `showInMatches` anywhere.

It then drops anyone on a live line past the job's start. **There is `take: 400` at line 606 with no `orderBy`.** `employeesFree` (`:723`) loads **every** EMPLOYEE Context of a selling firm with no limit. A `RETAINED` listing is invisible to everyone but the firm itself; to be matched by a client a person must be `MARKETING`.

---------------------------------------------------------------------------------------------------

## 4. Idempotency, dates, and opening a generated seat

### 4.1 The scheme the generator must follow

1. **Birthday.** Every seeded date is `day(n)` (`src/lib/seed-days.ts:106`) counted from the day the world was born; `anchorSeed()` sets it. The base world finds its birthday in `worldAnchor()` (`seed-world.ts:329`, **not exported**): the earliest `createdAt` of a roster firm. The scale seed runs in the same database after the base world, so it calls `anchorSeed` with that date: the architect exports `worldAnchor`. Also call `primeCalendar()` (`seed-calendar.ts:122`) before writing any cycle. Plan year: `seedPlanYear()`. Weeks run Sunday to Saturday: `weekStart`/`weekEnd` in `src/lib/overtime.ts`.
2. **No wall clock, no `Math.random`.** `demo-volume.ts` shows the pattern: `rng(hash(key))` (mulberry32 and FNV). Every random choice is keyed on a stable string, so two runs make the same world.
3. **Steps.** Register generated steps through the same machinery as the base world, `src/lib/seed-steps.ts` (`finishedSteps`, `recordStep`, `shareOf`, `seedBudgetMs`). A marker is an `AutomationLog` row with payload `{step, world, version}`; `world` is the id of the first firm written, and with deterministic ids it is known without a query. **A new deploy re-walks every step**, so each step must be a cheap no-op when its rows exist.
4. **Budget.** `__integration__/seed-step-size.test.ts` holds every step under **350 queries**, fresh and re-walked, on the reasoning that a production query costs up to 46 ms and a call has about 30 seconds of headroom (`seed-steps.ts:50-65`). Today there are 99 steps (`worldStepNames()`). A scale step reads what exists once per table, then `createMany({ skipDuplicates: true })` in batches of at most 500 rows (Prisma's 32,767 bind limit: 500 rows x 30 columns is safe, 2,000 is not).
5. **Deterministic ids.** Supply your own primary keys derived from a stable key (for example a hash of `"sx/person/0412"` rendered cuid-shaped). Foreign keys are then computable with no read-back, `skipDuplicates` on the primary key is the idempotency check, and Role, Context, Requirement and Verification (which have no natural unique) need no schema change. Two constraints: ids must **not share their last six characters** (invoice numbers are `IN-${id.slice(-6)}-<period>`, `seed-world.ts:1117`, and are unique), and ids should **sort after the base world's** (section 7, hazard 1). `createManyAndReturn` exists in this Prisma (used at `seed-order-to-cash.ts:770`) where an id must come back.
6. **Emails.** Unique per person, reserved suffix. The base world builds `name.lower.replace(/[^a-z]+/g,'.')@seed.etyme.invalid`, which collides at 2,000 names. Add an index: `<first>.<last>.<nnnn>@scale.etyme.invalid`.
7. **Names.** `__tests__/invariants/seeded-names-distinct.test.ts` requires that people seated at one client share no first name, no last name and no four-letter last-name prefix. The generator must guarantee the same inside every firm it seats, not only clients (two holders of one role are told apart by full name in the seat key). Firm and person names must be invented: `lib/positioning` `namedCompanies`, `docs/demo-names.md`, and `__tests__/invariants/demo-names.test.ts` (which reads named seed files, so the new files need adding to its list).

### 4.2 The template (what the simulation copies)

- `__integration__/templates.ts` `planTemplates()`: the world template is named `etyme_tpl_world_<UTCday>_<hash>`, and the hash covers `prisma/schema.prisma` plus the **import closure** of every file directly in `src/lib` matching `seed-*.ts`, `demo-seed*.ts`, `seed-world`, `seed-days`. **A folder does not match.** `src/lib/seed-scale/` is hashed only if a matched file imports it. If nothing imports it, editing it never rebuilds the template. The architect adds a second plan (`planScaleTemplate`) hashing the closure of `src/lib/seed-scale/index.ts` plus the base template's name.
- `scripts/simulate/world-db.ts` `prepareWorld(stamp, log, template?)` builds the base template if missing, copies it to `etyme_sim_<stamp>`, and creates the read-only role. `--template NAME` already exists (`scripts/simulate/args.ts`) and skips the build. So the scale world can be a **separate sealed template**: copy today's base world template, run `seedScaleWorld()` on the copy, seal it; the simulation then runs with `--template etyme_tpl_scale_<day>_<hash>`. A `--scale` flag can build it on demand.
- **Do not put the scale world into the base template.** 199 integration test files each copy it (`ls __integration__/*.test.ts | wc -l`), and tests assert exact shapes: `demo-seats.test.ts:189` ("fourteen company doors and six people"), `seed-in-steps.test.ts` row counts, `seed-covers-the-matrix.test.ts`, `rebuild-demo.test.ts`.

### 4.3 What the demo door and the catalog need to open a generated seat

- **The slug must start `world-`.** `src/app/api/demo/route.ts:319` refuses anything else (`NOT_A_WORLD_SEAT`); `readCatalog` in `scripts/simulate/actors.ts` selects `co.slug like 'world-%'`; five stations also filter on `world-`. `/ready` (`src/lib/readiness-facts.ts:80`) and sign-up (`src/lib/password.ts:222`) treat `world-` as seeded. So generated slugs are `world-sx-<kind>-<nn>-<handle>`, and they are **not** in `WORLD_SLUGS`. The roster-scoped base steps (standing, order-to-cash, payroll runs, claim, own-seats) therefore do not touch them: good for cost, bad for completeness (section 7, hazard 4).
- **The seat `<slug>/owner`** is the firm's first-granted Context that has a role. The door takes `orderBy grantedAt asc, take 1` (`route.ts:359-360`); the catalog orders `grantedAt asc, email`. A `createMany` stamps every row with the same `grantedAt`, which leaves "first" to chance. **Write the Owner Context first, or set a strictly increasing `grantedAt` per firm.**
- **Role keys** come from the role-key table (grep `'Hiring Manager'` in `src/lib`). `<slug>/<key>` resolves to the first holder; a second holder of one role gets `<slug>/<key>/<Person name>`, so two holders at one firm need different full names.
- **A worker seat** (`worker/<email>`) needs a reserved-suffix address (`.invalid`, `.example`, `.local`; `RESERVED_SUFFIXES`, `src/lib/demo-session.ts:99`) and at least one of: a CONSULTANT Context at a `world-` firm, a SellContract at one, a Submission from one, a BenchListing at one. The signed cookie is `sign(email)`; no door route is called (`Actor.open`, `actors.ts`).
- **A staff seat** (`staff/<email>`) is any role no role key names (a discipline Role at a GSI), at a reserved address.
- `cast.refresh()` re-reads the catalog after every station; it adds seats and never replaces one.
- A person who holds seats at two firms is opened by whichever Context the session resolves first. Avoid it, except for the one-person-firm owner (as Colleen Byrne is).

---------------------------------------------------------------------------------------------------

## 5. Ownership and the file split

### 5.1 Who owns what today (`src/lib/domains.ts`; the longest path claim wins, `domainOf` at about line 700)

| Domain, agent | Files near this work |
|---|---|
| **PLATFORM, etyme-architect** | `lib/seed-world`, `lib/seed-programmes`, `lib/seed-doors`, `lib/seed-days`, `lib/seed-steps`, `lib/seed-calendar`, `lib/seed-standing`, `lib/seed-order-to-cash`, `lib/seed-rate-change`, `lib/seed-sector-suppliers`, `lib/seed-coding`, `lib/seed-pipeline`, `lib/seed-bench-matching`, `lib/seed-payroll-runs`, `lib/seed-rebuild`, `lib/seed-cleanup`, `lib/seed-owners`, `lib/seed-renames`, `lib/seed-week-approval`, `lib/seed-document-requirements`, `lib/company-create`, `lib/company-defaults`, `lib/company-roles`, `lib/demo-volume`, `lib/demo-seed*`, `lib/domains`, `lib/matrix`, `scripts/simulate` (harness, actors, report). `__integration__/templates.ts` sits in a test folder that every builder may write, but the template plan is the architect's call |
| **SUPPLY, etyme-supply** | `lib/match-pool`, `lib/match-engine`, `lib/bench-filter`, `lib/bench-stay`, `lib/seed-internal-moves`, `lib/seed-bench-profit`, `lib/training`, `lib/resumes`, `lib/consultant-portfolio`, `scripts/simulate/stages/supply` |
| **REGULATORY, etyme-regulatory** | `lib/document-request`, `lib/visa-petition`, `lib/twin/rules/tenure`, `lib/twin/seed-tenure-demo`, `app/api/governance`, `app/api/tenure`, `scripts/simulate/stages/regulatory` |
| **DEMAND, etyme-demand** | `app/api/requisitions`, `app/api/invitations`, `lib/award`, `lib/openings`, `lib/screening`, `lib/checks`, `scripts/simulate/stages/demand` |
| **MONEY, etyme-money** | `lib/money`, `lib/periods`, `lib/contract-cycles`, `lib/cycle-generator`, `lib/bench-policy`, `lib/contract-rate`, `lib/rate-line`, `lib/billing-cascade`, `app/api/contracts`, `lib/twin/seed-demo`, `scripts/simulate/stages/money` |
| MARKET, CONVERSATION | not touched by this work |

Rules from `domains.ts` and its test: carving a file or folder out of an architect-owned parent is the established pattern (`lib/twin/rules/tenure` is regulatory's inside the architect's `lib/twin`). One entry such as `lib/seed-scale/people` covers both `people.ts` and a `people/` folder, so a domain that needs several files owns a **folder from the start**. Every file needs exactly one owner the commit it lands (`__tests__/invariants/domain-ownership.test.ts`). `src/` is scanned by `american-english.test.ts` (no British spellings).

### 5.2 Proposed split of `src/lib/seed-scale/`

| File | Owner | Writes | Depends on |
|---|---|---|---|
| `types.ts` | architect | **types and constants only** (5.3). Laid first, alone, in a commit of its own, so the other four can code against it | nothing |
| `kit.ts` | architect | the seeded random (`rng`, `hash`, `pick`, `weighted`, exported from `demo-volume.ts`), `idFor(key)`, `batch()`, `have()` (read existing keys once), `birthday()`, unique-name pools (minus the base world's people), the email builder | types |
| `industries.ts` | architect | the closed vocabulary: per industry, roles (title, skills, seniority, licensed flag), places, firm-name stems, bench niches | types |
| `frame.ts` | architect | `buildFrame()` (pure), `seedFrame()`, `loadFrame()`, `ensureSolo()` (5.3). Writes: about 285 Companies via `createCompany`, seats for every kind, org units, cost centers, headcount plans, value rules, standing rules, governance policy and rules, Counterparty (panel and register), MasterAgreement + Engagement, `ProgramSeat` for MSPs, calendar (`seedCalendar`) | types, kit, industries |
| `index.ts` | architect | `scaleStepNames()`, `seedScaleWorld()`, `seedScaleInSteps()` (the shape of `seedWorldInSteps`); the one file `planScaleTemplate` hashes | all |
| `people.ts` (folder allowed) | **supply** | Person, ConsultantProfile, Resume, BenchListing, Course, Enrollment, EMPLOYEE Contexts for GSI staff (discipline Roles), CONSULTANT own seats, one-person companies (via `ensureSolo`), ended career lines (SellContract, BuyContract, BuyContractCandidate, ContractLink; no cycles) | frame, industries, `rates.pairFor` |
| `papers.ts` (folder) | **regulatory** | Verification in every state, DocumentBacking, VisaPetition + VisaEvent + VisaDocument, ExemptAssertion, supplier cover (GL, WC, EO, GOOD_STANDING), professional licenses, DocumentRequirement if orders are generated | frame, people (`PersonFacts`) |
| `jobs.ts` (folder) | **demand** | Requirement (history and open), RequirementApproval where pending, RequirementInvitation, Submission and Interview history, each hiring manager's template jobs | frame, industries, `rates.bandFor` |
| `rates.ts` (folder) | **money** | **Pure half first** (no database; the other three import it): `bandFor`, `chainFor`, `pairFor`, `listingRate`, `floorFor`. Then rows: MasterAgreement terms and rate cards, `minMarginPct`, bench policy columns on bench firms, `RateHistory`, and cycles for the live lines (`writeCyclesFor`) | frame, industries |

Build order: types; then kit, industries, frame (architect); then the four in parallel (each depends only on `types.ts` and money's pure half, which money delivers in its first commit); then `index.ts` wires the steps. Two agents never share a file.

Tests: CLAUDE.md's 2026-10-20 decision allows new test files for "the simulation itself" and the walk; a generator is neither, so the architect asks the founder. The minimum worth having, named as sentences: "every generated firm holds the roles the simulation looks for", "a second seeding writes nothing", "no two people at one firm share a first or last name", "no generated skill is shorter than four letters", "every generated job's skills come from its industry's list", "every generated person opens as a seat in the catalog".

### 5.3 The interface the frame exports (contract only)

```ts
// src/lib/seed-scale/types.ts  (architect, first commit; types and constants only)

export type CompanyKind = 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP'   // as Prisma
export type IndustryKey = 'IT' | 'HEALTHCARE' | 'MANUFACTURING' | 'FINANCE'

/** Where a firm sits on a deal. Kind alone cannot tell a prime from a sub-vendor. */
export type Position = 'CLIENT' | 'GSI' | 'MSP' | 'PRIME' | 'SUB_VENDOR' | 'BENCH' | 'SOLO'

/** The headline sizes, in one place, so no file hard-codes a count. */
export const SCALE: {
  clients: 10; gsis: 10; msps: 5; suppliers: 100
  primes: 30; subVendors: 40; benchFirms: 30      // the three sum to suppliers
  people: 2000
  panelSize: { min: 6; max: 12 }                  // suppliers per client (section 6.4, loop 1)
  mspRuns: 5                                      // clients an MSP runs through a ProgramSeat; the rest run their own
}

export interface Industry {
  key: IndustryKey
  roles: RoleTemplate[]                // the closed vocabulary
  places: string[]
  firmStems: string[]                  // invented; checked against real company names
  niches: Niche[]                      // for bench firms: a skill family and a course
}
export interface RoleTemplate {
  title: string                        // licensed titles contain the occupation word
  skills: string[]                     // each at least 4 letters, used verbatim by people and jobs
  seniority: 'JUNIOR' | 'MID' | 'SENIOR'
  licensed: boolean
}
export interface Niche { key: string; label: string; skills: string[]; course: { title: string; hours: number; priceCents: number } }

/** A seat the stations can sit in. */
export interface ScaleSeat {
  personId: string
  email: string                        // reserved suffix
  name: string
  role: string                         // the role's own name, e.g. "Hiring Manager"
  roleKey: string | null               // the demo role key it opens as; null for a discipline Role
  companyId: string
  grantedAt: Date                      // strictly increasing per firm; the Owner is first
}

export interface ScaleFirm {
  index: number
  id: string                           // deterministic
  slug: string                         // world-sx-...
  name: string
  kind: CompanyKind
  position: Position
  posture: 'PRIME' | 'BENCH' | null
  industries: IndustryKey[]
  niche: string | null                 // bench firms
  country: 'US'
  seats: ScaleSeat[]                   // Owner first
  seat(roleKey: string): ScaleSeat | null
  program?: {                          // clients only
    orgUnitIds: Record<string, string>
    costCenterIds: string[]
    approverId: string
    hiringManagerId: string
  }
}

/** One tie on the register; seedFrame writes both rows. */
export interface Trade {
  seller: string                       // firm id
  buyer: string                        // firm id
  relationship: 'CLIENT' | 'PRIME' | 'MSP'   // the seller's row; the buyer's row is SUPPLIER (CLIENT for an MSP)
  tier: 'PROBATION' | 'APPROVED' | 'PREFERRED' | null
  agreementId: string | null
  disclosesSubVendors: boolean
}

export interface ScaleFrame {
  firms: ScaleFirm[]
  byId: Map<string, ScaleFirm>
  bySlug: Map<string, ScaleFirm>
  byPosition(p: Position): ScaleFirm[]
  trades: Trade[]
  panelOf(clientId: string): ScaleFirm[]       // the suppliers a client sends jobs to
  primesOf(subId: string): ScaleFirm[]
  subsOf(primeId: string): ScaleFirm[]
  mspOf(clientId: string): ScaleFirm | null
  industries: Industry[]
  clock: { birthday: Date }
}

// src/lib/seed-scale/frame.ts  (architect; signatures only)
export function buildFrame(): ScaleFrame                              // pure: no database, same output on every call
export async function seedFrame(frame: ScaleFrame): Promise<void>     // idempotent, batched
export async function loadFrame(): Promise<ScaleFrame>                // 2 or 3 queries, for steps that run in a later call
export async function ensureSolo(frame: ScaleFrame, personId: string, name: string): Promise<ScaleFirm>  // one-person company via createCompany
```

The other four export `seedPeople(frame, share?)`, `seedPapers(frame, people, share?)`, `seedJobs(frame, share?)`, `seedRates(frame, share?)`. `PersonFacts` (id, email, career, industry, skills, workAuth, firmId, listing, lineEnds) is exported by people.ts and read by papers.ts; because people are deterministic, `buildPeople(frame)` returns them without a read.

---------------------------------------------------------------------------------------------------

## 6. Size and time

### 6.1 What the base seed is today (measured)

Measured on 2026-10-20 by copying today's sealed template to a scratch database, counting rows, and dropping it. The repo was not touched. This is the only thing the scout wrote, and only to a throwaway database.

| | Base world |
|---|---|
| Steps | 99 (`worldStepNames()`) |
| Total rows | about 13,300 |
| Companies | 28 (7 clients, 2 MSPs, 2 GSIs, 16 suppliers, 1 one-person firm) |
| Person / Context / Role | 144 / 121 / 92 |
| Biggest tables | Cycle 5,861; Holiday 1,788; JournalLine 1,178; JournalEntry 589; OrderPosting 516; WorkAssertion 334; LedgerAccount 304; DocumentRequirement 205; AutomationLog 185; Timesheet 149; Verification 134 |
| Database size | 25 MB sealed world against 17 MB for the empty schema, so about 8 MB of data |
| Copy time | 0.19 s for the world template, 0.16 s for the empty one (`CREATE DATABASE ... TEMPLATE`) |
| Seed time | **not re-measured.** Code comments say "about a minute" locally (`scripts/simulate/world-db.ts`) and "most of a minute" (`__integration__/global-setup.ts`). Production needed several 60-second calls: the 2026-09-29 incident in `seed-steps.ts`, steps of 1,307 and 1,728 queries, 46 ms per query as the planning figure |
| After one simulation run (100 placements asked) | about 46,000 rows; a run adds about 33,000 |

### 6.2 What the generated world is (estimates; the arithmetic is shown)

| Table | Estimate | Basis |
|---|---|---|
| Company | about 285 | 125 firms plus about 160 one-person firms (8% of 2,000) |
| Role | about 1,700 | 10 clients x 8, 5 MSPs x 6, 10 GSIs x 15, 100 suppliers x 11, 160 solos x 2 (`rolesFor`) |
| Person | about 2,600 | 2,000 candidates plus about 600 seated staff |
| Context | about 3,300 | seated people plus 2,000 CONSULTANT own seats, minus overlap |
| ConsultantProfile, Resume | 2,000 each | one each |
| BenchListing | about 1,800 | |
| Verification | about 6,700 | about 3 per candidate plus firm cover |
| VisaPetition (+ events, docs) | about 300 (+1,200, +900) | H-1B about 15% |
| Counterparty | about 800 | 10 x 9 x 2 panels, 40 subs x 1.5 primes x 2, MSP and GSI ties |
| MasterAgreement + Engagement | about 400 + 400 | one per tie that carries an agreement |
| Holiday | about 11,800 | 125 x 66 plus 160 x 22 (solos use `createCompany`'s two-year set) |
| Requirement | about 900 | 10 x 60 client jobs plus 300 prime mirrors |
| RequirementInvitation | about 2,400 | 200 open jobs x a panel of 12 |
| Submission, Interview | about 1,500, 1,000 | history |
| Ended career lines | about 2,000 contracts | no cycles |
| Live placements | about 400 | with `writeCyclesFor`, about 110 cycle rows per sell and buy pair (5,861 / 53 today), so about 44,000 Cycle rows |
| **Total** | **about 120,000 to 200,000 rows** | 10 to 15 times today. If ended lines also carry cycles, add about 220,000 |
| Database | about 100 to 160 MB | about 600 bytes a row today |

### 6.3 The seed

- **Per-row queries are the enemy.** The base pattern is `findFirst` then `create`, roughly 12 queries per person (Person, Profile, Listing, three Verifications, Context, Resume). At 2,000 people that is 24,000 queries; with 285 firms at about 45 each, 13,000; with jobs and ties, about 50,000. At 46 ms a query that is 40 minutes on production, and the 350-query step limit would need 140 or more steps. Locally, at about 1 ms, it is one to three minutes.
- **Batched** (read what exists once per table, `createMany` 500 at a time, deterministic ids so nothing is read back): about 40 tables x 2 to 6 batches = 150 to 400 queries for the whole world, in 8 to 12 steps, each far under 350 and safe to repeat on every deploy.
- `createCompany` for about 285 firms is the one place a per-firm loop is acceptable (about 4,500 queries in all): cut it into shares of 25 firms with `shareOf` (`seed-steps.ts:64`) so no step passes 350.
- **Template copy**: 0.19 s at 25 MB; the file copy scales with size, so roughly 1 to 2 seconds at 150 MB. A separate scale template costs one such copy per simulation run. Putting the scale world into the base template would add it to each of 199 test files, and 150 MB of disk to each copy.

### 6.4 The simulation's loops that would not survive 20 times the people

Sized from the last full report (`reports/simulation-20261020162034.md`): 7,038 calls in 401 s with 100 placements asked and 80 awarded, about 57 ms a call at concurrency 20, about 88 calls per awarded job. A run sized to the new world (say 1,000 placements) is therefore about 90,000 calls and about 85 minutes, if nothing below goes superlinear.

| # | Where | The loop | At scale |
|---|---|---|---|
| 1 | `stages/demand/send-to-suppliers.ts:90-105` | sends **every job to every supplier on the client's list** (`GET /api/suppliers`, minus blocked and probation) | jobs x panel invitations; `distribute` writes one `RequirementInvitation` and one notice per supplier. 1,000 jobs x 12 = 12,000 (fine). With 40 suppliers on a list, 40,000, and `match` below multiplies it again. **Panel size is the knob; hold it at 6 to 12** |
| 2 | `stages/supply/match.ts:~190` | for each job, `sent.filter(x => x.requirementId === job.id)` over **all** invitations | O(jobs x invitations): 1,000 x 12,000 = 12 million (fine); 40,000 invitations make it 40 million |
| 3 | `stages/supply/match.ts`, the plan | one matching run **per job per invited supplier**, two calls each | 1,072 calls and 20 s for 534 runs today; 12,000 runs = about 24,000 calls and about 8 minutes. Each run builds a pool of up to 400 listings with joins, then up to 15 `match.upsert` writes in a loop (`match-engine.ts:250-277`) |
| 4 | `stages/supply/match.ts:~125` | `names` of every benched person (`take: 2000`), then `names.find(n => words.includes(n))` for **every suggestion row** | silently truncates at 2,000, so the leak check misses people beyond it; cost is rows x 2,000 string searches |
| 5 | `src/lib/match-pool.ts:606` | `take: 400`, no `orderBy` | a client with 12 suppliers of 100 marketed people each sees an arbitrary 400 of 1,200, and it changes between runs. Add an `orderBy`, or size benches so a pool stays under 400 |
| 6 | `src/lib/match-pool.ts:723` (`employeesFree`) | every EMPLOYEE Context of the selling firm, then two more reads over all those ids | fine for a GSI with 40 staff; do not give one 400 |
| 7 | `stages/money/bills.ts:277-307` | for each invoice line, `ctx.world.weeks.find(x => x.id === l.timesheetId)` | O(lines x weeks): 1,000 placements x 12 weeks = 12,000 each, 144 million compares; at 52 weeks, 2.7 billion |
| 8 | `stages/money/bills.ts:119, 277, 300`; `pay.ts:60` | `where: { timesheetId: { in: ctx.world.weeks.map(w => w.id) } }` | 12,000 ids works; **above 32,767 Prisma refuses the query** (52 weeks x 700 placements). Chunk it |
| 9 | `stages/money/bills.ts:249` | `ctx.world.bills.some(x => x.id === b.id)` inside the loop over bills | O(bills squared): 12,000 bills = 144 million |
| 10 | `stages/money/contracts.ts:84, 102` | `ctx.world.contracts.some(c => c.id === fact.id)` per contract | O(contracts squared): 2,400 = 5.8 million (fine); 10,000 = 100 million |
| 11 | `stages/money/payroll.ts:52`, `expenses.ts:75`, `invoice-receipts.ts:96` | `ctx.world.weeks.filter(x => x.contractId === p.id)` per placement | O(placements x weeks) |
| 12 | `stages/regulatory/paperwork-and-start.ts:119, 173` | `ctx.cast.seats.some(x => x.email === ...)` per placement; `awards.filter(...)` | O(placements x seats), seats about 3,500 |
| 13 | `stages/conversation/handoffs.ts:205-212, 374-397` | `ctx.cast.seats.some(...)` and `.find(...)` inside `.map` over every ledgered call; then **one greeting read per touched seat** (260 seats cost 41 s, greeting p95 1.4 s) | O(calls x seats). With about 3,500 seats and most touched, about 10 minutes of reads plus an O(n squared) seat scan. Read a sample, or key a `Map` once |
| 14 | `scripts/simulate/actors.ts` `readCatalog` | the workers query joins every Person with four correlated `exists` subqueries and `order by name`, run again after **every** station by `cast.refresh()` | 20 scans of 2,600 Persons x 4 lookups. Fine in Postgres; the JavaScript side then builds `byEmail` and `seats.some` over about 3,500 rows each time |
| 15 | `stages/demand/common.ts:27-29`, `stages/money/sign-weeks.ts:116-117`, `stages/money/book.ts:285` | `cast.seats.filter/find` per call | linear scans of the catalog on every week |
| 16 | `stages/supply/bench-and-consent.ts` `perFirm = max(3, ceil(placements x 1.5 / firms))` | each firm adds that many people through `POST /api/consultants`, each answered by a worker | 1,500 people x about 4 calls = 6,000 calls (fine), but it adds to the generated 2,000 |

Base-seed loops that would also run over the generated people **on a later deploy** (hazard 1 below):

| Where | The loop |
|---|---|
| `seed-standing.ts:440-480` | `findMany` every I-9 of every reserved-address person, then `findFirst` + `create` evidence + `create` backing **per form** |
| `seed-standing.ts:582-586` | the first 8 H-1B profiles, `orderBy id` |
| `seed-pipeline.ts:71-120` | every reserved-address `ConsultantProfile`: two reads then a `createMany` of résumés; the profile `findMany` is unbounded |
| `seed-world.ts:2180-2202` | `own-seats`: every person with no Context and a contract, submission or listing at a roster firm, then one `context.create` each |

---------------------------------------------------------------------------------------------------

## 7. Hazards the builders must know before they start

1. **Reserved-suffix sweeps catch generated people.** `seed-standing.ts:93-95` (`seededPerson`), `seed-pipeline.ts:72`, `seed-cleanup.ts:192` and `seed-rebuild.ts:569, 588` select every person whose address ends `.invalid`, `.example` or `.local`. Generated people must have such an address, or they cannot be seated, so they are swept in on any re-walk of a base step. Worse, the H-1B step takes `take: 8, orderBy id`: hash-based ids sort at random and could displace the seeded H-1B people from the demo's H-1B story. Fix before building: one exported predicate in `types.ts` (`SCALE_EMAIL_SUFFIX = '.scale.invalid'`) and a one-line exclusion in each of those base reads (the architect owns all of them), and generated ids that sort after the base world's.
2. **The catalog lists `world-%` firms, and `WORLD_SLUGS` is a different list.** Anything that needs generated firms to be on the roster (the rebuild delete list, `sandbox-expiry`, `seed-cleanup`, the claim sweep, own-seats, the roster-scoped steps) will not see them. That is intended: the generator writes `claimedAt`, the own seats and the calendar itself. Do not append generated slugs to `WORLD_SLUGS`; the roster steps are sized for 28 firms (postings in 16 shares, books in 4).
3. **Rebuild.** `seed-rebuild` deletes the roster only. A generated world should live in its own sealed template database and be dropped by dropping the database. If it ever lives in production, it needs its own rebuild (delete about 285 companies and everything beneath them) with the same "refuse if anything real is tied" check.
4. **Layers a roster firm gets that a generated firm does not:** standing (locations, legal entities, remit-to, document types), order-to-cash (the order, project order, ledger, postings), document requirements, payroll runs. The simulation's `award` stage writes the order header itself (`src/app/api/submissions/order-header.ts`), so new work does not need seeded orders; only the generated *live* lines do. Decide in `index.ts` whether those get an order (money, with its existing functions) or none.
5. **Tenure.** Careers that put a person 17 to 24 months at one client make the award refuse them ("reached the 24-month time limit" appears in the last report). That is realistic and useful; cap it to a minority (suggest under 5% near a cap) or the matching pool starves.
6. **Time.** The simulation has no clock override; "today" is the real day, and the base world counts from its birthday. If the scale template is built on a different day than the base template it copies, dates drift. Build both in the same call, keyed by the same UTC day.
7. **Plain words.** American spelling (`american-english.test.ts` scans `src/`). Firm and person names are invented (`public-example-names.test.ts`, `demo-names.test.ts` read named seed files, so the new files are added to those lists). The MSP is an MSP and the person is the role, in every string a person reads.
8. **Prisma limits.** 32,767 bind variables per query (batch size, and `IN` lists in stations). `createMany` returns no ids (use deterministic ids, or `createManyAndReturn`).
9. **Prime, sub-vendor and bench are positions, not a column.** `Company.kind` is `VENDOR` for all three. The only column is `supplierPosture` (PRIME, BENCH), which no seed has ever set, so every screen that reads it has only ever met null on the seeded world. Prime against sub-vendor is the Counterparty `PRIME` relationship between two suppliers. Write posture explicitly.

---------------------------------------------------------------------------------------------------

## 8. Decisions for the architect before dispatch

1. Separate sealed template (recommended) or inside the base world. Recommendation: separate, because of 199 test copies and the count assertions.
2. Panel size per client and the tier mix (hold at 6 to 12; an MSP runs 5 of the 10 clients).
3. Whether ended career lines carry cycles (recommended no: about 220,000 rows for no station).
4. Whether the generated live placements (about 400) get orders and books (recommended: the order only, through money's existing function; no ledger).
5. `SCALE_EMAIL_SUFFIX` and the four one-line exclusions in the base seeds (hazard 1).
6. Exports: `rng`, `hash`, `pick`, `weighted` and the role material from `demo-volume.ts`; `worldAnchor` from `seed-world.ts`.
7. An optional `createdAt` on `CreateCompanyInput`.
8. One matrix row, and the domain entries (`lib/seed-scale` PLATFORM; `lib/seed-scale/people` SUPPLY; `/papers` REGULATORY; `/jobs` DEMAND; `/rates` MONEY), in the same commit as the first file.
9. Whether a test file for the generator is allowed under the founder's 2026-10-20 decision.

---------------------------------------------------------------------------------------------------

## 9. What the scout did not verify

- The wall-clock time of the base seed was not re-run; "about a minute" is from code comments, and the 46 ms production query time is from `seed-steps.ts`, not measured here.
- Row counts for the base world come from a scratch copy of the sealed template `etyme_tpl_world_20261020_f92313cffb26`, which may be one build behind the tree; the scratch database was dropped. The generated-world numbers are arithmetic, not measurements.
- Routes were read, not run. That `distribute` writes one notice per supplier, and the cost per matching run, are inferred from the last simulation report's call counts and timings.
- Not read in full: `seed-order-to-cash.ts`, `seed-internal-moves.ts`, `seed-payroll-runs.ts`, and the stations `award.ts`, `interview.ts`, `sign-weeks.ts`, `file-weeks.ts`, `three-way-check.ts`. If live placements are to get an order, money reads the first before choosing.
