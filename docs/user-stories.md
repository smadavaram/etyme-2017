![](media/784fabb91a86275a6a743707bb6f4bd8d5efecf4.undefined){width="3.3333333333333335in" height="1.1458333333333333in"}

*User & System Stories*

Every module. Every actor. Every system behaviour.

*Companion to Master BRD v3.7 FINAL*

This document specifies what each user does and what the system does in response --- across every module in the Etyme platform. Each story follows the format: As a \[actor\], I want to \[action\] so that \[benefit\], followed by the system behaviour that makes it work. Stories are grouped by module in BRD section order.

Actors: Owner (company owner/admin), Recruiter (company staff with recruiting permissions), RMG (Resource Manager), PM (Project Manager), Candidate (consultant), Partner (affiliate recruiter/trainer/referrer), Accountant (finance role), Compliance Officer, Client Contact (enterprise buyer-side user), Super Admin (Etyme platform admin).

1\. COMPANY FORMATION & ONBOARDING (BRD §3)

> **CF-01** As a **Owner**, I want to register my staffing company with my company email so that I get a working platform identity and a subdomain site within 90 seconds.
>
> **⚙ SYSTEM:** Validates email domain against EXCLUDED_DOMAINS (gmail, yahoo, facebook, rediff). Extracts domain → generates slug with collision numbering (cloudepa, cloudepa2). Creates Company (vendor type), creates Admin user as owner with password-reset email. Creates default PayrollInfo (monthly). Auto-creates 7 default roles with permission bundles. Sets is_activated = false pending Super Admin review. Fires AI site generation (§18).
>
> **✓** Company exists at {slug}.etyme.com with AI-generated website live
>
> **✓** Owner received password-reset email
>
> **✓** Seven default roles exist with correct permissions
>
> **CF-02** As a **Owner**, I want to invite team members by email so that they can log in with role-based access without me configuring permissions from scratch.
>
> **⚙ SYSTEM:** Devise invitable: generates invitation token, sends email. Invited user auto-assigned to owner company. Owner selects from existing roles. Invitation tracking: invited_by_id, sent/accepted timestamps. If invitee email domain matches company domain and user already exists → links existing user. Unknown user at known domain → auto-created with random password + reset.
>
> **CF-03** As a **Owner**, I want to connect with another staffing company as a preferred vendor so that we can share candidates and submit to each other\'s jobs.
>
> **⚙ SYSTEM:** Creates PreferVendor record (status: pending). Notifies target company owner. On acceptance: status → accepted; both companies gain submission rights, candidate pool visibility, rate negotiation access. On rejection: status → rejected; notification to requester. Queries: send_or_received_network returns all accepted both directions.
>
> **CF-04** As a **Owner**, I want to blacklist a company or candidate so that they are excluded from all my jobs, contracts, and visibility.
>
> **⚙ SYSTEM:** Creates BlackLister record (polymorphic: company or candidate). get_blacklist_status returns banned/unbanned. Blacklisted entities filtered from job search, candidate search, network feeds, and contract creation. 3.1: appeals/review workflow --- blacklisted party can request review; owner resolves.
>
> **CF-05** As a **Super Admin**, I want to activate a newly registered company so that they go live with full platform access and their AI-generated site is publicly visible.
>
> **⚙ SYSTEM:** Sets is_activated = true. Company site at {slug}.etyme.com becomes publicly accessible. Owner notified. Company appears in platform directory and network feeds.

2\. ROLES & PERMISSIONS (BRD §4)

> **RP-01** As a **Owner**, I want to assign roles to my team members so that each person sees only what they need and can act only within their scope.
>
> **⚙ SYSTEM:** User.roles join through roles_users. Permission check: user.has_permission(name) via roles → permissions chain. Every controller action checks permissions before execution. Navigation items hidden for unauthorized roles. Company-wide query: all_admins_has_permission?(name) drives notification fan-outs.
>
> **RP-02** As a **Owner**, I want to create custom roles beyond the seven defaults so that I can match my company\'s actual org structure.
>
> **⚙ SYSTEM:** Creates Role with company_id scope. Owner selects from 13 available permissions. Custom role appears alongside defaults in assignment UI. Role deletion prevented if users assigned.
>
> **RP-03** As a **PM (new role)**, I want to see only the engagements and consultants assigned to my projects so that I can manage my delivery without seeing the entire company bench.
>
> **⚙ SYSTEM:** PM role permissions: raise_demand, view_supply_pool (filtered to own engagements), claim_consultant, approve_onboarding, approve_timesheets (scoped to own engagements). Engagement.project_manager_id filters all PM views. PM cannot see payroll, company financials, or other PMs\' engagements.
>
> **RP-04** As a **RMG (new role)**, I want to manage the supply pool across all projects and approve consultant transfers between PMs so that utilization is optimized company-wide, not siloed per project.
>
> **⚙ SYSTEM:** RMG permissions: manage_supply_pool, assign_consultants, approve_transfers, view_utilization, manage_bench. RMG sees ALL consultants and ALL engagements. Transfer workflow: PM claims consultant → RMG approves/rejects → current PM notified → Assignment transitions.

3\. CANDIDATE MANAGEMENT (BRD §5)

