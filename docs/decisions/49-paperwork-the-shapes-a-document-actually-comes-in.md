## Paperwork — the shapes a document actually comes in

From the founder, 2026-09-16, and written down because it is trade
knowledge the code was guessing at. Every row is a real document a
staffing firm handles, and the columns are the properties that differ.
**In contracting and staffing these are not filing; they are business
continuity.** A lapsed certificate stops a supplier working, an expired
work authorization stops a person working, and neither fails loudly on
its own.

### Who renders the verdict — decided 2026-09-22

From the founder, and it is a liability rule before it is a product rule:

> Ultimately background check companies are the ones that confirm
> background pass or fail — the risk is passed there to background check
> companies; our job would be to collect all info and pass it to them to
> verify in today's market.

So paperwork divides once more, underneath the three purposes:

- **A document somebody else issued, which we hold and read.** An
  insurance certificate, a visa, a green card, a degree. The insurer,
  the government or the university made the assertion; a desk reading
  the dates off it and recording them is honest, and that is what
  supplier onboarding does when HR verifies a certificate.
- **A verdict a third party renders about a person.** A background
  check, a drug screen, a sanctions and litigation screening, an
  education verification. Sterling or HireRight says clear or not clear,
  on their letterhead, and carries the professional liability for that
  opinion. **Etyme never renders that verdict and no desk in Etyme
  renders it either.** The job is to collect the consent and the
  identifiers, pass the package to the provider, and record what came
  back — verbatim, with their name, their reference and their date on
  it. A reader must be able to tell "Sterling said clear on 12 March,
  reference 4471" from "somebody here ticked a box", and a screen never
  says Etyme verified a check.

**What does not transfer, and it is the trap in the sentence.** The
verdict is theirs; the *process* stays with the employer. Under US law
the firm ordering the check owns the consent and the disclosure before
it, and the adverse action steps after an unfavourable result — the
pre-adverse notice, a copy of the report, a waiting period, the final
notice. A product that reads "the provider decides" as "we have no
process left" drops exactly the step that generates lawsuits. Passing
the verdict on does not pass the paperwork around it on.

**What this means for the loop built on 2026-09-21.** A chase letter
must not tell a worker to upload her background check as though it were
a paper she holds — the report goes to the firm that ordered it, not to
her. What she owes is her consent and her identifiers. The required set
can ask for either; the sentence has to know which it is asking for.

### The list is not the domain — the purpose is

Corrected by the founder the same day, before anybody built to the table
below: *"companies can have more documents they would need on — some for
compliance, some for agreement and some for proof."*

So the seven documents in the table are **examples of the shapes, not the
set of types**. Any client or supplier will need types nobody here has
heard of, and they must be able to add one without a migration or a
release. A fixed enum of document kinds is wrong the first week a client
asks for a drug screen, a security clearance, a works council
notification or a client-specific code of conduct.

What is fixed is the **purpose**, and the purpose is what decides
behavior:

| Purpose | Behaves like | Examples |
|---|---|---|
| **Compliance** | has a validity window, watched for expiry, blocks or warns, gets chased | I-9, insurance, licenses, background checks, good standing |
| **Agreement** | signed — possibly by both sides — has a term, amended and versioned | MSA, NDA, statement of work |
| **Proof** | attached as evidence, usually never expires, supports something else rather than standing alone | degrees, transcripts, certifications |

**That is roughly the split the four models already fell into**, which is
the useful part of the finding: `Verification`/`VerificationDoc` is
compliance, `DocInstance`/`DocTemplate` with `MasterAgreement` is
agreement, and attachments are proof. They were not arbitrary — they were
three purposes nobody had named. `DocumentPacket`/`PacketItem` is
orthogonal to all three: it is the request-and-collect mechanism, and any
purpose can be requested through it.

So the five properties below are **declared by a type**, not hardcoded
per document. A type says whether it has a start, an end, or neither;
whether it is signed and by how many sides; whether it is reissued and
so has an edition; and what other types it needs behind it. The I-9 is
then the first type that happens to say "reissued: yes", rather than a
special case in the code.

Defaults ship, because CLAUDE.md says default aggressively and zero
training means nobody defines an I-9 before they can hire. A company
extends and renames from there.

| Document | Valid from | Valid until | Signed by | Supplied by |
|---|---|---|---|---|
| **Master service agreement** | yes | yes | **both parties, countersigned** | the two firms |
| **Visa** | — | yes | — | the government |
| **I-9** | — | see below | the worker and the employer | the worker |
| **License, green card, passport** | — | usually | — | the worker |
| **Education documents** | — | **never expires** | — | the candidate |
| **Certificate of insurance** | **yes** | yes | — | the supplier |
| **Certificate of good standing** | **yes** | yes | — | the supplier |

