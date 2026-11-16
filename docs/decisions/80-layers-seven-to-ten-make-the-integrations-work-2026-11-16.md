## Layers 7 to 10: the integrations Etyme claims must work — 2026-11-16

**What he said.** On 2026-11-16 the founder defined Layers 7 to 10 of the
fix list of 2026-11-14 (record 72). Their theme is stabilizing the
integrations. Every connector Etyme claims or scaffolds must:
- actually work;
- fail where a person sees it, never silently;
- write everything to the record and the journal.

The loop is the same as for Layers 1 to 5. Each layer ships on its own
and is retested on Tapin before the next one starts. Layer 6 (record 79)
runs beside these layers as its own batch. Stabilization is the priority
track.

**Layer 7: security and sign-in.**
- Finish the identity build order: client tenants sign in only through
  their own directory (Entra first, then SAML and OIDC), with SCIM
  removal, groups mapped to roles, and no back door.
- Close and prove the sign-in leak. A sign-in at one firm marked every
  invited seat at every firm as signed in. It was fixed on 2026-11-16
  (record 78), and Layer 7 proves it on Tapin.
- Approving anything that moves money asks for a second check inside
  Etyme.
- Bank details change only through the in-app flow, with:
  - a check outside the app;
  - a second approver;
  - a waiting period before the change takes effect.
- Personal data is masked by default.
- Uploads are scanned, and quarantined when they fail.
- The security ledger is append-only.
- A setting that is recorded but not enforced (for example Walls) either
  enforces, or says so at the control.

**Layer 8: outreach doors and the storefronts.**
- The doors the home page advertises work: Teams, Google Workspace and
  Chat, WhatsApp (a contact route for small firms and individuals), and
  distribution to LinkedIn and Dice.
- Profiles and roles go out through these doors. Responses come back
  into the record as submissions and candidates, never as a side email.
- Each email shows its delivery state. Sent is not delivered. Bounces,
  and emails never sent, show on the message.
- The Layer 6 storefronts stay fed and truthful from these doors.
- Notifications: 1,500 free, then upgrade.

**Layer 9: accounting.**
- Build the mapping layer that the Integrations page only scaffolds.
  Today one accounting system is "selected" with nothing mapped, the
  others are unmapped, and export is disabled.
- The founder ruled it ERP-agnostic. Etyme sends a structured, coded feed
  that any accounting system can read: vendor number, GL, company code
  and external IDs, by API, webhook or structured export. It is never a
  connector to one vendor.
- Invoices take one of two paths:
  - *With a PO:* the invoice is matched to the PO, and a mismatch is held.
  - *Without a PO:* the invoice is raised against approved timesheets or
    the engagement, and goes through its own approval path.
- Every invoice line carries the client's cost object, stored as a type
  and a value and exported coded, never as free text. The cost object is
  a cost center, an internal order, a WBS element, a project code, or
  just a material code.

**Layer 10: operations.**
- Records from ServiceNow, Slack, Jira boards and timesheet apps land on
  the Etyme record with their status, hours, approver and timestamp. They
  are journaled, duplicates are detected, and a failed sync shows on the
  record.
- An approval that genuinely happened outside Etyme may be attached as
  screenshot evidence. It is marked as screenshot evidence with who
  supplied it and when, and never shown as an approval made in Etyme.

**Asked of the founder before each layer starts.** Each question is read
against a standing rule:
1. Must a client company use its own directory, when today each company
   chooses its sign-in mode? And what of a small client that has none?
2. Scanning uploads needs an outside service. May one be added?
3. Which second check before approving money: an authenticator app or a
   passkey? Etyme never claims a check it cannot confirm.
4. LinkedIn is a sign-in door for candidates only, and no other data
   from it is used. Bringing replies back from it changes that rule.
5. What does "upgrade" after 1,500 notifications lead to, while the
   price waits for five real suppliers? Or does the cap only warn for
   now?
6. Only the worker files hours. Do hours from another app arrive as a
   draft week she confirms, or as evidence beside her week?
7. Invoices without a PO still pass the one payment gate. The new
   approval path is money logic, so it is asked about, never guessed.
8. An outside system is named only as a label on a setting a customer
   picks, never in a page's prose.

The founder's two open decisions are untouched: the first pay-period
Sunday, and the overtime hold for W-2 weeks over 40 hours outside the US.

### Update, the same day: the full spec, the stability bar, and paperwork signing

**Order.** Layer 6 runs in parallel with Layers 7 to 10. It is not
queued after them. Stabilization is the priority track. Layer 6 ships as
its own batch and must not destabilize it.

**The stability bar.** The founder's words: *"Give it SAP-like
stability."* Every integration in Layers 7 to 10 behaves like a
monitored interface:
- every message or event has a status a person can see on the record;
- nothing is lost silently;
- a failure sits in an error state a person can see, and can be
  reprocessed;
- a duplicate is detected, never posted twice;
- the journal answers "what happened to this invoice, timesheet or
  envelope" end to end.

An integration that cannot meet this bar never ships as "connected". It
ships labeled as what it honestly is.

**The spec, as he gave it** (verbatim from the fix list):