> **CD-01** As a **Candidate**, I want to complete my profile step by step so that I become visible to employers and the matching engine.
>
> **⚙ SYSTEM:** Seven flags track completion: is_personal_info_update, is_social_media, is_education_detail_update, is_skill_update, is_client_info_update, is_designate_update, is_documents_submit. Each flag set independently on save. When all seven true → is_profile_active = true → candidate appears in search, matching, and bench feeds. Progress bar renders from flag count.
>
> **CD-02** As a **Candidate**, I want to add my skills using a skill graph instead of free-text tags so that my niche expertise (BTE, RAR, PP-PI) is discoverable even when recruiters search for broader terms (FICO, SAP).
>
> **⚙ SYSTEM:** Skill graph: hierarchical (BTE → FICO → SAP). Candidate selects specific skills; parent skills auto-inherited for matching. No cap (replaces 2017 max_skill_size = 8). Embedding vectors generated per candidate from skill graph + profile text. Matching scores use vector similarity + graph distance.
>
> **CD-03** As a **Recruiter**, I want to own specific candidates and be accountable for their placement so that my performance is measured on MY candidates\' velocity and margin.
>
> **⚙ SYSTEM:** candidate.recruiter_id set during bench assignment or manual override. My Bench = hot_candidate where recruiter_id = current_user. Recruiter performance dashboard: owned candidates, bench-to-placement velocity, total margin, coaching completions. recruiter_id persists across bench/placed/rolloff cycle.
>
> **CD-04** As a **Candidate**, I want to see my verified work ledger --- assignments, hours, extensions, rate progression so that I have proof of experience that cannot be faked on a resume.
>
> **⚙ SYSTEM:** Verified Work Ledger (CL-01) assembles from: completed Assignments (client anonymized if MSA restricts), approved Timesheet totals, extension events, ChangeRate history, rehire/re-engagement detection, TrainingEnrollment completions, reference acknowledgments. Each fact badged as VERIFIED (platform-attested) vs SELF-REPORTED (candidate-authored). Public profile URL at {slug}.etyme.com/c/{candidate_slug}.
>
> **CD-05** As a **Recruiter**, I want to see a candidate\'s visa pipeline status --- not just their visa type so that I know WHEN they can start an onshore assignment, not just IF they have a visa.
>
> **⚙ SYSTEM:** VisaPetition model: candidate_id, visa_type, country, status (filed → RFE → approved → stamped → active → expiring → expired), petition_date, approval_date, expiry_date, attorney, transfer_eligible. Demand-supply grid filters by visa-readiness: approved-but-unstamped = not available for onshore THIS QUARTER. Alerts at T-90/60/30 before expiry.
>
> **CD-06** As a **Candidate**, I want to control which vendors can list me on their marketing bench so that I appear in multiple vendors\' hotlists without losing control of my information.
>
> **⚙ SYSTEM:** Multi-tier bench (CL-02): Candidate grants listing rights per vendor. Each listing vendor sees only authorized data (skills, rate floor, availability). Candidate sets rate floor; each vendor marks up independently. Candidate can revoke listing rights at any time → removed from that vendor\'s bench_feed next sync.

4\. BENCH MODULE (BRD §6)

> **BN-01** As a **Recruiter**, I want to add a candidate to my company\'s retained bench with a rate band so that they are exclusively ours, paid on bench, and auto-marketed via our hotlist.
>
> **⚙ SYSTEM:** Creates bench invitation (JobInvitation, purpose: bench) with min/max hourly rate, 1-year expiry. On candidate acceptance: RETAINED tier --- CandidatesCompany.status = hot_candidate, candidate_status = subscribed. Standalone bench_paid Assignment auto-created if H1B. ALL other bench invitations (sent or received) auto-rejected (exclusivity rule for retained tier only). recruiter_id assigned. Candidate appears in company bench_feed.
>
> **BN-02** As a **Candidate**, I want to accept multiple marketing-bench listings from different vendors so that my availability is visible to the widest possible market without exclusive lock-in.
>
> **⚙ SYSTEM:** MARKETING tier: no Assignment created, no payroll obligation. Candidate listed on each accepting vendor\'s bench_feed independently. Each vendor sees only candidate-authorized data. No exclusivity enforcement. Rate floor set by candidate; markup per vendor. Retained bench (if any) overrides and removes all marketing listings.
>
> **BN-03** As a **Recruiter**, I want to submit my bench candidate to an external job via the Console so that I can market them to openings across the network without leaving the platform.
>
> **⚙ SYSTEM:** Console: console_bench application type. Pre-computed match tables: job.matches searched by name/skills/title. Creates JobApplication with applicant = candidate, application_type = console_bench. Dual-ledger: also recorded as sent application on recruiter\'s company. Duplicate applicants caught per-candidate per-job.
>
> **BN-04** As a **Recruiter**, I want to see my bench burn --- total monthly payroll on unbilled bench consultants so that I know exactly how much bench is costing and can prioritize placements accordingly.
>
> **⚙ SYSTEM:** Bench burn dashboard: sum of all bench_paid Assignment pay rates × estimated hours per month, GROUPED BY EMPLOYING ENTITY. Offshore bench at INR 1.5L/month displayed separately from US H1B at \$10K/month. Teaching-offset line for bench consultants delivering training (CL-04, Section 32.4). Trend line: burn this month vs last 3 months. Alert: burn exceeds threshold → recruiter + owner notified.
>
> **BN-05** As a **Owner**, I want to see the network-wide demand my bench could match against so that I can proactively submit candidates to opportunities I wouldn\'t have found alone.
>
> **⚙ SYSTEM:** Demand aggregation (CL-03): network-wide open requirements from all companies posting jobs, filtered by candidate skill-graph match. Owner/recruiter sees demand volume by skill area, rate range, location. One-click console_bench submission from demand view into a specific job. Demand view respects PreferVendor and BlackLister visibility rules.

5\. TRAINING --- CANDIDATE ACQUISITION FUNNEL (BRD §7)

> **TF-01** As a **Owner**, I want to create a training program that attracts candidates to my bench so that I acquire talent through development instead of competing for the same pool everyone else is fishing in.
>
> **⚙ SYSTEM:** Creates TrainingProgram: company_id, title, skill_list (from skill graph), duration, format (online/classroom/hybrid), cost (candidate pays), stipend (vendor pays candidate), schedule, status (draft/published/archived). Published programs appear on vendor AI site (TrainingCatalog block) and in training_feed (RSS + JSON).
>
> **TF-02** As a **Candidate**, I want to enroll in a training program and track my progress toward bench-readiness so that I have a clear path from learning to earning.
>
> **⚙ SYSTEM:** Creates TrainingEnrollment: program_id, candidate_id, status (applied → enrolled → in_progress → completed / dropped), enrolled_at, completed_at. On completion: candidate pipeline stage advances trainee → bench_ready. Completion recorded in Verified Work Ledger (CL-01). If stipend defined: standalone training Assignment auto-created for stipend payment via payroll.
>
> **TF-03** As a **Affiliate Trainer**, I want to deliver a vendor\'s training program and earn based on outcomes so that my income is aligned with candidate success, not just attendance.
>
> **⚙ SYSTEM:** Partner type: affiliate_trainer. Earning events: per-enrollment fee, per-completion fee, or train-to-place revenue share (% of placement margin when THEIR trainee is placed). Earnings calculated from actual records: enrollment count, completion count, TrainingEnrollment → Assignment chain. Cleared through commission cycle on B2B PAYABLES rail (never payroll). Trainer scorecard: enrollment → completion → placement conversion PER TRAINER visible to vendors before granting program rights.
>
> **TF-04** As a **Owner**, I want to see my acquisition funnel metrics --- enrolled to completed to benched to placed so that I can compare training cost vs sourcing cost per placed consultant.
>
> **⚙ SYSTEM:** Funnel dashboard: TrainingPrograms → Enrollments (count, completion rate) → bench conversions (completed + hot_candidate) → placements (completed + Assignment.status = billable). Cost per placed consultant: (program cost + stipends) ÷ placed count. Compared against sourcing-only acquisition cost. Filtered by program, time period, trainer (if affiliate).