Five properties fall out of that table, and no single model in this
codebase holds all five:

1. **Validity is three shapes, not one.** No dates at all (a degree
   certificate is true forever). An end only (a visa runs out). A start
   *and* an end (insurance cover, a certificate of good standing) —
   and the start matters, because cover that begins next month does not
   cover a person starting this week. `Verification.expiresAt` already
   says "null = permanent (e.g. education evaluation)", which is the
   right instinct; it has `issuedAt` and nothing reads it as a floor.
2. **A signature can need two sides.** An MSA is not executed until both
   firms have signed, and the date that matters is the later of the two.
   `MasterAgreement` learned this on 2026-09-16; `DocInstance`, which is
   what an NDA or a signed contract uses, has no concept of a
   countersignature and no dates at all.
3. **The form itself has an edition.** The government reissues the I-9
   every year. Which edition somebody signed is a fact about the
   document, and an old edition is not a small problem — it is the
   finding in an audit. Nothing here records a form version.
4. **A document can require other documents.** An I-9 is not proof of
   anything on its own; it is a form that must be backed by evidence of
   the right to work — a license, a visa, a green card. So a "held"
   I-9 with nothing behind it is not held. This is composition, and no
   model expresses it.
5. **Who owes it differs, and that decides who is chased.** A candidate
   attaches their own education documents. A supplier produces its own
   insurance — and a firm asks its **sub-vendor** for theirs, which is
   why the certificate shows up in supplier onboarding rather than in
   somebody's personal file.

### Where a document lives — on the line, on the side it protects

**Decided 2026-09-18, by the founder**, the morning the order became a
header and its lines:

> Compliance should live in sell and buy contracts. The MSA from the
> client or customer is signed by the company that is supplying
> contingent talent. Similarly the employee contract or MSA, NDA, NCA
> and the build of HR documents — visa as attachment, background
> verification — or company insurance and good-standing certificate for
> a supplier will all live on the buy contract side.

So paperwork attaches to the **line**, on the side of the trade it
protects:

| Line | Carries | Because |
|---|---|---|
| **Sell** — bills the customer | the customer's paper the firm signs as its supplier: the MSA, and the customer's compliance line inherited from the header | it is what the customer may hold the firm to |
| **Buy** — pays the supplier or runs payroll | everything about the party the firm pays: an employment contract or the sub-vendor's MSA; NDA, NCA; visa, background check, licenses; for a supplier, its insurance and good standing | it is what the firm may hold *them* to, and what stops the money if it lapses |

This is the "two greens" gate at station 5 stated as data. Candidate
green and company green are both **buy-side** facts — the person and
the firm being paid — and the header carries the customer's required
set, so a hospital role and a warehouse role under the same MSA can
demand different things and each line knows which.

**What this does and does not move.** Evidence stays where it is: a
person's I-9 is the person's (`Verification`), a supplier's certificate
is the company's, and copying a passport onto every placement would be
the duplication this whole section exists to end. What moves to the
line is the **requirement and the verdict** — which documents this line
needs, from whom, and whether it is green. `DocInstance` already hangs
off both `SellContract.docs` and `BuyContract.docs`, so signed papers
have a home.

**What a line requires now exists. Landed 2026-09-21**, on the
founder's instruction: *"Ensure the loop of documents never cracks
between parties."* `DocumentRequirement` carries one row per document
per owner, and the owner is exactly one of three — the order (the
buyer's default set, inherited by every line under it), a sell line, or
a buy line. A line with none of its own reads its order's; a line on no
order at all falls back to the default for its shape, computed from
`lib/document-type` for a W2, a corp-to-corp and a sub-vendor. The
default set is a **floor** rather than a starting point: an order adds
to it, and nobody orders their way out of a federal form. A line may
override one item and the override says who and why; a waived item
stays on the list, marked, with the reason and the name, because
Addendum E says WARN, capture a reason, proceed and never silently
permit — and work authorization cannot be waived at all, a waiver
against one being refused rather than honored quietly. `owedBy` is a
party role — WORKER, SUPPLIER, CUSTOMER, US — and never a `personId`,
so a line whose subject is not a person still carries a set. One door,
`lib/document-requirements`, and it materializes nothing: a required
set frozen into rows on the day a line was created is a set that cannot
learn. `DocInstance` gained dates, an edition and a countersignature in
the same change, so an NDA can be watched the way a certificate is, and
a certificate of good standing now blocks the way lapsed cover does.
What is **still owed** is the rewiring: `lib/contract-clearance`,
`lib/packets`, `lib/outbound-pack` and `lib/supplier-onboarding` each
still carry their own list and must read this one instead, which is
`etyme-regulatory`'s next piece of work; the lapse letters, per party,
are `etyme-conversation`'s. Until that lands the table is written by the
seed and read by its own door, and nothing that computes a verdict today
has changed meaning.

### Work authorization is checked where the work is done — decided by the founder, 2026-11-03

The founder, asked what happens when a candidate turns out to have no
work authorization after three interviews: *"Especially for the onsite
jobs — offshore jobs is fine."* So the question is never "is this person
authorized" in the abstract; it is "authorized where this job's work is
done". The record already holds the three facts the rule needs: the
job's work mode (`Requirement.workMode`: ONSITE · HYBRID · REMOTE), the
site's country (`CompanyLocation.country` through the job's site), and
the country the person works from (`ConsultantProfile.country`).

