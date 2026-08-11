# LEGACY_RULES.md

Business rules encoded across 4,197 commits of the 2017 Rails codebase,
extracted in plain English with source file references.

**Purpose:** Every rule here was earned over years of production use. Port
the arithmetic, not the architecture. When a new implementation diverges
from a rule documented here, it must say why — silently dropping a rule
is the most expensive kind of bug.

---

## Table of Contents

1. [Cycle Engine](#1-cycle-engine)
2. [Contract & Rate Engine](#2-contract--rate-engine)
3. [Submission & Candidate Pipeline](#3-submission--candidate-pipeline)
4. [Invoicing & Financial Engine](#4-invoicing--financial-engine)
5. [Company & Organization](#5-company--organization)
6. [Documents & Compliance](#6-documents--compliance)
7. [Conversations & Notifications](#7-conversations--notifications)
8. [Candidate Compliance](#8-candidate-compliance)
9. [Commission & Billing](#9-commission--billing)
10. [Miscellaneous](#10-miscellaneous)
11. [Database Constraints](#11-database-constraints)
12. [Routing & API Surface](#12-routing--api-surface)
13. [Background Jobs & Workers](#13-background-jobs--workers)
14. [Seed Data & Constants](#14-seed-data--constants)

---

## 1. Cycle Engine

The cycle engine is the scheduling backbone. It generates recurring calendar
events ("contract cycles") for every financial and operational obligation
on a contract: timesheet submission, approval, salary calculation,
processing, clearing, invoicing, commission, vendor bills, client bills,
and client expenses. Each contract has two sides — a buy contract
(vendor/consultant) and a sell contract (client) — with cycles generated
independently for each.

### 1.1 Cycle Types (19 Total)

Every cycle row is one of exactly 19 types, hardcoded and validated on
every save. (`contract_cycle.rb:33-37`)

**Buy-side (vendor/consultant):**

| # | Type | Purpose |
|---|------|---------|
| 1 | TimesheetSubmit | Consultant submits hours |
| 2 | TimesheetApprove | Submitted timesheet reviewed |
| 3 | SalaryCalculation | Compute what is owed |
| 4 | SalaryProcess | Payment initiated |
| 5 | SalaryClear | Payment settled |
| 6 | CommissionCalculation | Compute commission |
| 7 | CommissionProcess | Commission payment initiated |
| 8 | CommissionClear | Commission payment settled |
| 9 | VendorBillCalculation | Compute sub-vendor bill (C2C) |
| 10 | VendorPaymentProcess | Vendor payment initiated |
| 11 | VendorBillClear | Vendor payment settled |

**Sell-side (client-facing):**

| # | Type | Purpose |
|---|------|---------|
| 12 | ClientBillCalculation | Compute bill to client |
| 13 | ClientPaymentProcess | Client payment initiated |
| 14 | ClientBillClear | Client payment settled |
| 15 | InvoiceGenerate | Generate client invoice |
| 16 | ClientExpenseCalculation | Compute reimbursable expenses |
| 17 | ClientExpenseApprove | Client expense approved |
| 18 | ClientExpenseInvoice | Client expense invoiced |
| 19 | ClientExpenseSubmission | Client expense submitted |

### 1.2 Cycle Frequencies

Five frequencies, used by both the contract-level `time_sheet_frequency`
and cycle-level `cycle_frequency`. (`contract_cycle.rb:39`, `contract.rb:57`)

| Frequency | Enum | Grouping |
|-----------|------|----------|
| Daily | 0 | Every calendar day is its own period |
| Weekly | 1 | Days grouped by configurable day-of-week boundary |
| Biweekly | 2 | 14-day cycle using day-of-week boundary |
| Monthly | 3 | Days grouped by configurable day-of-month |
| Twice a month | 4 | Two configurable day-of-month boundaries |

Source: `concerns/cycle/utils/date_utils.rb:12-74`

Each cycle type on each side can have its own independent frequency —
timesheets might be weekly while invoices are monthly.

### 1.3 Cycle Generation Rules

**When created:** Cycles generate when a contract transitions to
`in_progress`. Runs inside a database transaction.
(`contract.rb:366-386`)

**Idempotency guard:** Before creating any cycle type, the system checks
whether cycles of that type already exist. If they do, skip. Prevents
duplicates on re-runs. (`contract.rb:369-384`)

**Extension:** When a contract is extended, `extend_cycles` generates new
cycle rows from the old end date to the new end date, starting from where
the previous cycles stopped. (`contract.rb:344-364`,
`cycle_maker.rb:229-250`)

**Regeneration on config change:** `PayrollCycleGeneratorService` destroys
all existing payroll cycles and regenerates from scratch when payroll
settings are modified. This is destructive.
(`payroll_cycle_generator_service.rb:12-14`)

**Buy-side creation order** (`cycle_maker.rb:8-105`):
1. Timesheet submission cycles — also creates `Timesheet` records and
   `Transaction` records (one per day in the period)
2. Timesheet approval cycles
3. Salary calculation cycles — also creates `Salary` records
4. Salary process cycles
5. Salary clear cycles

**Sell-side creation order** (`cycle_maker.rb:109-225`):
1. Timesheet submission cycles (unless buy-side timesheets already exist)
2. Timesheet approval cycles
3. Invoice generation cycles — also creates `Invoice` records
4. Client expense submission cycles (only if `is_client_expense == true`)
5. Client expense approval cycles (same condition)
6. Client expense invoice cycles (same condition)

### 1.4 Cycle Configuration Per Contract Side

Each buy_contract and sell_contract stores its own scheduling parameters.
Pattern per cycle type: (`buy_contract.rb:15-118`,
`sell_contract.rb:7-76`)

- `{prefix}_date_1` — first day-of-month anchor (monthly / twice-a-month)
- `{prefix}_date_2` — second day-of-month anchor (twice-a-month only)
- `{prefix}_day_of_week` — day-of-week anchor (weekly / biweekly)
- `{prefix}_end_of_month` — boolean; use last day of month instead of fixed
- `{prefix}_day_time` — time of day for the action

Prefixes: `ts` (timesheet submit), `ta` (approve), `invoice`, `sc`
(salary calc), `sp` (salary process), `sclr` (salary clear), `com_cal`
(commission calc), `com_pro` (commission process), `vb` (vendor bill),
`cb` (client bill), `cp` (client payment), `ce` (client expense),
`ce_ap` (expense approval), `ce_in` (expense invoice).

### 1.5 Business-Day Shifting

When a cycle's post date falls on a weekend or company holiday, it shifts.
Direction is configurable per frequency via `weekend_sch_{frequency}`
booleans on `PayrollInfo`. (`payroll_cycle_generator_service.rb:118-134`)

**Rules:**
- If `weekend_sch` is true (shift backward):
  - Sunday → Friday (−2 days)
  - Saturday → Friday (−1 day)
  - Holiday → previous day (−1 day)
- If `weekend_sch` is false (shift forward):
  - Sunday → Monday (+1 day)
  - Saturday → Monday (+2 days)
  - Holiday → next day (+1 day)

**Iteration:** Applied in a `while` loop — if shifting lands on another
weekend or holiday, it shifts again.

**Holiday lookup:** `company.holidays.where("Date(date) = '#{date}'")` —
per-company calendar, no global calendar.

### 1.6 Twice-a-Month and Monthly Date Arithmetic

These are the most complex date computations in the system.

**Twice-a-month approval date** (`timesheet.rb:298-324`):
- If current day ≤ date_1 → use date_1 in current month
- If current day > date_1 and ≤ date_2 → use date_2 in current month
- If current day > date_2 and not end-of-month → use date_1 in next month
- If end-of-month flag set → use last day of current month

**February edge cases:** The code explicitly checks
`Time.days_in_month(2, Date.today.year)` when term_no is 29 or 30.
Handles "End of month" as a special value. (`contracts/cycle.rb:536-561`)

### 1.7 Timesheet Rules

**Statuses:** `open` → `submitted` → `approved` | `rejected` |
`partially_approved` → `invoiced` → `salaried` (`timesheet.rb:37`)

**Required fields:** `start_date` and `end_date`. (`timesheet.rb:68-69`)

**Submission guard:** A timesheet cannot be submitted before its end date
passes. (`candidate_timesheet_service.rb:81`)

**Sequential enforcement:** Timesheets must be submitted in order. If a
gap exists, the system rejects with "You need to send timesheet of date X
first." (`candidate_timesheet_service.rb:94-103`)

**Cost calculation on approval:** (`timesheet.rb:109-114`)
- `total_time` = sum of all transaction hours
- `rate` = looked up from `change_rates` for the date range
- `amount` = rate × total_time

**Buy-to-sell duplication on approval:** When a buy-side timesheet is
approved and a sell_contract exists, the system duplicates the timesheet
and its transactions to the sell side. The duplicate is created with
status `submitted` and assigned to the contract's admin user.
(`timesheet_approval_service.rb:33-54`)

**Salary history on approval:** A `ContractSalaryHistory` record is
created: amount = total_time × buy_contract.payrate.
(`timesheet.rb:181-194`)

### 1.8 Timesheet Approval

**Who can approve:** `is_master_user?` (job creator) or
`is_assign_user?` (has submission permission).
(`timesheet_approver.rb:33-39`)

**Duplicate check:** Prevents same user approving twice.
(`timesheet.rb:101-103`)

**Notification chain** (`timesheet_approver.rb:45-53`):
- Assignee submits → responder notified
- Responder approves/rejects → assignee notified
- Responder submits (multi-level) → creator notified
- Creator approves/rejects → responder notified

### 1.9 Timesheet Logs

Each log = one day's entry within a timesheet period.
(`timesheet_log.rb:9`)

- Created for start_date, then delayed jobs create subsequent daily logs
  until end_date or contract end.
- Each log links to a `contract_term` for the applicable rate.
- When approved, all pending transactions auto-approve.
- Time stored in seconds, divided by 3600 for hours.

### 1.10 Holiday Calendar

- Per-company, stored in `holidays` table: date, name, company_id.
- No global calendar — each company maintains its own.
- Default for new companies: `weekend_sch_monthly: false` (shift forward).
  (`company.rb:395`)

---

## 2. Contract & Rate Engine

### 2.1 Contract Types (Sell vs Buy)

A single `Contract` record is the master container. It is polymorphic
(`contractable_type/id` — points to Company or Candidate) and always
belongs to a `company_id`. Each contract spawns two child records:

- **SellContract** — client-facing / revenue side. Holds `customer_rate`
  (bill rate), customer company, and all sell-side cycle config.
  (`sell_contract.rb:77-158`)
- **BuyContract** — consultant-facing / cost side. Holds `payrate`,
  `contract_type` enum (W2, 1099, C2C), candidate, and all buy-side
  cycle config. (`buy_contract.rb:121-275`)

**Contract type enum** (`contract.rb:59`):
W2, 1099, C2C, contract_independent, contract_w2, contract_C2H_independent,
contract_C2H_w2, third_party_crop_to_crop, third_party_C2H_crop_to_crop

**Parent-child contracts:** A contract can have a `parent_contract_id`.
Child inherits start/end dates from parent, and parent auto-sets to
`accepted`. (`contract.rb:267-271`)

**Contract numbering:** Sequential with prefix `c_` (e.g., `c_001`).
Sell contracts get `SC_`, buy contracts get `BC_`.
(`contract.rb:166-173`)

### 2.2 Contract States and Transitions

**Status enum** (`contract.rb:55`):
`pending`(0) → `accepted`(1) → `rejected`(2) → `is_ended`(3) →
`cancelled`(4) → `paused`(5) → `in_progress`(6) → `draft`(7)

**Key transitions:**
1. `pending → accepted` — default initial. Auto-transitions if assignee
   already set.
2. `accepted → in_progress` — daily job finds accepted contracts past
   start_date. (`contract.rb:335-336`)
3. `in_progress → is_ended` — daily job finds contracts with end_date
   = today. (`contract.rb:330-332`)
4. Parent auto-accepts when child is created.
5. Draft → in_progress triggers first timesheet creation and
   `next_invoice_date` setting.

**Validations:**
- `end_date` must be present and ≥ `start_date`.
- `next_invoice_date` must be in the future.
- Unique on `(job_id, job_application_id)` — one contract per application.
  (`contract.rb:123-134`)

### 2.3 Rate Structure (Pay, Bill, Margin)

**Three-tier model:**
1. **Customer Rate (Bill Rate)** — `SellContract.customer_rate` (decimal).
   Rate billed to client.
2. **Pay Rate** — `BuyContract.payrate` (decimal). Rate paid to
   consultant/vendor.
3. **USCIS Rate** — `BuyContract.uscis_rate` (integer). Prevailing wage
   tracked separately.

**Margin is implicit:** `customer_rate − payrate`. No explicit column;
computed at read time.

**Rate lookup by date:** Both sides implement `rate_on(date)` querying
`change_rates` where the date falls between `from_date` and `to_date`.
Falls back to earliest rate if no match.
(`sell_contract.rb:154-157`, `buy_contract.rb:224-227`)

### 2.4 Rate Change History

**ChangeRate** — polymorphic, date-ranged rate versioning:
- Fields: `rate`, `rate_type` (hourly/daily/weekly/monthly), `from_date`,
  `to_date`, `working_hrs`, `overtime_rate`, `uscis`
- **Overlap validation:** No existing ChangeRate for the same rateable
  may have overlapping date ranges. (`change_rate.rb:20-38`)

**ContractCustomerRateHistory** — auto-created whenever
`SellContract.customer_rate` changes (on create and update).
(`sell_contract.rb:107-112`)

### 2.5 Salary Calculation

**Status lifecycle** (`salary.rb:36`):
`pending` → `open` → `calculated` → `commission_calculated` →
`processed` → `aggregated` → `cleared`

**Key fields:** `approved_amount`, `pending_amount` (carried forward),
`salary_advance` (deducted), `contract_expenses`, `commission_amount`,
`total_amount` (net), `billing_amount` (paid), `balance` (remainder),
`rate`.

**Pipeline** (`salary_calculation_service.rb`):
1. `process_salary_cycles` — collect approved timesheets/expenses,
   attach as salary items, compute total.
2. `calculate` — admin confirms: total = approved + pending − advance.
   Status → `calculated`.
3. `process` — adjust for commission: balance = (total + commission) −
   calculated. Carry forward. Status → `processed`.
4. `clear` — deduct expenses, commission, company expenses. Status →
   `cleared`.
5. `add_payment` — record payment. Validates: payment + billing ≤ total.
   No overpayment allowed.

### 2.6 Commission Rules

**Three layers:**
1. **Contract-level:** `is_commission` (boolean), `commission_type`
   (perhour or fixed), `commission_amount`, `max_commission`.
2. **ContractSaleCommision** (on BuyContract): named rules with `rate`
   (percentage), `frequency`, `limit` (cap). Each has many CscAccounts.
3. **CscAccount:** per-person sub-accounts accumulating `total_amount`.

**Calculation** (`salary_calculation_service.rb:178-191`):
- Per-hour: `commission = (approved_amount × rate) / 100`
- Fixed: `commission = limit` (flat per period)
- Creates `CommissionQueue` with status `pending`.
- Clearing cycles set 3 days after processing cycles.

### 2.7 Document Signing Flow

`ContractDocumentSigningService` manages five DocuSign flows:
1. Buy-side employee signing (to candidate)
2. Buy-side vendor signing (to vendor owner)
3. Buy-side document request (uploads, not e-sign)
4. Sell-side signing (to team admin)
5. Sell-side document request (uploads)

**Token validation:** DocuSign tokens expire after 2 hours. System checks
`(Time.current − plugin.updated_at) / 3600 ≤ 2` and refreshes via
`RefreshToken` if needed.

---

## 3. Submission & Candidate Pipeline

### 3.1 Candidate vs Consultant vs User

Three identity models:

- **Candidate** — standalone Devise model, separate table. Self-registers,
  owns profile/resumes/skills. Carries visa status (Us_citizen, GC, OPT,
  H1B, etc.), work type (onsite/remote/hybrid), max 8 skills.
  (`candidate.rb:89-135`)
- **Consultant** — inherits from `User` (STI). Belongs to a company,
  optionally links to a Candidate. Has `max_working_hours` (0-86400s),
  hourly rate computed: salaried = salary/(hours×20), hourly = salary
  directly. (`consultant.rb:66-139`)
- **User** — base model for company employees (admins, recruiters).

**Critical merge rule:** When a candidate signs up (status: `signup`),
pre-existing "company candidate" records with the same email are merged —
their `CandidatesCompany` associations transfer to the new record, old
records deleted. (`candidate.rb:435-444`)

**Freelancer default:** Candidates with no company_id are auto-assigned to
a special vendor with `domain: 'freelancer.com'`.
(`candidate.rb:372-375`)

### 3.2 Bench Status (Hot/Normal)

Per-company status on `CandidatesCompany`: `normal`(0) or
`hot_candidate`(1).

- **Making hot:** Updates status, auto-creates bench `JobInvitation` with
  1-year expiry and $20-$30/hr default rate band.
  (`candidate_management_service.rb:70-87`)
- **Making normal:** Updates status, destroys all `JobInvitations`,
  reassigns to freelancer company.
  (`candidate_management_service.rb:89-100`)

### 3.3 Job Requirements and Invitations

**Job statuses:** Draft, Bench, Published, Archived, Cancelled (string,
not enum).

**Auto-archiving:** Background sweep archives Published jobs with no
application or job update activity for 7 days. (`job.rb:179-185`)

**Sub-jobs:** When a vendor receives a client's job, the system creates a
sub-job under the vendor's company with `parent_job_id`. Sub-jobs are
private, inherit title (prefixed "Sub Job"), description, category, dates.
Find-or-create is idempotent. (`job.rb:146-158`)

**Job Invitations:** Status (pending/accepted/rejected), type
(vendor/candidate/by_email), purpose (job/bench).
- Rate band: `min_hourly_rate` and `max_hourly_rate` required, non-negative.
- Email-based: looks up Candidate by email; if not found, creates one via
  `invite!`.

**Bench exclusivity rule:** When a bench invitation is accepted, ALL other
pending bench invitations for that candidate (sent and received) are
automatically rejected. A candidate can only be on one company's bench.
(`job_invitation.rb:88-99`)

### 3.4 Application Workflow States

**Statuses** (`job_application.rb:37`):
applied(0) → short_listed(1) → prescreen(2) → rate_confirmation(3) →
client_submission(4) → interviewing(5) → hired(6) → rejected(7) →
pending_review(8)

**Rate negotiation** — two-sided acceptance:
- `accept_rate` (candidate/vendor side)
- `accept_rate_by_company` (client side)
- Rate confirmed only when BOTH are true.
- When either side negotiates, BOTH flags reset to false.
- **Candidate lock-in:** Once accepted, candidates cannot counter-offer.
  (`candidate_application_service.rb:8-33`)

**Client submission paths:**
1. If job has `parent_job_id` → duplicate application to parent job
2. If job has `source` email → email the application
3. Otherwise → fail ("No valid client email found")

**Uniqueness:** One application per person per job, unless
`allow_multiple_applications_for_candidate` is true.
(`job_application.rb:65`)

### 3.5 Interview Flow

Three acceptance flags: `accept` (candidate), `accepted_by_recruiter`,
`accepted_by_company`.

**Acceptance logic** (`interview.rb:17-27`):
- Direct application (no intermediary): accepted when candidate AND company
  both true (two-party).
- With recruiter: ALL THREE must be true (three-party).

Each party can accept once (idempotent guard). When all accepted,
application status → `interviewing`.

### 3.6 Candidate-Job Matching

Bidirectional, async via Sidekiq:
- **Scoring:** 60% skill overlap + 20% department match + 20% industry
  match. Max 100%.
- Bench jobs match within company only. Published jobs match all
  candidates.
- Triggered on creation and when skills/industry/department change.
  (`candidate.rb:389-413`, `job.rb:191-211`)

### 3.7 Blacklist

`BlackLister` — polymorphic, per-company. Status: `banned`(0) or
`unbanned`(1). Data record only — no enforcement in models.
(`black_lister.rb`)

### 3.8 Resume Management

- First resume triggers Sovren parser → populates profile.
- First upload auto-marked primary.
- Deleting primary promotes next resume.
- `make_primary_resume` ensures exactly one primary.
  (`candidate_profile_service.rb:42-82`)

---

## 4. Invoicing & Financial Engine

### 4.1 Invoice States and Workflow

**States** (`invoice.rb:33`):
`pending_invoice` → `open` → `submitted` → `paid` / `partially_paid` /
`cancelled`

**Two types:** `timesheet_invoice` and `client_expense_invoice`.

**Workflow** (`invoice_workflow_service.rb`):
1. `client_submit_invoice(timesheet_ids)` — creates in `open` status
2. `accept_invoice` — guards on total_approve_time > 0 AND rate > 0.
   Calculates total_amount = time × rate.
3. `submit_invoice` — marks cycle completed
4. `pay_invoice` — records payment
5. `reject_invoice` — only contract assignee may cancel

**Guard rule:** Invoice cannot be accepted if time ≤ 0 or rate ≤ 0.
Never silently proceeds.

### 4.2 Invoice Numbering

Format: `IN_{contract_number}_{sequential_three_digit_padded}`
(e.g., `IN_1042_001`). First invoice is always `_001`.
(`invoice.rb:87-94`)

**Not gap-safe** — no uniqueness constraint in DB. Concurrent creation
could theoretically duplicate.

### 4.3 Invoice Calculation

- `total_amount` = (total_time_in_seconds / 3600) × contract rate
- **Fixed commission:** one-time amount, applied only on first invoice
- **Percentage commission:** total × 0.01 × rate, capped at max_commission
  (running sum check across all prior invoices)
- `billing_amount` = total − commission − consultant_amount

**Due date:** `cycle.start_date + payment_term` days.
(`invoice.rb:207-209`)

**Parent invoice propagation:** Child contract's invoice creates parent
contract invoice. Parent uses its own rate; consultant_amount = child's
total (the cost). Margin = parent total − child total.
(`invoice.rb:227-237`)

### 4.4 Expense Types and Approval

**Three bill types:** salary_advanced, company_expense, client_expense.

**ClientExpense lifecycle** (`client_expense.rb:25`):
pending_expense → not_submitted → submitted → approved → bill_generated →
rejected / invoice_generated → paid

Amount auto-calculated as `sum(unit_price × quantity)`.

### 4.5 Client vs Vendor Billing

Both use same 3-day clearing offset (hardcoded):
- `ClientBill` — 3 cycle references (calculation, payment, clearing)
- `VendorBill` — mirrors ClientBill exactly

### 4.6 Transaction Model

**Time transactions** (`transaction.rb`) — NOT financial. Time entries on
timesheets: start_time, end_time, total_time (seconds). Validates no
overlap, end not in future, max hours limit.

**EtymeTransaction** — financial journal. Amount stored negative for
outflows. Created during expense payments.

**Sequence ledger** — external blockchain double-entry system. Account
naming: `comp_{id}_treasury`, `cons_{id}`, `vendor_{id}`, etc.
Operations: `issue` (money enters), `transfer` (between accounts),
`retire` (money leaves). Token types: `tym` (invoices, cents) and
`usd` (expenses/salary).

### 4.7 Bank Balance Validation

`BankDetail` — per-company bank accounts.
- Bank enum: bank_of_america, texas_bank, wells_fargo.
- Balance must be > 0.
- **Before any payment:** `bd.balance >= payment_amount`. Insufficient →
  error, payment blocked. No overdraft.
- After payment: `bd.balance -= payment_amount`.
  (`expense_payment_service.rb:16,51`)

### 4.8 Payment Recording

`ReceivePayment` — individual receipts against invoices.
- `posted_as_discount` — allows recording as discount instead of payment.
- After create: sums all payments. If ≥ total → `paid`. Otherwise →
  `partially_paid`.

---

## 5. Company & Organization

### 5.1 Company Types

**Only two types:** `hiring_manager`(0) or `vendor`(1).
(`company.rb:62`)

A freelancer is identified by `name == 'freelancer'` and
`domain: 'freelancer.com'`, not by type.

### 5.2 Slug and Subdomain

Auto-generated from email domain. Collision → numeric suffix.
**Reserved:** etyme, admin, www, administrator, admins, owner, mail, ftp.
Pattern: `/\A[\w\-]+\Z/i`. Slug and website each unique.
(`company.rb:53, 171-174, 374-383`)

### 5.3 Domain Restrictions

**Excluded domains:** gmail, facebook, reddit, yahoo, rediff,
facebookmail, fb. Validated at company level and user email level.
(`company.rb:54`)

### 5.4 After-Create Lifecycle

When a company is created:
1. Owner's company_id set
2. Seven default roles created with permissions
3. Default monthly payroll config created
4. Password reset email sent to owner
(`company.rb:197-201, 394-406`)

### 5.5 User Roles and Permissions

**STI hierarchy:** User (base) → Admin → Consultant.
Candidate is separate table.

**Identity checks:**
- `is_superuser?` — true only for `admin@admin.com` (hardcoded)
- `is_owner?` — user === company.owner
- Users support ancestry (manager/report tree via `has_ancestry`)

**17 seeded permissions** (global singletons):
manage_jobs, manage_consultants, manage_contracts, manage_company,
manage_vendors, manage_company_docs, send_job_invitations,
manage_job_invitations, manage_job_applications, create_new_contracts,
edit_contracts_terms, show_contracts_details, show_invoices,
manage_timesheets, manage_leaves, reversal_transaction, manage_all

**Seven default roles per company:**
1. Recruiter — consultants, jobs, vendors, invitations, applications,
   contracts
2. Sales - client requirement — invoices
3. HR admin — recruiter permissions + leaves
4. Accountant — invoices
5. Sales - bench marketing — timesheets, invoices
6. Timesheet admin — timesheets, invoices
7. Manager — manage_all

### 5.6 Vendor-Client Relationships

**PreferVendor** — network requests between companies. Status:
pending/accepted/rejected. Notifications to owners on both sides.

**Network methods:**
- `prefer_vendor_companies` — all accepted relationships (both directions)
- `is_vendor?(company)` — checks if specific company is preferred vendor

**Company contacts bridge two companies** — `company_id` (who sees it) and
`user_company_id` (who the person belongs to).

### 5.7 Ownership Transfer

New owner's email domain must match company's domain. If user doesn't
exist, one is created as Admin. (`dashboard_service.rb:87-104`)

**First admin becomes owner** if no owner exists.
(`company_setup_service.rb:43-53`)

### 5.8 Domain Verification

Manual upload verification: check for file at
`{url}/verifyetyme.html`, match verification code against company record.
(`company_setup_service.rb:69-86`)

---

## 6. Documents & Compliance

### 6.1 Document Types (6 Doc-Set Models)

Six separate tables, one per stakeholder relationship:

| Model | Relationship |
|-------|-------------|
| CompanyCandidateDoc | Documents required from candidates |
| CompanyEmployeeDoc | Documents required from employees |
| CompanyVendorDoc | Documents required from vendors |
| CompanyCustomerDoc | Documents required from clients |
| CompanyLegalDoc | Company-wide legal documents |
| CompanyDoc | General company documents (tagged) |

Each is company-scoped. The `is_require` field determines fulfillment:
`'E-Signature'` triggers DocuSign; other values trigger file upload.
Expiration dates tracked but no automated enforcement.

### 6.2 Contract Documents (Buy/Sell)

| Model | Direction | Side |
|-------|-----------|------|
| BuyEmpReqDoc | Requested from employee | Buy |
| BuySendDocument | Sent to employee/vendor | Buy |
| BuyVenReqDoc | Requested from vendor | Buy |
| SellRequestDocument | Requested from client | Sell |
| SellSendDocument | Sent to client | Sell |

Each auto-generates a number from the contract number suffix.

### 6.3 DocumentSign

Central e-signature model. Five polymorphic axes: documentable (template),
signable (who signs), initiator, part_of (context), requested_by.

**Rules:**
- `is_signable?` true only when `documentable.is_require == 'E-Signature'`
- Notifications on create (to signer) and on completion (to requester)
- Conversation message posted in both cases
- DocuSign token must be < 2 hours old; refreshes if needed
- Failed envelope → DocumentSign destroyed (rolled back)

---

## 7. Conversations & Notifications

### 7.1 Conversation Model

Ten topic types: OneToOne, Rate, GroupChat, Job, JobApplication, Contract,
SellContract, BuyContract, DocumentRequest, PorposalChat.

**Rules:**
- Backed by `Group` records with `member_type: 'Chat'`
- One-to-one dedup by intersecting chat groups
- One-to-one → group promotion: adds member, changes topic to GroupChat
- Branch conversations (sub-chats) with parent tracking

### 7.2 Message Types

ConversationMessage types: job_conversation, rate_confirmation,
schedule_interview, DocumentRequest.

### 7.3 Legacy Chat (Pusher)

Older real-time system. Pusher events on `'message-' + id` channel.
Retry logic: 10-second timeout, 3 retries.

### 7.4 Notifications

Status: unread/read. Types: chat, application, invitation,
application_status, contract, document_request, job.

**Every notification triggers an email on create.** No batching or
throttling (except the 2-hour cron digest).

### 7.5 Reminders

Title required. On create, schedules delayed job at `remind_at` to fire
`send_reminder_email` (creates notification, not direct email).

---

## 8. Candidate Compliance

### 8.1 Background Checks

`CriminalCheck` — data record only (state, address, dates). No
integration or status tracking.

### 8.2 Visa Status

`Visa` — free-text status and type. No expiry alerting.

### 8.3 Banking and Tax

`BankDetail` — company-level bank accounts (not employee bank details).
Integrates with Sequence ledger for double-entry.

`TaxInfo` — belongs to PayrollInfo. Just `tax_term`.

### 8.4 Education and Certifications

Two parallel sets: Candidate-side (Education, Certificate) and User-side
(UserEducation, UserCertificate). Completion year must ≥ start year.

**Address** — polymorphic, geocoded. Stores lat/lng. From/to dates for
history.

---

## 9. Commission & Billing

### 9.1 Commission Queue

Tracks pending payouts. Status: pending → salaried. Links commission rule
to salary and buy_contract.

### 9.2 Commission Calculation

Four frequencies: daily, weekly, monthly, twice-a-month.

**Weekly:** `date_of_next` finds next occurrence of target day-of-week.
If within 5 days and not Sunday, pushes to following week.

**Clearing:** 3 days after each processing cycle (hardcoded, idempotent).

### 9.3 Subscriptions and Packages

`Package` — subscription tiers with unique name/slug. Known: `free`, paid.

`Plugin` — third-party credentials (docusign, zoom, skype). DocuSign
token checked before every e-signature operation.

---

## 10. Miscellaneous

### 10.1 Custom Fields

Polymorphic key-value pairs. Value required on create ONLY when field is
`required` AND customizable_type is `JobApplication`.
(`custom_field.rb`)

### 10.2 Reviews and Ratings

Multi-dimensional: three default categories (Communication, Timeliness,
Quality). Overall = average of categories, **rounded to nearest 0.5**
(half-star). Default 3 if no categories. Per-company ratings (same
candidate rated independently by different companies).
(`candidate_review_service.rb`)

### 10.3 Approvals

Per-user, per-contract, per-type. Eight approvable types: timesheet,
invoice, expense, timesheet_approve, salary_calculation, salary_process,
expense_invoice, expense_approve. (`approval.rb`)

### 10.4 Import/Export

Four import types via XLSX (Roo gem): Jobs (17 columns), Candidates
(no dedup), Companies (domain-based dedup), Contacts.

File upload to DigitalOcean Spaces (S3-compatible), random hex prefix.

### 10.5 Leaves

Status: pending → accepted → rejected.
- from_date and till_date required
- **Overlap prevention on create** — checks neither date falls within
  existing leave
- **Bug:** Does not check the inverse (existing leave entirely within new
  range passes validation)

---

## 11. Database Constraints

### 11.1 Unique Indexes (Database-Enforced)

| Table | Columns | Business Rule |
|-------|---------|---------------|
| admin_users | email | Unique admin email |
| users | email | Unique user email |
| chat_users | (chat_id, userable_id, userable_type) | One membership per chat |
| company_contacts | (company_id, email) | Unique contact per company |
| tags | name | Global unique tags |
| taggings | (tag_id, taggable_id, taggable_type, context, tagger_id, tagger_type) | No duplicate tagging |
| rating_rates | (author_type, author_id, resource_type, resource_id, scopeable_type, scopeable_id) | One rating per author per resource |

### 11.2 Model-Level Only (No DB Constraint)

| Model | Rule |
|-------|------|
| job_applications | Unique (applicationable_id, job_id, applicationable_type) unless allow_multiple |
| contracts | Unique (job_id, job_application_id) |
| contract_cycles | Unique cycle_type per cyclable |
| companies | Unique slug and website |
| shared_candidates | Unique (candidate_id, shared_to_id, shared_by_id) |
| groupables | Unique (group_id, groupable_type, groupable_id) |
| bank_details | Unique bank_name per company |
| permissions | Unique name |

### 11.3 Foreign Keys (Database-Level)

**Only two foreign keys in the entire schema:**
1. `company_customer_vendors.company_id` → `companies.id`
2. `expense_accounts.expense_id` → `expenses.id`

All other referential integrity is Rails-only — a significant gap.

---

## 12. Routing & API Surface

### 12.1 Portal Structure

| Portal | Path | Users |
|--------|------|-------|
| Company | `/company/` | Staffing company staff |
| Candidate | `/candidate/` | Consultants/candidates |
| Static/Public | `/static/` | Unauthenticated |
| Admin | `/admin/` | ActiveAdmin (admin_users) |
| API | `/api/` | AJAX/autocomplete |
| Feed | `/feed/` | RSS (job, product, service, training, bench, blog) |
| Sidekiq | `/sidekiq/` | Job monitoring (basic auth) |

### 12.2 Multi-Tenancy

- `NakedEtymeDomain` — bare domain or www/app subdomain → main listing
- `Subdomain` — any other subdomain → company portal
- `CustomOrSubDomain` — custom domain or subdomain → company feeds

Companies get `{slug}.etyme.com` and optionally a `custom_domain`.

---

## 13. Background Jobs & Workers

| Job | Queue | Trigger | Action |
|-----|-------|---------|--------|
| GenerateContractCyclesJob | default | Contract created/accepted | Creates all cycle records |
| ExtendContractCyclesJob | h_contracts | Contract extended | Generates additional cycles |
| ImportContactsJob | default | Bulk import | Delegates to Import::Contacts |
| SendJobInvitationsJob | default | Bulk invite | Delegates to SendJobInvitation |
| CandidateJobMatchWorker | Sidekiq | Job/candidate created | Bidirectional matching |

**Scheduled tasks** (cron via `whenever`):

| Schedule | Task |
|----------|------|
| Every 2 hours | Batched email digest of unread messages/notifications |
| Daily 11:59 PM | `Contract.end_contracts` — auto-end past contracts |
| Daily 11:59 PM | `Contract.start_contracts` — auto-start accepted contracts |
| Daily 11:59 PM | `Contract.invoiced_timesheets` — mark timesheets invoiced |
| Daily 12:01 AM | `Contract.create_next_timesheet` — auto-generate next period |
| Daily 12:01 AM | `Job.archived` — archive inactive jobs (7 days) |

---

## 14. Seed Data & Constants

### 14.1 Default Permissions (17)

manage_jobs, manage_consultants, manage_contracts, manage_company,
manage_vendors, manage_company_docs, send_job_invitations,
manage_job_invitations, manage_job_applications, create_new_contracts,
edit_contracts_terms, show_contracts_details, show_invoices,
manage_timesheets, manage_leaves, reversal_transaction, manage_all

### 14.2 Defaults

- Currency: USD
- Rating categories: Communication, Timeliness, Quality
- Seed company: CloudEPA (vendor, domain: cloudepa)
- Superuser: `admin@admin.com` (hardcoded)

### 14.3 Reserved

- Subdomains: etyme, admin, www, administrator, admins, owner, mail, ftp
- Email domains: gmail, facebook, reddit, yahoo, rediff, facebookmail, fb

### 14.4 Audit Trail

PaperTrail enabled on:
- `job_applications` — tracks `rate_per_hour` changes only
- `candidates` — tracks `address` changes only

---

## Known Bugs in 2017 Codebase

Documented so they are fixed in the new build, not ported.

1. **Leave overlap validation is incomplete** — checks if new leave's
   start/end falls within existing leave, but does NOT check if existing
   leave falls entirely within new leave's range. (`leave.rb`)

2. **Invoice numbering is not gap-safe** — no uniqueness constraint in DB;
   concurrent creation could produce duplicates. (`invoice.rb:87-94`)

3. **ContractExpense Sequence guard inverted** — issues ledger entry only
   when amount is nil or ≤ 0, which looks like a bug.
   (`contract_expense.rb:31`)

4. **Token amount inconsistency** — some Sequence operations multiply by
   100 (cents), some don't. Data integrity risk.

5. **Time overlap validation commented out** — `transaction.rb` has
   overlap checking code but most validators are commented out.

6. **Bank enum is hardcoded** — only three banks (BoA, Texas, Wells Fargo).
   No way to add banks without code change.

7. **Missing foreign keys** — only 2 of ~200 relationships have DB-level
   foreign keys. Referential integrity relies entirely on Rails callbacks.
