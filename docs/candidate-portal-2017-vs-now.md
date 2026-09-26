# What a candidate could do in 2017, and what they can do now

Checked against `legacy-app/controllers/candidate/` — the code that ran,
which is a better record than the manual.

**26 controllers then. Four nav items now.**

---

## The six things asked for this week were all built in 2017

Every one of them, and I rebuilt three by inference when the answer was
in this repository.

| Asked for | 2017 |
|---|---|
| Where am I submitted, by whom | `job_applications#index/show/share` |
| Interviews scheduled | `job_applications#interview` · `accept_interview` |
| Chat messages | `conversations` · `conversation_messages` · `messages` · `chats` |
| My contracts | `contracts#index/show` |
| Timesheet submission and approval timelines | `contracts#timeline` |
| Money owed | `candidates#salaries` · `expenses` · `client_expenses` |

`contracts#timeline` filters contract cycles on `TimesheetSubmit` and
`TimesheetApprove`. That is the same pair of cycle kinds, under the same
names, that got written from scratch today.

---

## What is still missing, and was not on anybody's list

These never came up because nobody remembered the product had them.

**Bench consent — `job_invitations#accept_bench` / `#reject_bench`.**
A candidate was invited onto a bench and accepted or rejected it, and
the record moved between states on their answer. The current schema has
`BenchListing.grantedAt` defaulting to `now()` at creation, so a listing
is "granted" the moment a vendor makes it and nobody ever asks. That gap
was flagged earlier this week as a pre-existing bug; 2017 is where the
missing half went. This is the invariant `CLAUDE.md` states most
firmly — *a Submission requires a live BenchListing granted by the
consultant* — and the grant is the part that disappeared.

**Rate negotiation — `job_applications#rate_negotiation` / `#accept_rate`.**
A candidate could counter the rate. The counter posted into the
conversation on that application — *"X has countered $Y/hr with
reference to Z"* — and the previous rate message was demoted so only
the live one stood. Once they accepted, they could not reopen it. There
is nothing like this now: a rate is set by the vendor and the person it
concerns has no move.

**Interview acceptance — `accept_interview`, `schedule_interview`.**
The candidate picked and confirmed a slot, and it threaded into the same
conversation. `/api/me/pipeline` now shows proposed slots and offers no
way to answer them, which is half a feature.

**Their own expenses — `expenses`, `client_expenses`.** Submit, and see
what the client approved.

**Signing — `document_signs#upload_document`.** Upload a signed
document back.

**Structured profile — `educations`, `experiences`, `portfolios`.**
Degrees and roles as records rather than a CV blob.

Plus `legal_docs`, `designations#accept`, `subscriptions`, `addresses`,
`public_jobs#apply`.

---

## And a correction

Asked about chat this week, the answer given was that it needs a
company-wall decision before anything is built — which threads a
consultant may read, and what a vendor must be able to write privately.

The principle stands. The decision does not need making from nothing:
2017 had already made it. A conversation was **scoped to a job
application**, and the candidate was a participant in the one about
them. Not the vendor's internal notes about a person — the thread on
their own application, which is also where rate counters and interview
slots landed.

That is a narrower and better answer than the one given, and it was
available by reading the code.

---

## The lesson worth keeping

The 2017 build is described in `CLAUDE.md` as sprawl that stalled on
adoption. True of the whole, and it made the candidate portal easy to
dismiss — but 26 controllers of it were somebody working out what a
consultant needs, and that part was earned.

`LEGACY_RULES.md` covers the cycle engine, contracts, invoicing and
compliance. It does not cover the candidate portal. Read the
controllers before rebuilding a surface, not after.