6\. JOBS & REQUISITION MANAGEMENT (BRD §8)

> **JR-01** As a **Recruiter**, I want to post a job with skills from the skill graph so that the matching engine finds candidates across the network who have the right expertise, even if they describe it differently.
>
> **⚙ SYSTEM:** Creates Job: title, tag_list (skills from graph --- hierarchical matching enabled), listing_type (Job default), status Draft. On publish: status → Published, CandidateJobMatchWorker fires asynchronously. Match scoring: vector embedding similarity (60%) + availability (15%) + rate compatibility (15%) + recency (10%). Results in matches table. Job chat auto-created (creator + all manage_jobs users). Job added to job_feed.
>
> **JR-02** As a **Recruiter**, I want to invite a vendor, a candidate, or an email contact to apply for my job so that I can proactively source from my network and beyond.
>
> **⚙ SYSTEM:** Creates JobInvitation: type (vendor/candidate/by_email), purpose: job, rate band (min/max hourly), expiry. by_email: auto-creates Candidate if not found (skip standard invitation email, custom mailer). ActionCable broadcast to recipient. find_sent_or_received_invitation spans company + admin recipients.
>
> **JR-03** As a **Candidate**, I want to apply for a job and negotiate my rate within the platform so that the rate is agreed before I start, with both sides\' acceptance tracked.
>
> **⚙ SYSTEM:** Creates JobApplication: status = applied, rate_per_hour, rate_initiator. Rate negotiation: accept_rate (candidate flag) + accept_rate_by_company (company flag). is_rate_accepted? = both true. PaperTrail versioning on rate_per_hour --- full audit trail. MD5 share_key generated for external review without login. Uniqueness enforced: one application per candidate per job unless allow_multiple flag set.
>
> **JR-04** As a **Recruiter**, I want to move a candidate through the pipeline from prescreen to hired so that the workflow is visible, auditable, and triggers the right next steps automatically.
>
> **⚙ SYSTEM:** Pipeline stages: applied → short_listed → prescreen → rate_confirmation → client_submission → interviewing → hired / rejected. Each transition: notification to applicant, message posted to job chat, activity recorded. On hired: prompts contract/Assignment creation (module activation event per Section 30.4). Interview records attached at interviewing stage.
>
> **JR-05** As a **System**, I want to re-match candidates when a job\'s skills, industry, or department changes but not on every save so that compute is not wasted on non-matching-relevant edits.
>
> **⚙ SYSTEM:** on_save: if tag_list OR industry OR department changed → fire CandidateJobMatchWorker. Otherwise skip. Bench jobs match company.candidates only; Published match all active candidates. Candidate-side: on skill change → re-score against all Published/Bench jobs.

7\. DOCUMENT MANAGEMENT & E-SIGNATURE (BRD §9)

> **DM-01** As a **Owner**, I want to maintain document template libraries for different audiences so that I have reusable checklists for onboarding candidates, vendors, and clients.
>
> **⚙ SYSTEM:** Five library models: CompanyDoc (general templates), CompanyCandidateDoc (candidate-facing, is_require drives type), CompanyVendorDoc, CompanyCustomerDoc, CompanyEmployeeDoc. Each: name, doc_type, file, is_required_signature flag. Libraries are the templates; instances are created per record via AttachableDoc.
>
> **DM-02** As a **Recruiter**, I want to attach required documents to a new contract and know which ones need signatures so that nothing falls through the cracks during onboarding.
>
> **⚙ SYSTEM:** Contract creation: selected company_doc_ids → insert_attachable_docs copies each template with its original file onto the contract. Six per-contract doc set models: BuySendDocument, BuyEmpReqDoc, BuyVenReqDoc (C2C: W9, COI, MSA), SellSendDocument, SellRequestDocument + nested attributes. signature_required_docs? gate: contract has attachable docs with no completed file whose company_doc requires signature → blocks contract progression.
>
> **DM-03** As a **Recruiter**, I want to request a signature on a document from a candidate or client contact so that signatures are collected electronically with an audit trail.
>
> **⚙ SYSTEM:** Creates DocumentSign: documentable (the doc), signable (who signs --- polymorphic), requested_by, part_of (JobApplication/BuyContract/SellContract/Conversation), signers_ids (additional company signers). Two modes by is_require: E-Signature (DocuSign flow) vs document-upload request. Creates or posts to a conversation (auto-created DocumentRequest type if none exists). Notifications: Signature Request / Document Request on create.
>
> **DM-04** As a **System**, I want to send the document to DocuSign for e-signature and capture the signed copy when complete so that signatures are legally binding with tamper-evident audit trail.
>
> **⚙ SYSTEM:** DocuSign Envelope Service: reads Plugin (company OAuth tokens: access_token, refresh_token, account_id, base_path). Each file Base64-encoded into DocuSign_eSign::Document. Signers assembled from document_sign.signers + signable. SignHere tabs anchored to string ::Sig: in the document (anchorIgnoreIfNotPresent). Envelope sent (immediate) or created (draft). Webhook: company subdomain e_sign_completed endpoint receives completed envelope + documents + certificate. On completion: signed_file stored, is_sign_done = true, sign_time stamped, notification Document Signed sent, message posted to part_of conversation.
>
> **DM-05** As a **Compliance Officer**, I want to see which contracts are blocked waiting for document signatures so that I can chase outstanding signatures before they delay project starts.
>
> **⚙ SYSTEM:** Dashboard query: all Assignments where signature_required_docs? = true AND status = pending/accepted (not yet in_progress). Grouped by urgency (start_date proximity). One-click resend signature request. Escalation notification to contract admin and owner if T-3 days before start and docs still unsigned.

8\. CONTRACT ARCHITECTURE --- MSA / ENGAGEMENT / ASSIGNMENT (BRD §10)