- **An onsite or hybrid job checks the site's country.** A US site asks
  the two lawful screening questions in words (authorized to work in the
  US; sponsorship needed now or later), **records the sponsorship answer
  as a field** rather than words on the packet, and says it at
  put-forward where the job lawfully offers none ("Priya said she will
  need sponsorship; this job offers none"), so the interview is never
  booked. The start still refuses without the I-9, and work authorization
  still cannot be waived.
- **A remote job worked from the person's own country is offshore, and
  asks nothing about the site's country.** An engineer in Pune working
  for a client in Ohio through an Indian supplier needs no US
  authorization and completes no I-9, because she is not employed in the
  US. What the start needs is the work country's own set, and that set
  is regulatory's to confirm with its source before it is enforced
  (today the gate asks every placement for an I-9 or a right-to-work
  check, which is wrong for an offshore line and is the first thing this
  changes).
- **A remote job worked from the site's country is onsite for this
  purpose.** Remote from Austin for a client in Ohio is US work.
- **The lawful-basis rule stands**: a job refuses a person over status
  only with a recorded basis (export control, a federal contract clause,
  a clearance, a statute, no sponsorship offered); without one it warns.
  "No sponsorship" never turns away somebody who needs none.
- **What was found, so it is not re-derived:** until this day the
  screening answer was kept as words on the packet item
  (`WORK_AUTH_QUESTION`) and nothing read it, so a candidate who said
  "I will need sponsorship" could be interviewed three times for a job
  that offers none, and nobody was told until the award refused the
  start; and the put-forward warning read only the papers on file (an
  I-9 or a right-to-work check), so it fired for nearly everybody not
  yet employed and told the submitter nothing about sponsorship.
- **Built in the wave after the 2026-11-03 deploy, in this order:** the
  work country of a job and of a line, read from the three facts above
  (demand, with architect if a column is needed); the sponsorship answer
  as a field and the put-forward sentence (demand); the start gate and
  the required set per work country, confirmed with a source before any
  is enforced, and the offshore line's set (regulatory). The simulation
  gets an offshore chain so "horizontal, never vertical" is proven on it.

### A degree is read, not just held, and a year that does not look right is said — decided by the founder, 2026-11-03

The founder, the same hour: *"Also negative tests on education — year of
graduation — when something doesn't look right."* Today a degree is a
file and nothing else: `DEGREE` is a verification type with no
institution, no qualification and no year on it, `EDUCATION_EVALUATION`
is a provider's verdict, and no rule reads either. "On file" is the
whole check. So:

- **A degree is recorded with its fields**, the way a license carries
  its number, issuer and expiry: the institution, the qualification, the
  name on it and **the year of graduation**, read by rules first, by the
  model only where the company turned it on (masked, logged, each value
  shown with the quote it came from) and confirmed by a person before it
  is recorded. The copy stays on the person's record as before.
- **Education stays proof, not compliance** (the purpose table above):
  nothing about a degree blocks a start. When something does not look
  right the record **warns, says why in a sentence beside the paper, and
  HR decides** — ask for the transcript, send the package to an
  education-verification provider, or send the paper back with the
  reason. Etyme renders no verdict on a degree; the provider does
  ("Who renders the verdict").
- **What "does not look right" means, as rules, each a sentence on the
  screen:** the year is in the future; the year is before or after what
  the person's own résumé says for the same degree; the name on the
  certificate is not the person's; the institution is not the one the
  résumé names; the same file was already filed for a different person;
  a qualification the job requires (a nursing degree for an RN role) is
  not the qualification on the paper. A degree a provider has verified
  (`EDUCATION_EVALUATION` with name, reference and date) clears every
  warning on that degree. Date of birth is not held and is not asked
  for this; age is never a check.
- **Negative cases in the documents matrix.** The both-ways matrix
  (regulatory, `scripts/simulate/stages/regulatory/doc-matrix.ts`) gains
  education: a degree attached with every field right (accepted); a
  future year (warned, HR told why); a year the résumé contradicts
  (warned); another person's name (sent back with the reason); a file
  already filed for somebody else (warned, both names said to HR only);
  a provider's verdict clearing a warned degree; and the worker told, in
  words, what was asked and why. Each proven through the real routes and
  then pressed on screens by the walk.
- **The degree is the person's, uploaded once, read as fully as it can
  be, and kept for good. The founder, the same hour:** *"Why can't
  people upload degree and we extract as much details — the record is
  permanent for candidate."* So: the person uploads it from their own
  page (the copy is already kept on their record since 2026-10-27);
  everything on it is read, not four fields only: the institution, the
  qualification and field, the year, the name, honors, the certificate
  or registrar number, the date it was issued, each shown with the
  quote it came from and confirmed by the person. **For a paper a person
  uploads to their own record, the model reads it on the person's own
  yes**, asked once at the upload ("Read the details from this document
  for you?"), masked and logged like every other read, rules first
  always; a company's switch governs a company's papers, and this one is
  the person's. **Once confirmed, the facts and any provider's verdict
  stay on the person's record permanently**: a degree never expires,
  so the next firm and the next client read it by the person's one
  click (the apply form's reuse), it is never asked for twice, it does
  not belong to a firm the person leaves, and every read of it by a
  firm is logged like any other read of a person's paper. A verified
  degree shown as verified to the next client is the first piece of
  the moat said in "Tenure is the moat": one person's papers across
  every supplier, which no VMS and no supplier can produce.
- **Candidate and supplier fraud: collect and forward, and say what the
  record itself can see. Corrected by the founder the same hour:** the
  "fraud module" he asked about was never about money; it is **a wrong
  candidate or a wrong supplier**, a proxy who is not the person
  interviewed, a borrowed identity, a padded résumé, a shell firm, a
  borrowed certificate. The rule to start with, in his words: *"At this
  point we collect and forward to background check company to
  verify."* So the verdict on a person is the background-check
  provider's and the verdict on a firm is Procurement's and HR's
  qualification (references, the D&B report, the sanctions and
  litigation screening, the insurance certificate, good standing), both
  recorded verbatim with who said it, reference and date; Etyme renders
  neither. What Etyme itself says, because it is the only party that
  can see it, is what the record shows against itself: a degree year
  the résumé contradicts, a name on a paper that is not the person's,
  the same file filed for two people, one person arriving twice through
  two suppliers (the Duplicate check page, `/dashboard/identity`, which
  confirms and never merges), a firm's tax number already on another
  firm, an insurance certificate whose dates do not cover the start,
  and the one question at the start: the hiring manager confirms the
  person who started is the person interviewed, yes or no on the start
  card, recorded with who said it. Each is a sentence to the role that
  decides, with one click to send the package to the provider; none is
  a verdict and none blocks except where the law blocks. It is called
  verification on every screen and is in the record for everybody;
  whether any of it is priced is the founder's decision when prices
  are set, and nothing a supplier reads says "fraud" or reads as aimed
  at it.
- **Built in the wave after the 2026-11-03 deploy**, beside the
  work-country piece: the degree's fields and the rules (regulatory,
  with the schema request to the architect for the four fields on the
  verification), the résumé's own education lines as the thing a degree
  is checked against (supply, which owns the consultant's page and
  parse), the warning's wording to HR and to the worker (conversation).

**Four models overlap here and none is a superset:** `Verification` and
`VerificationDoc` (the person's compliance evidence, expiry watched by
`cron/watch`), `DocInstance` and `DocTemplate` (papers sent for signature,
no dates), `DocumentPacket` and `PacketItem` (a request with a link
window, where `validUntil` is the link's life and not the document's),
and `VisaPetition` (its own lifecycle and its own watch). They were built
one at a time for one need each, which is why the same certificate can be
represented three ways.

Do not unify them in one pass because the table above is tidy. Do use
the table as the test: a change to any of the four is wrong if it makes
one of the five properties harder to express.
