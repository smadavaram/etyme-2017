# The 2020 manuals, read against what exists

Two documents from the build that never shipped: a business model PDF
and a user manual. Read for the flows, which is what they were offered
for, and they do the job — the spine they describe is the spine that got
built.

They also contain something that has to be flagged rather than absorbed.

---

## The four workflows, and how they stand

The business model doc repeats one paragraph on every page, which is the
most useful thing in it:

> The complete business includes 3 workflows
> 1. Job to Hire by client, preferred vendor and Bench vendor
> 2. Contract Onboarding of customer and vendor/candidate
> 3. Timesheets to payments
> 4. Profitability

Four listed as three, which is its own small piece of evidence about the
2020 build. Checked against the routes that exist today:

| | |
|---|---|
| **1. Job to hire** | requisitions · requirements · supplier release · submissions · award — **all built** |
| **2. Contract onboarding** | contracts · onboarding · document packets — **all built** |
| **3. Timesheets to payments** | timesheets · invoices · receivables · payables · payroll — **all built** |
| **4. Profitability** | profitability — **built** |

Every spine is there. That is worth stating plainly: the 2020 model was
right about what the business is, and the current build has not drifted
from it.

Line 1 also settles a question asked separately this week — *client,
preferred vendor and bench vendor* is one workflow with three parties,
not three workflows. Which is why the stress simulation runs six
companies through one chain rather than testing each party's portal
separately.

## What the manual has that the build does not

The 2020 user manual's navigation carried a whole network surface:
Marketplace, Groups, Directory, Network requests, Received bench, Public
bench, Trainings, Products, Services, Blogs.

Almost none of it exists now, and most of it should not. Products,
Services and Blogs are not contingent workforce; a company website with a
blog is a different product wearing the same login. **Directory,
Marketplace and Groups** are the ones worth a second look — they are how
a 2020 vendor found another vendor, and nothing has replaced that.

Two are directly relevant to work in flight:

- **Received bench** — a bench somebody shared *with* you, as distinct
  from your own. `bench/share` exists; the receiving half does not.
- **Public bench** — the manual: *"all the public jobs posted by eTyme
  marketplace. Public job means all candidates can apply."* That is a
  platform-owned pool, and it is the thing the sourcing work has been
  carefully keeping Etyme out of. Worth knowing it was once the
  intention, and worth not rebuilding by accident.

One line from the manual is a requirement the current build already
meets and never wrote down: *"Client may get services of more than
company for single job."* Multi-vendor per requirement, from the
beginning.

---

## The part that is not from 2020

The PDF is two documents stapled together. After the Etyme material it
carries a **Business Requirements Document for "Contract.Stream", dated
February 19 2025**, and that document is not compatible with the one this
project is built on.

| Contract.Stream BRD | `CLAUDE.md` and the Master BRD |
|---|---|
| "AI Matching Engine (**Core Technology**)"; "AI-powered recommendations" as goal 4 | *"Never lead with AI. It is in there, it does real work, and it is the least defensible thing in the product."* |
| A marketplace, on the "Airbnb model", with instant booking | The system of record for contingent workers |
| Phase 1 is "Marketplace Foundation" | Phase 1 is company formation, roles, bench, standalone assignment |
| Success is transaction volume and time-to-fill | The wedge is **tenure** — *"Efficiency pitches lose to 'we are managing fine'"* |

Source of truth is `/spec/Etyme_Master_BRD_v3_7_FINAL.docx`, a **frozen
baseline** where amendments require a change log and never a rewrite.
Contract.Stream is not an amendment to it; it is a different product with
a different name, and quietly reading it as guidance is precisely the
drift `CLAUDE.md` describes when it recounts the landing page saying the
wrong thing for a week.

So nothing from that half has been treated as instruction. If it is meant
to supersede the Master BRD that is a decision to take deliberately, in
writing, with the change log the baseline asks for — not one to arrive
through a PDF read for its flow diagrams.

## What was not readable

Both documents are mostly screenshots. The manual's 483 paragraphs are
captions and headings around images; the PDF's content streams are
images and embedded fonts. The flows above come from the table of
contents, the repeated header, and the prose between figures.

The two diagram links in the PDF — a MindMup use-case map and two Visio
files on Google Drive — were not opened. If those are still reachable
they carry the actual role-and-activity detail the prose only gestures
at, and they would be worth more than either document.
