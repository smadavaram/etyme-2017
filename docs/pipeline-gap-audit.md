# The middle of the funnel — application to hire

Read against `legacy-app/models/job_application.rb`,
`legacy-app/models/interview.rb`,
`legacy-app/services/candidate_application_service.rb`,
`legacy-app/services/job_application_workflow_service.rb` and
`legacy-app/controllers/company/job_applications_controller.rb`.

The diamonds drew this as one box marked "submission". It was a machine.

## The states

**2017** — `job_application.rb:37`

```
applied → short_listed → prescreen → rate_confirmation
        → client_submission → interviewing → hired
                          ↘ rejected   ↘ pending_review
```

**Today**

```
SUBMITTED → SHORTLISTED → PLACED
          ↘ REJECTED  ↘ WITHDRAWN  ↘ NOT_SELECTED
```

Four states were dropped, and each one was doing a job.

---

## 1. `client_submission` — the state the whole layer cake turns on

**What it was.** Submitting somebody *to you* and you submitting them *onward
to the client* are two different events, days apart, and 2017 gave the second
its own state with three implementations
(`job_application_workflow_service.rb:27-52`):

1. The role has a parent job — duplicate the application onto the parent,
   which is a prime forwarding a sub-vendor's candidate up the chain.
2. The role carries a source email — mail it to the client.
3. Neither — fail loudly: *"No valid client email found"*.

**What breaks without it.** Every consultant's first question is "have they
actually submitted me yet, or am I sitting in a spreadsheet?" Nobody can
answer it. A sub-vendor cannot tell whether the prime forwarded them or
sat on them, which is the single most common grievance in this market —
and the hold we built assumes a submission reached the client when it may
never have left the prime's inbox.

**Missing.** No state, no timestamp, no forward-up-the-chain, no email path.

---

## 2. The rate handshake

**What it was.** Two flags on the application — `accept_rate` (the
candidate or their vendor) and `accept_rate_by_company` (the client side).
The rate is confirmed only when both are true, and *either side countering
resets both* (`candidate_application_service.rb:8-33`). `rate_initiator`
records who moved last. Once a candidate accepts they cannot counter —
deliberate lock-in, so a candidate cannot bid against themselves after
agreeing.

**What breaks without it.** We carry one number on the submission and no
acceptance at all. The consultant has no say in the rate they are
submitted at beyond their floor, there is no record of who moved, and a
negotiation that happens by phone leaves nothing behind. When the client
later says "we agreed 62", there is no answer.

**Missing.** Both flags, the reset-on-counter rule, the initiator, the
lock-in, and the rate history per application.

---

## 3. Interviews are announcements, not appointments

**What it was.** A real `Interview` record per application with date, time,
location and source, and **three acceptance flags**: `accept` (candidate),
`accepted_by_recruiter`, `accepted_by_company`. A direct application needs
two parties; one with a recruiter in the middle needs all three
(`interview.rb:17-27`). Each party accepts once, idempotently. When
everybody has accepted, the application moves to `interviewing`. Either
side can propose a new slot, which resets the others.

**What breaks without it.** We store an interview as a **notification row**
with `type='INTERVIEW'` — `submissions/[id]/interviews/route.ts:8`. Nobody
can accept it, nobody can reschedule it, it changes no state, and two
notifications for the same slot are two interviews. A recruiter cannot
answer "is this confirmed?"

**Missing.** The object, the three-party acceptance, reschedule, and the
state transition that follows from it.

---

## 4. `prescreen`

The vendor's own quality gate between shortlisting somebody and putting a
rate to them — their screening call. Small, and it is where a vendor's
judgement is recorded rather than remembered.

**Missing** entirely.

---

## 5. What the application carried that a submission does not

| 2017 field | What it is for | Today |
|---|---|---|
| `applicant_resume` | **The CV as submitted** — a point-in-time copy, not the current one | nothing |
| `cover_letter`, `message` | why this person, in the recruiter's words | nothing |
| `available_from`, `available_to_join` | notice period — the first thing a client asks | nothing |
| `total_experience`, `relevant_experience` | years, and *relevant* years — what a client filters on | nothing |
| `rate_per_hour`, `rate_initiator` | the number and who last moved it | rate only |
| `application_type` | how it arrived: direct, candidate-direct, vendor-direct, by invitation, without registration, with a recruiter, from the console | nothing |
| `recruiter_company_id` | the intermediary, distinct from the submitting company | nothing |
| `share_key` | generated on create — a link to show this candidate to somebody with no account | nothing |

The resume one matters most: a submission with no document is not a
submission a client can act on, and a *point-in-time copy* is the right
model — the CV that was sent, not whatever the person has since edited.

---

## 6. The three objects that are missing

**A shareable submission.** `share_key` was generated on every application,
so a prime could send a client a link and a client could look without an
account (`job_applications_controller.rb:248`). There is also
`share_application_with_companies` — sharing a candidate sideways. We have
document sharing with tokens; we have nothing for a submission.

**A thread per application.** Every application had a conversation, and the
messages were **typed to the workflow**: `job_conversation`,
`rate_confirmation`, `schedule_interview`, `DocumentRequest`. When a rate
was agreed, the pending `rate_confirmation` messages were flipped to
ordinary ones — the thread *was* the workflow's interface. Our
`Conversation` supports `topic='SUBMISSION'`, and nothing creates one.

**Signing at submission.** `request_sign` and `send_templates` pushed
DocuSign envelopes to the candidate at application stage — a right to
represent, an NDA — tracked by `envelope_id`. We have templates and
instances and no trigger from a submission, and no e-signature at all.

---

## 7. What we have that 2017 did not

Worth stating so none of it gets replaced on the way back:

- **The representation hold** — 2017 had no way to stop two vendors
  submitting one person to one client.
- **`decidedAt`** — how long a buyer took, as a real column.
- **Governance at award** — approval, seats, tenure, work authorisation
  checked before a placement, with a plain-English verdict.
- **A contract with cycles generated on award**, rather than a status
  change and a manual contract afterwards.
- **`SubmissionKind` computed from ownership**, never accepted from a
  client.
- **The rate band warning** from the invitation, at submission time.
- **Unconditional duplicate control.** 2017 had
  `allow_multiple_applications_for_candidate` as an escape hatch; ours is
  absolute, and the hold is what makes that safe.

---

## Order to build

1. **`client_submission`** — the state, the timestamp, and the forward. It
   is the layer cake, and without it the platform cannot answer the one
   question a consultant asks.
2. **The interview object** with three-party acceptance. Replaces a
   notification pretending to be an appointment.
3. **The rate handshake** — two flags, reset on counter, lock-in after
   accept. Small, and it gives the consultant the say the ratified rate
   decisions say they should have.
4. **The submitted CV** — a point-in-time document on the submission. Also
   closes the largest gap in the candidate audit.
5. **The fields** — notice period, relevant years, how it arrived.
6. **The thread and the share link** — the two that make a submission
   something a client can act on without an account.
7. **`prescreen`**, and signing at submission, last.
