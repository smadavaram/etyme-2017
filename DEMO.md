# The job twin in 90 seconds

A path for the founder to click, start to finish. The twin is the
program manager's helper: it reads the program every night, records what
it finds, and asks a person before anything that moves money.

**Before you start.** Once per deployment:

1. Seed the demo world: `POST /api/seed-world` with the `CRON_SECRET`.
2. Let the twin read it once: `GET /api/cron/twin` with the `CRON_SECRET`
   (it also runs every night on its own).

Northbend Athletic then holds: one contractor 60 days from the time
limit, two clean invoice receipts waiting for a yes, and one receipt
billed at 41.5 hours against 40 accepted.

## The path

| # | Do this | As | Where | You should see |
|---|---|---|---|---|
| 1 | Open the twin's question | Northbend **AP clerk** | Teams card — **needs your keys**. Until then: `/demo` → Northbend Athletic → AP desk, which lands in **Ask Etyme** | The greeting: what needs you, with two cards, "Approve invoice receipt …" |
| 2 | Press **Yes** on the first receipt's card | AP clerk | Ask Etyme | The card says it is done and recorded in the twin's ledger under your name. |
| 3 | Press **Not now** on the second, give a reason | AP clerk | Ask Etyme | The card says no, with your reason. See the note below about the mismatch. |
| 4 | Switch desk | Northbend **program manager** | `/demo` → Northbend Athletic → Program desk, which lands in **Ask Etyme** | The greeting: what needs this desk, what waits on another desk and which, who is near the time limit. |
| 5 | Open **Program twin** (Governance) and press **Why?** on "Twin recorded a time-limit warning for …" | program manager | the feed, "What the twin did" | The rule (the time limit, the warning day) and the reason in words. |
| 6 | Read the line above the feed, then the feed | program manager | same | "Acts per day in Ask Etyme": the yes and no from steps 2 and 3 counted today. Then one line per act, each saying who, which record, on whose authority, where and when — e.g. "Twin approved invoice receipt PR-2026-0441 under Program Manager authority on the web — [AP clerk] said yes, Mon, Oct 12, 9:41 AM". |
| 7 | Ask: **"Show me invoice variance by supplier this quarter"** | program manager | **Ask Etyme**, first in the sidebar (or "Ask Etyme about this program" at the top of Program twin) | A table with the figures and what they rest on. The chat is conversation's work. |
| 8 | Open **What the twin may do**, move one act (for example "Remind a person…" to *Needs approval*), give a reason, **Save** | Northbend **account owner** | `/demo` → Northbend Athletic → **Account owner** → Program twin → **What it may do** | "Saved as version 1. Earlier versions are kept. The change is in the twin's ledger." |
| 9 | Go back to **Program twin** | account owner | the feed | The top line: "[Owner] changed the twin's role contract, version 1 on the web". |

**Export.** On the feed, switch to **Table** and press **Export** for a
CSV of the ledger, as far as the reader may read it.

## What needs the founder

- **Teams (step 1).** Three keys in Vercel — `MICROSOFT_APP_ID`,
  `MICROSOFT_APP_PASSWORD`, `MICROSOFT_APP_TENANT_ID` — and the app
  sideloaded into your tenant. The steps are in `docs/teams-setup.md`.
  `/ready` shows a **Teams bot** row: MISSING until the keys are set, SET
  once they are, PROVEN after the first answer from Teams. Until then the
  web page in step 1 is the same door: Teams calls the same approval
  route the web does.
- **The conversation (step 7)** needs `ANTHROPIC_API_KEY` if its answer
  is written by the model; conversation's notes say which.

## Three things the path cannot show yet, said plainly

- **"Reject the mismatch" is not a button.** The 41.5-hour receipt fails
  the three-way check, so its only possible yes would be refused; the twin
  tells the paying desk instead of asking. In the feed it reads "Twin told
  the paying desk that invoice receipt … does not match". Step 3 rejects
  the second clean receipt so you can see a no with a reason.
- **The program manager cannot answer the twin's questions.** The twin
  asks on the program manager's authority, and nobody signs their own —
  so the AP clerk answers. The program manager reads why, in a sentence,
  under each question.
- **The program manager cannot change the role contract.** Only the desk
  holding the company's settings can (the account owner in the demo).
  If you want the program manager to own it, that is one line to change.

Known shortcuts are listed in `KNOWN-LIMITS.md`.