> **CT-01** As a **Owner**, I want to create a Master Agreement with a client that captures all shared terms once so that I never duplicate payment terms, rate caps, or compliance requirements across 30 consultants.
>
> **⚙ SYSTEM:** Creates MasterAgreement: client_company_id, payment_terms, rate_card (with location tiers: onshore/nearshore/offshore), invoice_consolidation_rules, po_number, compliance_requirements (Compliance Profile reference), currency (billing). All Engagements under this MSA inherit its terms. Rate caps auto-applied: no Engagement can exceed MSA maximums.
>
> **CT-02** As a **Recruiter**, I want to create an Engagement (SOW) under an MSA for a specific project so that client-side terms are inherited and I only configure project-specific details.
>
> **⚙ SYSTEM:** Creates Engagement: msa_id (inherits terms), title, client_rate_card (within MSA caps), invoice_cycle config, expense_rules, billing_currency, performance_review_schedule. Sell-side cycle configs attached. Conversation auto-created (engagement admins + client contacts).
>
> **CT-03** As a **Recruiter**, I want to assign a consultant to an engagement with their specific pay terms so that the buy-side (what we pay them) is configured independently from the sell-side (what the client pays us).
>
> **⚙ SYSTEM:** Creates Assignment: engagement_id (optional --- standalone if bench_paid/internal/training), candidate_id, pay_rate, pay_currency, contract_type (W2/1099/C2C/country variants), payroll_info_id, origin_entity_id (CL-05: employing entity if different from contracting company). Status: draft → pending → accepted → in_progress → paused / is_ended / cancelled. Buy-side cycles generated from contract start to end. SSN encrypted (AES MessageEncryptor). Document sets attached (Section 7/DM-02).
>
> **CT-04** As a **System**, I want to auto-start contracts on their start date and auto-end them on their end date so that no contract sits in accepted limbo or runs past its term.
>
> **⚙ SYSTEM:** Daily jobs: start_contracts --- Assignments with start_date ≤ today AND status = accepted → status = in_progress, first timesheet scheduled, next_invoice_date set (start + frequency + 2 days). end_contracts --- Assignments with end_date ≤ today AND in_progress → is_ended = true, Rolloff Event triggered (Section 11/RO-01). Notifications to assignee, respond_by, created_by.
>
> **CT-05** As a **Recruiter**, I want to create a standalone Assignment without any client engagement so that I can pay bench consultants, internal staff, and trainees through the same payroll engine.
>
> **⚙ SYSTEM:** Assignment with engagement_id = NULL. States: internal (staff payroll --- recruiters, admins), bench_paid (H1B/retained --- DOL obligation; zero revenue), training (trainee stipend), pending_billable (started before client paperwork). Payroll cycles run identically. Bench burn dashboard sums all unbilled Assignment pay rates.
>
> **CT-06** As a **Owner**, I want to see profitability at every level --- per assignment, per engagement, per client, per recruiter so that I know where my margin comes from and where it leaks.
>
> **⚙ SYSTEM:** Per Assignment: (bill rate − pay rate) × approved hours − commissions. Per Engagement: sum of assignment margins (the one-sell-many-buys rollup). Per Client (MSA): all engagements. Per Recruiter: margins across recruiter_id-owned candidates. Dashboard with drill-down. Negative-margin alerts.
>
> **CT-07** As a **Accountant**, I want to see intercompany transfers when the employing entity differs from the billing entity so that I can reconcile cross-entity settlements for the finance team.
>
> **⚙ SYSTEM:** IntercompanyTransfer (CL-05): created per Assignment per period where origin_entity ≠ contracting company. from_entity (biller), to_entity (employer), amount (derived from Assignment pay rate × hours at origin_entity cost basis), currency, period, status (pending → settled). Ledger view per entity pair with running balance.

9\. THE CYCLE ENGINE --- 19 TYPES (BRD §11)

> **CE-01** As a **System**, I want to generate all scheduled cycles when a contract starts, and extend them when a contract is extended so that every timesheet window, invoice date, and payroll date is pre-scheduled and visible on a calendar.
>
> **⚙ SYSTEM:** Contracts::Cycle service: walks from Assignment/Engagement start to end. Per frequency: creates TimesheetSubmit cycle + open Timesheet, chains TimesheetApprove date, InvoiceGenerate date, salary cycles (SalaryCalculation/Process/Clear derived from PayrollInfo clear-date offsets), commission cycles, vendor bill cycles (C2C), client bill cycles, and client expense cycles (if enabled). All inside DB transaction. extend_cycles(extended_date) regenerates chains for the extension period. Idempotent: checks for existing cycles per type before creating.
>
> **CE-02** As a **Accountant**, I want to see all upcoming cycles on an operations calendar so that I know what is due this week across all contracts --- timesheets, invoices, payroll --- in one view.
>
> **⚙ SYSTEM:** Dashboard: ContractCycle.todo scope (next 3 months) grouped by type, color-coded. ContractCycle.overdue scope (end_date past, status pending) highlighted red. Drill-down to specific contract/assignment. Filter by cycle type, company, date range.
>
> **CE-03** As a **System**, I want to shift all payroll dates off weekends and company holidays so that pay dates always land on business days and are predictable.
>
> **⚙ SYSTEM:** check_for_shift / shift_day: for every generated date, while date is Saturday/Sunday/Holiday → if weekend_schedule flag set: shift BACKWARD (Sat −1, Sun −2, holiday −1); else shift FORWARD (+1/+2/+1). Loop until working day. Holiday model: per-company calendar. Applies to SalaryCalculation, SalaryProcess, SalaryClear dates.
>
> **CE-04** As a **System**, I want to handle all frequency math --- daily, weekly, biweekly, twice-a-month, monthly --- including February and month-boundary edge cases so that cycle dates are always correct regardless of calendar quirks.
>
> **⚙ SYSTEM:** Per-frequency calculators: Weekly/biweekly: date_of_next(day_of_week) via modulo-7/14 arithmetic with same-week guards and cross-frequency day comparison (approval day \> submission day → +7). Twice a month: two configured dates; four-branch resolution (before date1 / between / after date2 / end-of-month) with next-month wraparound. Monthly: configured date or end_of_month; February 29→28 collapse; 30/31 boundary handling.

10\. PAYROLL DATE ENGINE (BRD §12)

