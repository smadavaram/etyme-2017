# Draft — forwarded email in the Privacy Notice and the DPA

**Status: a draft for the founder. Not live.** Nothing here is merged into
`privacy-text.ts` or `dpa-text.ts`, and neither page's "Last updated" date
moves. The legal pages change only on the founder's word (CLAUDE.md,
"Business email reaches Etyme only when the company forwards it",
2026-10-22: the notice and the DPA name forwarded email before it goes to
production). When he says yes, each block below goes into its page as
written, and both dates move to the day it goes in.

Every line states what the code does today (`src/lib/email-intake/`,
`docs/security-posture.md` section 11). One line says what is not built:
no model reads forwarded email in this build. If that changes, the line
changes with it.

---

## Privacy Notice

### Section 3, Information we collect — one new row, after "Messages"

| Category | Examples | Source |
|---|---|---|
| Forwarded email | Business email that a Customer's own people choose to forward to their company's Etyme address: the sender and recipients, the subject, the text of the message, and attached files. Only email from a person with a seat at that company, sent from their own company's address, is kept. Anything else is dropped unread and only the reason is logged | The Customer's Business Users, who decide what to forward |

### Section 3 — one new line under "What we do not collect"

We never connect to anyone's mailbox and never ask for permission to read mail. We see only the emails a company's own people forward to their company's address. A company must turn this on before anything is received.

### Section 4, How we use information — one new line

**Forwarded email.** We read a forwarded email with fixed rules to suggest what it is about, such as a job request, a timesheet approval or an invoice, and show it to the right person at that company as a draft. Nothing in an email is acted on by itself. A person says yes or no to every draft. We do not follow links in an email, and no outside service that reads text reads forwarded email.

### Section 9, Who can see information — one new line

Only people at the company that received a forwarded email can see it. Each time someone opens the text of a forwarded email, we log who opened it and when.

### Section 10, How long we keep information — one new row

| Category | When you ask to be forgotten | Period kept |
|---|---|---|
| Forwarded email | The text is deleted. A file a company kept as evidence stays with the record it supports, with your name removed from its details | The subject and text are deleted when the draft is decided, or after 30 days if nobody decides it. A file not kept as evidence is deleted with them |

### Section 11, Your rights — four words added to item 4

"…your sign-in methods, Worker profile, unsent resumes, saved Ask Etyme conversations, **the text of forwarded emails**, and any bars or favorites…"

### Section 6, Who receives information — the email row widened

| Service provider | Purpose | What it receives |
|---|---|---|
| Resend or SendGrid (where set up) | Sends email, and receives the emails a company forwards to its Etyme address | Name, email address and the message. For a forwarded email: the whole message and its files, as the company's own people sent it |

[To be confirmed by counsel: whether receiving forwarded email changes the role of the email provider, and whether the people named inside a forwarded email need a notice of their own.]

---

## DPA

### Section 3, Categories of data subjects and personal data — two cells extended

| Data subjects | Categories of personal data |
|---|---|
| Business Users at a Client | …existing text…; **business email they chose to forward to the Customer's Etyme address, with its files** |
| Named references and contacts at other companies | Name, company and contact details; **their name, address and words where they appear in an email a Business User forwarded** |

### Section 2, Nature — one phrase added

"Storage, organization, retrieval, sharing with the other companies in the same engagement, analysis for matching and compliance, **and sorting email the Customer's own people forward, by fixed rules, into drafts a person accepts or declines**"

### Section 4 — a new paragraph after 4.1, Instructions

**Forwarded email.** Etyme receives email only at an address the Customer turns on, and only from the Customer's own Business Users, sent from the Customer's own domain. Etyme does not connect to any mailbox. The text is kept as plain text, links are not followed, and nothing in an email is acted on without a Business User's yes. The subject and text are deleted when the draft is decided, or after 30 days if nobody decides it. The Customer can turn this off at any time, and replace its address, which stops the old one at once.

### Annex A — the email row widened

| Sub-processor | Purpose | Personal data it receives |
|---|---|---|
| Resend or SendGrid (where set up) | Sends email, and receives email the Customer's Business Users forward to the Customer's Etyme address | Name, email address and message content; for a forwarded email, the whole message and its files |

---

## What goes with it, the same day

- Both pages: "Last updated" moves to the day the founder says yes.
- `docs/security-posture.md` section 14: the line "The privacy notice and the DPA do not yet name forwarded email" comes out.
- `EMAIL_INTAKE_LIVE` is set on production only after this is live and the attack walk has passed.