> Theme: STABILIZING the integrations — connectors Etyme already claims or
> scaffolds must actually work, hold under real use, fail visibly (never
> silently), and write everything to the record/journal. Not new-feature
> invention. Each layer ships and is retested on Tapin on its own.
>
> Layer 7 — Security & authentication: client tenants SSO-only via their
> IdP (Entra first, then SAML/OIDC, SCIM deprovisioning, AD group → role
> mapping, no Gmail/magic-link/password back door); invite-only Track 2
> stays internal/small-supplier only. Close and prove per-tenant the
> sign-in leak (sign-in marking every invited seat at every firm).
> Bank-detail changes only via in-app flow with out-of-band verification
> + second approver + cooling-off; money-moving approvals require step-up
> auth inside Etyme; PII masked by default with guarded exports; uploads
> scanned/quarantined; append-only security-event ledger; settings that
> record-but-do-not-enforce (e.g. Walls) must enforce or say so at the
> control.
>
> Layer 8 — Marketing integrations + the storefronts: stabilize the doors
> the homepage advertises — Teams, Google Workspace/Chat, WhatsApp
> (contact route for small business / individuals / non-enterprise),
> LinkedIn and Dice distribution. Profiles/roles go OUT through them;
> responses/leads come back INTO the record as submissions/candidates,
> never side-channel email. Resend delivery state visible per
> invite/message (sent ≠ delivered; bounces and never-sent show). Layer 6
> storefront templates are fed and kept truthful by these integrations.
> Notifications: 1,500 free, then upgrade (subject to clash question 5's
> answer).
>
> Layer 9 — Accounting: build the mapping layer the Integrations page only
> scaffolds (today QuickBooks "selected" but nothing mapped;
> SAP/Oracle/Workday/NetSuite/Xero/CSV unmapped; export disabled).
> ERP-agnostic: a structured, coded feed any ERP/accounting system can
> consume (vendor number, GL, company code, external IDs; API/webhook or
> structured export) — not a single-vendor connector. Two invoicing paths:
> PO-based (invoice matched to the PO, mismatches held, never silently
> paid) and non-PO (invoice against approved timesheets/engagement, its
> own approval path). Every invoice line carries the client's cost object
> — cost center, internal order, WBS element, project code, or just a
> material code — stored as type + value and exported coded, not free
> text.
>
> Layer 10 — Operations: ServiceNow, Slack, Jira boards and timesheet apps
> land on the Etyme record (status, hours, approver, timestamp),
> journaled, duplicates detected, failed syncs visible on the record.
> Screenshot approvals: an approval that genuinely happened outside Etyme
> can be attached as screenshot evidence — marked as screenshot evidence
> with who supplied it and when, never presented as an in-system approval.

**Layer 10 addition: paperwork signing.** The founder's words: *"some
people want DocuSign for paperwork — or similar apps like that."*
- Etyme builds no signing of its own.
- Signature paperwork routes through the e-signature app the client
  already uses, chosen per tenant. This covers contracts, MSA and SOW,
  NDAs, onboarding packets and paperwork requests. It is the same
  plug-into-their-stack pattern as Layer 9's accounting feed.
- The envelope goes out from the record.
- Its status (sent, viewed, signed, declined) journals back onto the
  record.
- The signed document and its completion certificate land on the record
  as the filed paperwork. They drive the placement's "on file" state,
  through the one reader of what is on file.
- A client with no e-signature app keeps the existing document-request
  link.
- The app is named only as a label on the tenant's setting, never as a
  claim on a public page.

**Not answered here.** The eight questions above are with the founder.
Nothing in this update answers them. Where the spec's own words bear on
one (the client sign-in rule and question 1), the question still stands
until he answers it. His two pay decisions remain untouched.

### The founder's answers to the eight questions — 2026-11-16

1. **Client sign-in (Layer 7). Yes.**
   - A client company must use its own directory where it has one.
   - A small client with no directory gets invitation-only access, scoped
     to its own view.
   - No client gets a password or magic-link back door.
2. **Upload scanning (Layer 7). Yes, one outside scanning service.** It is
   named in Settings, and each use of it is written to the ledger.
3. **The second check before approving money (Layer 7).**
   - A passkey first, with an authenticator app as the fallback.
   - It applies to approvals that move money and to changes of bank
     details.
4. **Jobs to the professional network and the job board (Layer 8). Yes,
   scoped.**
   - Only replies to Etyme's own job postings come back.
   - They land as candidate records, with consent.
   - No other data from that network is used.
5. **The 1,500-notification cap (Layer 8). It warns for now.**
   - The count is visible, and a warning shows at the cap.
   - Nothing is blocked.
   - The "upgrade" gate waits until a price exists. Free while testing
     governs until then.
6. **Hours from timesheet apps (Layer 10).**
   - They arrive as a draft week that the worker confirms.
   - Her confirmation is her filing, so "only the worker files hours"
     holds.
7. **Invoices without a PO (Layer 9).**
   - They pass the same single payment gate as every other invoice. There
     is no second, weaker path.
   - The approval before that gate is the engagement owner's, made
     against the approved timesheets.
8. **Naming outside systems. Confirmed, with one carve-out.**
   - Accounting, ERP and operations systems are named only as labels on a
     setting a customer picks, never on a public page.
   - The chat doors (Microsoft Teams, Google Chat, WhatsApp) stay named on
     storefronts. They are entry doors the tenant offers, not claims of
     an integration.

The founder's two pay decisions stay untouched.
