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
