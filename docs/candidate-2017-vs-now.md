# The consultant, 2017 against now

What the old system gave a candidate, what the new one gives them, and what
is genuinely missing. Read against `legacy-app/models/candidate.rb`,
`legacy-app/controllers/candidate/*` and `LEGACY_RULES.md` §3.

The short version: the new build is ahead on everything about **control and
honesty**, and behind on **the paperwork of being a candidate** — resume,
education, references, bank details. The gaps are listed at the bottom with
what each one blocks.

---

## Where the new build is ahead

These are not ports. 2017 had no equivalent at all.

| What | Why it matters | Where |
|---|---|---|
| **More than one bench** | 2017 forbade it outright: accepting a bench invitation auto-rejected every other pending one (`job_invitation.rb` reject_request), so a person belonged to whichever recruiter asked first. Real consultants are on five to fifteen benches, so they kept them off the platform. | `BenchListing`, unique on (consultant, company) |
| **The listing is the consultant's to grant and revoke** | In 2017 a company made somebody "hot" and the system created the bench invitation. The permission ran the wrong way. | `BenchListing.grantedAt` — "by the consultant, not the company" |
| **Representation holds** | One agency represents one person at one client at a time, so two agencies cannot put the same name in front of the same client and lose them the role between them. 2017 could not see across vendors at all. | `src/lib/representation.ts`, `Representation` |
| **Do-not-submit list** | A client the person will not be sent to — usually their current one. Blocks the submission and gives the vendor no reason. | `DoNotSubmit` |
| **Ask me first** | Per bench: turn each new client into a question the person answers. | `BenchListing.askFirst` |
| **Who has you** | Every bench, every hold, every submission ever made in their name, whoever made it. No system in this industry shows a consultant this. | `/dashboard/my-benches` |
| **Their own page** | An address that belongs to them and survives leaving an agency. 2017 had `portfolios` — a text record inside the company's site, not a public page and not theirs. | `/c/[slug]`, `ConsultantProfile.slug` |
| **Every read of their data is logged, including refusals** | 2017 had `PublicActivity` on some models and nothing a candidate could see. | `AccessLog` |
| **Tenure follows the person across vendors** | Twelve months through one agency plus twelve through another is twenty-four months of exposure at that client. Per-assignment tracking is the industry's blind spot. | Addendum E, tenure ledger |
| **Rate floor the consultant sets** | No listing may go below it. 2017 rate bands were the company's. | `ConsultantProfile.rateFloor` |
| **Match scores carry their reasoning** | Factors, basis, confidence, unknowns. 2017 returned a bare percentage from a fixed 60/20/20 formula. | `Match` |

---

## Ported, and roughly equivalent

| 2017 | Now | Note |
|---|---|---|
| Devise self-registration, confirmable, invitable | NextAuth + `Credential` / `Context` | Two populations, two auth paths. A consumer email domain means candidate, not company admin. |
| Skills, headline, location, work authorisation | `ConsultantProfile` | 2017 capped skills at 8. No cap now. |
| Visa enum (US citizen, GC, OPT, H1B…) | `ConsultantProfile.workAuth` + `VisaPetition` | Petitions, documents and events are new — 2017 had a flat `visa` column and a `visas` table. |
| Availability | `availableFrom` | Also drives the Releasing Soon pool, which 2017 had no concept of. |
| Job applications, 9 statuses | `Submission` + status | 2017's `rate_confirmation` two-sided accept is not ported — see gaps. |
| Interviews, three-party acceptance | `/api/submissions/[id]/interviews` | Stored as a notification with structured data. There is no Interview model, which is a real weakness. |
| Timesheets | `Timesheet` | Cycle arithmetic ported carefully; the 2017 implementation was correct and earned. |
| Expenses | `Expense` | Consultant-incurred, billable flag, contract-linked. |
| Contracts, salary history | `SellContract`, `RateHistory` | |
| Notifications | `Notification` + honest delivery states | 2017 wrote HTML into the notification body. |
| Conversations / chat | `Conversation`, `Message` | No presence or "online status". |
| Training | `Course`, `Enrollment` | 2017 had none. This is the BRD's thesis made visible. |
| Blacklist | `Blacklist` | 2017's was a data record with no enforcement (`black_lister.rb`). Ours is checked. |
| Document signing | `DocInstance`, `DocTemplate` | |
| Sharing a candidate between companies | `DocumentShare`, `BenchListing` | 2017's `SharedCandidate` was a bare join with no expiry and no consent. |