> **PD-01** As a **Owner**, I want to configure multiple payroll profiles with different frequencies and terms so that I can run weekly payroll for contractors and monthly for staff from the same platform.
>
> **⚙ SYSTEM:** PayrollInfo: payroll_type (daily/weekly/biweekly/monthly/twice-a-month), title (required, distinguishes profiles). Three independent stage configs: sc\_ (calculation), sp\_ (process), sclr\_ (clear) --- each with date_1/date_2/end_of_month/day_of_week/2day_of_week/day_time. Payroll terms: weekly 1--14 day lag, monthly end-of-current/1-previous/2-previous. Multiple profiles per company; each Assignment picks one via payroll_info_id.
>
> **PD-02** As a **System**, I want to generate a full year of payroll dates from the configuration, with business-day shifting so that the operations calendar shows every pay date for the year, adjusted for weekends and holidays.
>
> **⚙ SYSTEM:** PayrollCycles.create_update_payroll: groups the year by frequency (daily/weekly/biweekly/monthly/twice-a-month periods). For each period: computes start_date/end_date (period boundaries), doc_date (clear/pay date = end + payroll_term offset, landing on configured sclr day), cal_date (doc_date − offset to sc config), pro_date (doc_date − offset to sp config). All dates shifted off weekends/holidays. Creates SalaryCalculation + SalaryProcess + SalaryClear ContractCycle per period. Config change → destroy all existing cycles + regenerate (transactional).
>
> **PD-03** As a **Owner**, I want to configure vendor payment schedules separately from employee payroll so that I pay my C2C sub-vendors on their own terms, not my employee schedule.
>
> **⚙ SYSTEM:** PayrollInfo: ven_bill\_, ven_pay\_, ven_clr\_ date sets + ven_payroll_type + vendor terms --- independent from employee payroll. Company-level defaults applied to C2C Assignments. VendorBillCalculation → VendorPaymentProcess → VendorBillClear cycle chain generated per C2C Assignment.

11\. TIMESHEET MANAGEMENT (BRD §13)

> **TS-01** As a **Candidate**, I want to enter my hours per day for the current timesheet period and submit for approval so that my time is recorded and moves toward payment.
>
> **⚙ SYSTEM:** Timesheet: days hstore (date → hours). total_time from sum of day entries. Status: open → submitted. On submit: ts_cycle_id TimesheetSubmit cycle marked completed; ta_cycle_id TimesheetApprove cycle stamped with date. Uniqueness: one timesheet per contract per period. Attachment supported (client-signed timesheet scan).
>
> **TS-02** As a **Recruiter / Approver**, I want to approve, partially approve, or reject a submitted timesheet so that hours are confirmed before invoicing and payroll.
>
> **⚙ SYSTEM:** TimesheetApprover records per approver with own status. Guards: is_already_submitted?, is_already_approved_or_rejected? (no double action). Approval: resolve ChangeRate for the period (from_date ≤ start, to_date ≥ end, earliest wins). amount = rate × total_time. expected_hrs from ChangeRate.working_hrs. Create ContractSalaryHistory CREDIT entry (amount). Increment contract.salary_to_pay --- the accrual payroll consumes. Status → approved (or partially_approved if approvers disagree). Next timesheet auto-scheduled.
>
> **TS-03** As a **System**, I want to flag anomalous timesheets for human review instead of requiring approval of every one so that humans only spend time on exceptions --- unusual hours, rate mismatches, duplicate periods.
>
> **⚙ SYSTEM:** AI anomaly detection (3.1): compare total_time vs expected_hrs (±20% threshold), check for duplicate period submissions, validate rate against current ChangeRate. Clean timesheets: auto-approve queue with one-click batch approval. Anomalous: flagged with reason, routed to manual review. Approval still requires human action --- AI triages, never decides.
>
> **TS-04** As a **System**, I want to schedule the next timesheet window automatically when the current one is submitted so that the timesheet chain runs without manual intervention for the life of the contract.
>
> **⚙ SYSTEM:** set_recurring_timesheet_cycle: next window = start + frequency − 1, truncated at contract end (next_timesheet_created_date nil on final period). Scheduled via delayed job at next date. On approval of current period: pending logs in next period auto-approve if applicable.

12\. PAYROLL RUN, INVOICING & PAYMENTS (BRD §14)

> **PR-01** As a **Accountant**, I want to run payroll for a period --- see all salaries due, approve the run, generate the export file so that I process payments in one batch instead of per-contract.
>
> **⚙ SYSTEM:** Salary run (7 stages): pending → open (SalaryItem: Timesheet items mark timesheet salaried!, accumulate approved_amount += timesheet.amount, total_approve_time += total_time) → calculated (gross = approved amounts + cleared company_expense payments − cleared salary_advanced payments + previous_balance carry-forward) → commission_calculated (earned_commissions from pending CommissionQueue entries merged) → processed (SalaryProcess cycle: payment instruction) → aggregated (multi-period per candidate for bulk) → cleared (SalaryClear cycle on shifted doc_date: confirmed). generate_csv: Name, visa Status, State, City, Address, Zip, Amount per candidate for external payroll/ACH.
>
> **PR-02** As a **Accountant**, I want to generate a consolidated invoice for a client covering all assignments under their engagement so that the client receives one invoice instead of 30.
>
> **⚙ SYSTEM:** ConsolidatedInvoice: one per Engagement per period. Line items per Assignment: InvoiceItem (polymorphic itemable: Timesheet or ClientExpense). Invoice number: IN\_{agreement}\_{sequence}. Amount build: total_approve_time from approved not-invoiced timesheets; total_amount = hours × engagement rate (with location-tier rates per CL-05 if configured); commission: fixed (first invoice only) or percentage capped at max_commission; billing_amount = total − commission − consultant. All included timesheets → status invoiced with invoice_id stamped. Due date = cycle start + payment_term days. Formats: ANSI X12 810 EDI / UBL 2.1 XML for Ariba/Coupa.
>
> **PR-03** As a **Accountant**, I want to record partial payments against an invoice and track the balance so that I can manage receivables accurately even when clients pay in installments.
>
> **⚙ SYSTEM:** ReceivePayment: payment_date, payment_method, reference_no, deposit_to, amount_received, memo, posted_as_discount, attachment. update_payment_receive: paid = sum of all received. If paid ≥ total → status = paid, invoice cycle marked completed. Else → status = partially_paid. billing_amount = paid. balance = total − paid.
>
> **PR-04** As a **System**, I want to track the full ledger per beneficiary --- what was earned, paid, and outstanding so that the vendor has a running statement per consultant and per sub-vendor.
>
> **⚙ SYSTEM:** ContractBook: per transaction --- polymorphic bookable (Salary) + beneficiary (Candidate or vendor Company) + contract_type (buy/sell) + previous / total / paid / remainings. set_salary_remaining: previous = all-time total − all-time credit for this beneficiary; remainings = previous + total − paid. update_bank_balance: company BankDetail balance decremented by paid --- cash position tracking.
>
> **PR-05** As a **Accountant**, I want to run a batched vendor payment for all C2C sub-vendor bills due this cycle so that sub-vendor payments are processed as efficiently as employee payroll.
>
> **⚙ SYSTEM:** VendorBill chain: VendorBillCalculation (calculate owed amount from approved timesheets at buy rate) → VendorPaymentProcess (payment instruction on invoice-receipt schedule) → VendorBillClear (confirmed). Payment Run screen: all salaries + vendor bills due for the cycle date. Approve run → generate ACH/CSV → mark cleared. Bank balance and cash-flow view from ContractBook + BankDetail.

