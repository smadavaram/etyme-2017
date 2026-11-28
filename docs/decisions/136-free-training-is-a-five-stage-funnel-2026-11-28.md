# 136. Free training is a five-stage funnel — 2026-11-28

The owner: "Turn free training into funnel to gather user info." Specified
by Pax (architect). The /start lead capture is stage 1. The data for all
five stages is modelled now, even where later stages ship later.

1. **Door** (/start): "What are you?" (Worker, Recruiter, Fresher, Kid), the
   routed track and an email. Nothing else. Consent wording on the capture.
   Kid: a parent's or guardian's email only; no record for a minor.
2. **Learning:** on sign-in, the name, progress and lesson completions land
   on the person's record; browser-only progress carries over.
3. **Completion:** badge, credential page and the learner's own LinkedIn
   share. The share is ledgered; it is the distribution.
4. **Join:** the full profile (skills, location, the work wanted, resume and
   documents) becomes the bench record. This is the funnel's payload; every
   earlier stage exists to earn it.
5. **Match:** consented profiles are visible to firms and recruiters per the
   record's consent fields. Measured as cost per qualified, consented resume
   and cost per activated tenant.

Rules:
- Capture is progressive: a later stage's question is never asked at an
  earlier stage.
- Consent is a record field at every stage.
- Lane C data (tax ID, bank details, social security number) is never
  gathered through the funnel. It belongs to a later tenant relationship,
  masked.
- Every stage writes to the one ledger.