---

## Genuinely missing

Ordered by what they block.

### 1. Resume — no model at all
2017 had multiple resumes per candidate, one primary, automatic promotion on
delete, and parsing through Sovren and Archilli that populated the profile
(`candidate_profile_service.rb:42-82`).

We have document extraction for imports (`src/lib/extract.ts`) but nothing
that holds a person's CV. **Blocks:** a consultant cannot be submitted with
a document, a recruiter cannot search text, and the profile has to be typed
by hand. This is the single largest gap.

### 2. Education, certificates, experience
2017: `educations`, `experiences`, `certificates`,
`candidate_education_document`, `candidate_certificate_document`.

Now: the portfolio counts engagements from contracts, which is honest but
only covers work done through Etyme. Nothing holds a degree, a certification
or a job from before. **Blocks:** credential evaluation (`WES`, `ECE`)
has nowhere to attach, and a new consultant's page is empty until they are
placed.

### 3. References
2017 let a candidate record past clients with two named referees each
(`candidate/clients_controller.rb`). We have `VerificationType.REFERENCE_CHECK`
with no reference data behind it. **Blocks:** the check exists as a status
with nothing to check.

### 4. Bank and tax details
2017: `csc_accounts`, `contract_books` as beneficiary. We have `taxId` on a
company and nothing on a person. Already named in `BUILD.md` §6.
**Blocks:** paying anybody.

### 5. Photo, and video introduction
2017 had both, including a company-branded video. Small, and it changes how
a bench listing reads.

### 6. Personal details the law needs
Date of birth, phone, address. 2017 also stored SSN and passport number in
plain columns, which should not be ported as it stood. **Blocks:** I-9,
E-Verify and payroll onboarding all need identity fields, and they need
encrypting, which is a decision rather than a column.

### 7. Two-sided rate confirmation
2017's flow: the candidate or vendor accepts, the client accepts, and the
rate is confirmed only when both are true; either side negotiating resets
both. Once a candidate accepted they could not counter
(`candidate_application_service.rb:8-33`). We have one rate on a submission
and no acceptance handshake. **Blocks:** the consultant has no say in the
rate they are submitted at beyond the floor.

### 8. Subscriptions — following a company
2017 let a candidate subscribe to a company and see their jobs
(`candidate/subscriptions_controller.rb`). It is the demand-side half of the
public page we just built.

### 9. A named recruiter
2017's `recruiter_id` gave every candidate an owner inside the vendor. We
have none, so nobody is accountable for a person sitting on a bench.

### 10. Profile completeness
2017 carried eight `is_*_update` flags driving a checklist. Crude, and it
answered "what do I still owe you", which nothing here answers.

### 11. Commissions
Named in `BUILD.md` §6. 2017 had `contract_sale_commissions` through
`csc_accounts`.

---

## Deliberately not ported

| 2017 | Why not |
|---|---|
| **One bench only** (`reject_request`) | The rule this whole module exists to reverse. |
| **Freelancer dummy company** — candidates with no company were assigned to a fake vendor on `freelancer.com` (`candidate.rb:372-375`) | A person with no agency is a person with no agency. Inventing an employer to satisfy a foreign key is how the 134-model sprawl started. |
| **Making somebody "normal" destroys their invitations and reassigns them** (`candidate_management_service.rb:89-100`) | A company unilaterally cancelling somebody's arrangements. |
| **SSN and passport as plain columns** | Not without encryption and a retention rule. |
| **Candidate/Consultant/User as three identity models** | One `Person`, many `Context` rows. The 2017 merge rule (`candidate.rb:435-444`) existed only to clean up the mess this created. |
| **`allow_multiple_applications_for_candidate`** | The duplicate rule is unconditional now, and the hold is what makes it safe. |
