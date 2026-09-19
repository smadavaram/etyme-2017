# UX stress test — 2017 against what we have now

Written to find what the new direction broke, not to justify it.

---

## The core finding

The 2017 application was built for **operators doing volume**. The new design is built for **owners reviewing exceptions**. Both users are real, and right now only one of them can work.

Every screen in the new design has been drawn at n=3. A staffing vendor with 47 consultants is survivable. Infosys with 400 in a practice is not. The 2017 UI was ugly and complete; the new one is considered and incomplete. That is a worse trade than it sounds, because ugly-and-complete ships revenue and considered-and-incomplete demos well.

---

## What 2017 had that the new design has lost

| Capability | 2017 | Now | Cost of the loss |
|---|---|---|---|
| **Search on every list** | Ransack across name, skills, title, description | Nothing, anywhere | A recruiter cannot find a named consultant. Fatal above about thirty records. |
| **Sort and filter** | Datatable headers, per-column filters | Fixed order chosen by the system | You can see what the model ranked first. You cannot ask a different question. |
| **Pagination** | Server-side, 25 a page | Every record rendered | 400 bench cards will hang the browser. |
| **Bulk actions** | `temp_candidates` array — submit many to one requirement, errors collected per candidate | One at a time | Bench sales submits in batches. This is the daily motion and it is gone. |
| **Create and edit forms** | Full CRUD on every entity, nested attributes, six document-set models | Almost none. Two text inputs in the whole demo. | You cannot add a consultant, write a contract, or correct a rate. |
| **The plus button** | Global quick-add: Master, Offerings, Orders, Receivables | Dropped in the latest build | Creation has no entry point at all now. |
| **Export** | Datatable export | None | Client reporting and QBRs run on spreadsheets. Every vendor will ask on day one. |
| **Information density** | Twenty-five rows visible at once | Three or four cards | Scanning is a core recruiter skill. Cards make it impossible. |

---

## What the new design has that 2017 never did

| Capability | Why it matters |
|---|---|
| **Reasoning disclosure** | Every score opens to show its factors, its basis, and what it could not account for. 2017 gave a number with no provenance. This is the strongest thing in the new design. |
| **Calibrated confidence** | A 44 percent flag labelled low confidence, with the reason: six weeks of history. 2017 asserted; this one qualifies. |
| **Prioritisation over enumeration** | Requirements ranked by expected value including avoided bench burn. 2017 gave you a list and left the judgement to memory. |
| **Direction made explicit** | Sent against received, my client against a partner's, my bench against network bench. The 2017 data model knew this; the UI never showed it. |
| **Role-scoped figures** | Bench cost hidden from recruiters. 2017 showed everything to everyone with a login. |
| **The consultant as a party** | Control over who may market them, a rate floor, submission history. 2017 treated candidates as inventory. |
| **Mobile as a decision surface** | 2017 was desktop-only in practice. |
| **Prose that explains** | "Margin fell because network placements grew from a fifth of the book to over a third." No 2017 screen ever told anyone why. |

---

## Where the new design breaks under load

**Volume.** The queue model assumes three decisions. At forty it is a slog with no triage, no filter, no way to say *show me only rate approvals*. Prioritisation helps until the list is long enough that prioritisation itself needs filtering.

**Scanning.** Serif numerals are beautiful and genuinely worse in columns — they lack tabular figures, so digits do not align vertically. A finance user comparing forty invoice amounts will hate it. Editorial type belongs on headlines and hero figures, not inside dense tables.

**Reading cost.** Explanatory prose is excellent the first time and friction the fortieth. A recruiter who sees the same paragraph every morning stops reading it, and then stops reading the one that changed. Explanation needs to be progressive — a line by default, the paragraph on demand.

**Undo.** The principles page promises most actions can be undone. That is a genuine engineering commitment — reversing a distributed requirement means retracting invitations vendors may already have acted on. Either scope it honestly or do not promise it.

**Missing states.** No loading, no error, no permission-denied, no partial-data, no offline. The demo only ever shows the happy path with complete data. Real staffing data is missing half its fields.

**Creation.** There is no path from nothing to a consultant record, a requirement, a contract, or an invoice. The entire application currently assumes the data already exists.

---

## The resolution

Not a compromise between the two. **Two surface types, each with its own rules.**

| | Decision surfaces | Working surfaces |
|---|---|---|
| Examples | Yours to decide, rolloff fan-out, rate approval, internal supply gate | Bench, requirements list, timesheets, invoices, contracts, documents |
| Governed by | The new direction — prose, reasoning, confidence, calm | The 2017 direction — tables, search, filters, bulk, density |
| Volume | Three to ten items | Hundreds |
| Frequency | A few times a day | Constant |
| Typography | Serif headlines, generous space | Tabular figures, tight rows |
| Success | The user decides well and leaves | The user finds and acts fast |

The theme stays the same in both — warm canvas, ink, one blue, clay for attention. What changes is density and voice. A table on bone paper with proper tabular figures is still unmistakably the same product; it is simply doing a different job.

---

## What to fix before any of this is built

1. **Put search back.** Every list. Before anything else.
2. **Restore the plus button** with its four sections. Creation currently has no door.
3. **Design the working-surface table** — dense, sortable, filterable, paginated, bulk-selectable, exportable — in the new theme. One component, used everywhere.
4. **Bring back batch submission.** The 2017 `temp_candidates` pattern with per-item error collection was correct.
5. **Progressive explanation.** One line by default, the reasoning on click. Never a paragraph by default on a screen seen daily.
6. **Tabular figures inside tables.** Keep the serif for headlines and hero numbers only.
7. **Scope the undo promise** to what will actually be built, and say so on the principles page.
8. **Draw the missing states** — loading, error, empty, partial, denied — before drawing another feature.

---

## The uncomfortable summary

The 2017 application could run a staffing company badly. The current design could not run one at all. What it does instead is explain, prioritise and constrain better than anything in this market — which is worth a great deal, but only once it is sitting on top of an application that can also list, search, create and export.

Build the boring half. Keep the new half for the moments that deserve it.