13\. THE ROLLOFF EVENT & INTERNAL MOBILITY (BRD §16)

> **RO-01** As a **System**, I want to detect an approaching contract end and initiate the rolloff workflow automatically so that no consultant falls through the cracks between projects.
>
> **⚙ SYSTEM:** T-4 weeks before Assignment end_date (or Beeline end-date-changed event): creates RolloffEvent record. Consultant enters Releasing Soon supply pool with availability_date. Forecast matching fires against ALL open internal demand BEFORE bench return. Notification to recruiter_id owner, RMG, and current PM.
>
> **RO-02** As a **PM**, I want to see releasing-soon consultants across the company and claim one for my upcoming project so that I can fill my next project internally before going to market.
>
> **⚙ SYSTEM:** Releasing Soon pool visible to all PMs: skills, rate, location, visa status, availability date, current project history. PM submits console_internal application. RMG owner + current PM notified. Compliance gate checks fire (Section 15): location change → H1B LCA amendment flag BEFORE confirmation; state tax; cross-border work rights.
>
> **RO-03** As a **System**, I want to fan out notifications to every relevant party when a contract actually ends so that the consultant, sub-vendor, client, and RMG all know simultaneously and take their specific next steps.
>
> **⚙ SYSTEM:** On end_date: FAN-OUT --- role-appropriate content per recipient: Consultant (your assignment at {client} ends {date}; next steps / new assignment details if claimed), Sub-vendor (your consultant at {client} completes {date}; final timesheet/invoice), Client PM/procurement (contractor release on {date}; deboard checklist), RMG (consultant available; utilization impact). All via notification preferences/digests, not individual emails.
>
> **RO-04** As a **Recruiter**, I want to complete the deboard checklist for a rolling-off consultant so that knowledge transfer, asset return, and access revocation all happen on time.
>
> **⚙ SYSTEM:** Deboard checklist: templated per MSA/Engagement (knowledge transfer, asset return, access revocation, final timesheet, release note). Each item: owner, deadline, status. IT access revocation flagged as security-SLA item with attestation (functional area stress test: IT deprovisioning). Uncompleted items escalate T-1 day.
>
> **RO-05** As a **System**, I want to transition a consultant to their next state --- new assignment or bench with burn clock so that the cycle completes without manual intervention.
>
> **⚙ SYSTEM:** Claimed → new Assignment auto-created with onboarding checklist per new client doc requirements. Unclaimed → bench: if retained (H1B/bench_paid) → bench_paid Assignment auto-created, burn clock starts, AI prioritizes placement in matching. If marketing bench → availability flag flipped, appears in all listing vendors\' bench_feeds. Recruiter_id ownership persists through the transition.

14\. VMS & PROCUREMENT INTEGRATION (BRD §17)

> **VI-01** As a **Owner**, I want to forward Beeline notification emails to Etyme and have them auto-parsed so that I get rolloff alerts and assignment data from the VMS without waiting for API access or client permission.
>
> **⚙ SYSTEM:** Email/CSV parser fallback: dedicated inbound email address per company. AI parses Beeline/Fieldglass notification emails into structured events: assignment created, end-date changed, assignment ended, requisition posted. Parsed events create/update Assignments, trigger RolloffEvents, or create Jobs. Confidence score on parse; low-confidence flagged for human review. ZERO client permission required.
>
> **VI-02** As a **System**, I want to auto-submit consolidated invoices to the client\'s Ariba Network via the vendor\'s existing ANID so that invoices reach the client\'s procurement system without manual portal entry.
>
> **⚙ SYSTEM:** Option B integration: connects to vendor\'s Ariba Network account (their ANID, their credentials). ConsolidatedInvoice → ANSI X12 810 EDI or cXML format. PO number from MSA referenced on every invoice. Submission via Ariba Network API. Payment webhooks: invoice paid → update ReceivePayment → trigger SalaryClear. No client permission needed; no MSP liability.
>
> **VI-03** As a **Owner**, I want to receive VMS events via API when the client grants access so that assignments, requisitions, and timesheet statuses sync automatically.
>
> **⚙ SYSTEM:** VmsConnection: company_id, vms_type (beeline/fieldglass), credentials, status. Inbound events: assignment CRUD, end-date changes, requisition posts, timesheet approval/rejection. Each event mapped to Etyme entity (Assignment, Job, Timesheet status). Email-parser continues as fallback for events the API doesn\'t cover or for clients who haven\'t granted API access.

15\. WEBSITE / CMS --- AI SITE BUILDER (BRD §18)

> **WS-01** As a **Owner**, I want to get a working website with my bench and jobs live within 90 seconds of signing up so that I have an immediate, publicly visible presence that replaces what I was paying Wix and manual labor for.
>
> **⚙ SYSTEM:** AI site generation: on company creation, AI scrapes existing website (if any) + LinkedIn company page + signup profile data. Generates: site config JSON (which blocks, order, pages), theme (colors, fonts from brand signals), copy (hero, about, service descriptions). Native Block Library renders from config: JobBoard (live from published Jobs), BenchGrid/hotlist (live from bench_feed), TrainingCatalog (live from published TrainingPrograms), ApplyForm (writes JobApplication), Hero, About, Team, Testimonials, ClientLogos, ContactForm. Site live at {slug}.etyme.com.
>
> **WS-02** As a **Owner**, I want to edit my site conversationally --- make it darker, add testimonials, rewrite the about page for healthcare so that I can customize without touching code or hiring a designer.
>
> **⚙ SYSTEM:** Conversational editing: owner types instruction → AI modifies site config JSON and/or copy. Theme changes: update color/font tokens. Block changes: add/remove/reorder blocks in config. Copy changes: rewrite specific text fields. AI edits the CONFIG, never generates code. Changes preview before publish.
>
> **WS-03** As a **Candidate**, I want to see a vendor\'s job listings and training programs on their site and apply directly so that I can discover opportunities and enroll in training from the vendor\'s own brand, not a generic job board.
>
> **⚙ SYSTEM:** JobBoard block: renders published Jobs for this company. ApplyForm: creates JobApplication (application_type: direct or without_registration for unauthenticated). TrainingCatalog block: renders published TrainingPrograms. EnrollForm: creates TrainingEnrollment (status: applied). All data-bound to live platform entities --- no static content.
>
> **WS-04** As a **Owner**, I want to point my custom domain to my Etyme site so that my brand is visible, not Etyme\'s.
>
> **⚙ SYSTEM:** Custom domain: CNAME verification, automated TLS provisioning (Let\'s Encrypt). DNS validation. Site renders at custom domain with vendor branding. Etyme branding removed or minimized per tier.

16\. NETWORK, FEEDS & MARKETPLACE (BRD §19)

> **NF-01** As a **System**, I want to publish hot bench candidates as an automated RSS + JSON feed per company so that the industry\'s daily hotlist ritual becomes an API that updates itself.
>
> **⚙ SYSTEM:** bench_feed: all hot_candidate CandidatesCompany records for the company + candidate profile data + company info + videos. Published as RSS and JSON at /feed/bench.rss and /feed/bench.json. Per-company and platform-wide aggregated feeds. Multi-vendor marketing bench (CL-02): candidate appears in EVERY listing vendor\'s feed.
>
> **NF-02** As a **Owner**, I want to see a network activity feed --- placements, certifications, bench updates across companies I follow so that I discover partners and opportunities through the network\'s visible wins.
>
> **⚙ SYSTEM:** Network Feed (Layer 5): assembles from PublicActivity events: placements made, consultants certified, bench updated, milestones reached. Companies follow companies; candidates follow companies; recruiters build audiences. Every placement is a post. Follow/unfollow controls. Feed filters by network (my preferred vendors) or platform-wide.

17\. ENTERPRISE CONTINGENT PORTAL (BRD §20)

> **EP-01** As a **Client Contact**, I want to see all my active contingent workers, spend by vendor, and compliance status in one dashboard so that I manage my contingent program without a VMS or spreadsheets.
>
> **⚙ SYSTEM:** CPO dashboard: active contingent workers (count, by department/role/vendor), spend (current period, trend, budget vs actual), vendor scorecards (on-time-start, timesheet compliance, invoice accuracy). Compliance dashboard: visa statuses, contract expirations, document tracking. Data sourced from Assignments, Timesheets, Invoices under MSAs where this company is the client.
>
> **EP-02** As a **Client Contact**, I want to post contingent openings that my vendor network can see and fill so that I source through my portal instead of sending emails to 12 vendors.
>
> **⚙ SYSTEM:** Contingent Career Page: Client posts Job (is_public, is_indexed optional). Job visible to PreferVendor network. Vendors submit via standard application pipeline. Client reviews, interviews, hires --- all within portal. Flows into matching + job_feed.
>
> **EP-03** As a **Vendor**, I want to apply to become a supplier for an enterprise through their portal so that I enter new client relationships through a structured funnel instead of cold email.
>
> **⚙ SYSTEM:** Supplier Page: become-a-supplier form → PreferVendor application. MSA requirements displayed (insurance minimums, compliance standards). Vendor uploads required documents (CompanyVendorDoc library). On acceptance: PreferVendor status = accepted; vendor gains submission rights.
>
> **EP-04** As a **System**, I want to enforce SSO via the enterprise\'s identity provider so that no enterprise IT team rejects the portal for security reasons.
>
> **⚙ SYSTEM:** SSO: SAML 2.0 / OIDC per-company IdP configuration (Okta, Entra ID, Google Workspace). User authenticates against enterprise IdP; Etyme receives assertion/token; maps to User record. SCIM deprovisioning (Phase 4+): user removed from IdP → Etyme access revoked. First-class custom domain: contingent.acme.com, automated TLS, Etyme invisible.

18\. COMMUNICATION & NOTIFICATIONS (BRD §21)

> **CM-01** As a **Recruiter**, I want to have a conversation auto-created for every job, contract, and document request so that communication is always in context, never lost in email.
>
> **⚙ SYSTEM:** Auto-created contexts: Job → chat (creator added, creation message posted) + conversation (group: all manage_jobs users). BuyContract/Assignment → conversation (contract admins + candidate). SellContract/Engagement → conversation (contract admins + client contacts). DocumentSign → DocumentRequest conversation (requester + signer). Group types: Chat, Candidate (marketing lists), Contact (client relationships), Branch.
>
> **CM-02** As a **Owner**, I want to configure notification preferences and digests instead of getting emailed on every event so that my team isn\'t buried in notification spam at scale.
>
> **⚙ SYSTEM:** Notification preferences per user: per-type (chat, application, invitation, application_status, contract, document_request, job) × channel (in-app, email, digest). Digest batching: hourly/daily/weekly. Role-based routing: rolloff fan-out sends role-appropriate content (Section 13/RO-03). Event batching: multiple notifications of the same type within a window collapse into one digest entry.

19\. PARTNER NETWORK (BRD §32)

> **PN-01** As a **Owner**, I want to invite an independent recruiter to co-host placements from my bench so that I extend my sales reach without hiring, and they earn on results.
>
> **⚙ SYSTEM:** Creates partner profile (lightweight, not full company) with partner_type: affiliate_recruiter. Affiliation agreement: recruiter ↔ vendor contract (template + DocuSign). Scoped access: partner sees ONLY candidates assigned to them and requisitions invited to. Split definition: per-affiliation defaults + per-placement overrides. Etyme takes platform fee; Etyme is NEVER the employer. Payouts on PAYABLES rail (invoiced, 1099-tracked), never payroll.
>
> **PN-02** As a **Affiliate Recruiter**, I want to see my earnings statement --- placements, splits calculated, payments cleared so that I have full transparency on what I earned and when I\'ll be paid.
>
> **⚙ SYSTEM:** Earning lifecycle: placement (Assignment created with partner attribution via recruiter_company_id) → commission calculated from ConsolidatedInvoice line item (actual invoice, not estimated) → queued on client payment receipt (ReceivePayment) → cleared on commission cycle → per-partner statement (ContractBook). Dashboard: placements, pending commissions, cleared payments, running total.
>
> **PN-03** As a **Owner**, I want to see trainer quality scores before granting program rights so that bad trainers don\'t poison my candidate pipeline.
>
> **⚙ SYSTEM:** Trainer scorecard: per-trainer enrollment count, completion rate, placement conversion (TrainingEnrollment.completed → Assignment.billable chain), average time-to-placement. Visible to vendor owners. Quality gate: vendor grants/revokes program rights per trainer.
>
> **PN-04** As a **Candidate**, I want to refer a peer and earn when they get placed so that I\'m rewarded for growing the talent network.
>
> **⚙ SYSTEM:** Candidate referral: CscAccount with accountable_type = Candidate. Referred candidate linked to referrer. On placement: referral fee calculated per referral terms. Cleared through commission cycle. Payout rail: PAYABLES (or payroll if referrer is also an employed consultant at the same vendor).

20\. COMPLIANCE GATES (BRD §15, §31)

> **CG-01** As a **System**, I want to block an Assignment transition when a compliance requirement is unmet so that no consultant starts work without required clearances.
>
> **⚙ SYSTEM:** Compliance gates fire on Assignment status transitions (accepted → in_progress, transfer between engagements). Checks against Compliance Profile (MSA-level): required screening package complete, visa/work-authorization valid for assignment country, document checklist signed, Qualification Matrix satisfied (including client-scoped items per CL-05). Gate failure: Assignment stays in current status; notification to Compliance Officer with specific unmet requirements.
>
> **CG-02** As a **Compliance Officer**, I want to see a dashboard of all compliance-blocked assignments and expiring credentials so that I can proactively resolve issues before they delay placements or create legal exposure.
>
> **⚙ SYSTEM:** Compliance dashboard: blocked Assignments (grouped by gate type and urgency). Expiring credentials: visa T-90/60/30 alerts, certification expirations, document renewals due. Per-client compliance summary (for the vendor to share as a sales tool per CL-04). Export for audit purposes.
>
> **CG-03** As a **System**, I want to flag an H1B location change that requires an LCA amendment before the transfer is confirmed so that the vendor never accidentally violates immigration law during an internal move.
>
> **⚙ SYSTEM:** On console_internal claim where candidate.visa_type = H1B AND new Assignment location metro area ≠ current: LCA_AMENDMENT_REQUIRED flag set. Assignment blocked at compliance gate. Compliance Officer clears after attorney confirms LCA filing. Alert includes: current location, proposed location, candidate visa details, attorney contact from VisaPetition record.

21\. AI TRANSFORMATION LAYER (BRD §23)

> **AI-01** As a **Recruiter**, I want to search in natural language --- BRIM-certified, available in 6 weeks, under \$120/hr, Colorado so that I find the right consultant without building complex filter queries.
>
> **⚙ SYSTEM:** Natural language search: query parsed into structured filters (skill graph: BRIM, availability: T+6weeks, rate: ≤120, location: Colorado). Vector embedding search against candidate profiles. Results ranked by composite score: skill match + availability + rate fit + recency. Visa-readiness surfaced prominently per CL-04.
>
> **AI-02** As a **Recruiter**, I want to get AI-drafted submission emails that I review and send so that I spend time on judgment, not on writing the same intro email 50 times.
>
> **⚙ SYSTEM:** Recruiter co-pilot (expanded per CL-03): drafts submission email from candidate profile + job requirements + client history. Tracks submission-to-interview conversion PER CLIENT. Suggests rate positioning from ChangeRate market data. Learns which clients respond to what framing (formal vs. concise, skills-led vs. experience-led). Recruiter reviews, edits, sends --- AI never sends autonomously.
>
> **AI-03** As a **System**, I want to parse uploaded resumes into structured candidate profiles so that manual data entry is eliminated for candidate onboarding.
>
> **⚙ SYSTEM:** LLM resume parser: replaces 2017 Sovren/Archilli. Input: PDF/DOCX resume. Output: structured profile matching the same contract --- name, skills (mapped to skill graph), work history (Client records), education, certifications, location. Confidence scores per field. Low-confidence fields flagged for candidate review. Candidate confirms/edits before profile activates.
>
> **AI-04** As a **System**, I want to continuously score all supply against all demand and surface the best matches so that matching is proactive and always-on, not triggered only when a recruiter searches.
>
> **⚙ SYSTEM:** Demand-supply grid: continuous forecast matching of demand pipeline (open + upcoming Jobs) against supply pipeline (bench + releasing-within-X-weeks). Vector similarity + availability + rate + visa-readiness + location + recency. Results ranked per Job and per Candidate (bidirectional). Seasonal recurrence learning: grid learns client rhythm (this client needs 3 close accountants every January per CL-03/34.3).

22\. MODULE ACTIVATION & PRICING (BRD §30, §33)

> **MA-01** As a **Owner**, I want to discover new modules when my workflow naturally needs them, not from a feature list so that the platform grows with my business instead of overwhelming me on day one.
>
> **⚙ SYSTEM:** Module activation (Section 30.4): event-driven prompts. First candidate hired → Contracts prompted. First Assignment in_progress → Timesheets auto-enabled. First timesheet approved → Invoicing prompted. First C2C assignment → Vendor bill chain prompted. First H1B benched → Bench-pay + burn dashboard. T-4 weeks before rolloff → Rolloff loop. Each prompt: one-click activation at the moment of need.
>
> **MA-02** As a **Owner**, I want to never be blocked mid-payroll because I hit a plan limit so that my business operations are never held hostage by a billing wall.
>
> **⚙ SYSTEM:** Overflow billing (Section 33.4): at assignment cap → per-assignment overage rate applies automatically. No hard wall, no approval gate, no service interruption. Overage visible on next invoice with clear line items. Alert to owner: you are over your tier; upgrade to save.
>
> **MA-03** As a **System**, I want to meter billing by active assignments, never by user seats so that inviting recruiters is always free, which drives adoption and network density.
>
> **⚙ SYSTEM:** Billing meter: count of Assignments with status = in_progress or bench_paid. Tier thresholds: e.g., 1--10, 11--25, 26--50, 51--100, 100+. Tier price fixed per month; overflow per-assignment above cap. Recruiters, candidates, partners, client contacts, approvers: zero billing impact. Module activation: no price change. Only crossing an assignment threshold changes cost.

**END OF USER & SYSTEM STORIES**

*Etyme --- The Enterprise Layer for Contingent Talent*

Companion to Master BRD v3.7 FINAL \| July 2026
