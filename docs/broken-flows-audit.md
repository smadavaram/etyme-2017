# What is built, and where it snaps

Every readable API route probed as five different people, all forty screens
loaded, and one placement created from scratch in the product rather than
in the seed. 325 probes, no server errors, nine broken flows.

Map: the same findings drawn as two diagrams, published as an artifact.

## Built

| | |
|---|---|
| API routes | 121 |
| Screens | 40 |
| Tables | 75 |
| Rule modules | 62 |
| Tests | 1,885 |

Identity and access · demand · supply · the money chain · governance ·
the walls · public surfaces · integration.

## The nine

### Stops the product working

**1. A vendor's own role can never be filled.**
`POST /api/requirements` never sets `approvalState`, so it stays `DRAFT`
and `assessAward` blocks every placement (`src/lib/award.ts:86`). The
requisition path (`POST /api/requisitions`) runs the governance decision
and sets it; the requirement path does not.

```
POST /api/requirements → status OPEN, approvalState DRAFT
POST /api/submissions/:id/award
  → AWARD_BLOCKED "Requisition is draft — nobody can be placed against it yet"
```

**2. A placement made in the product bills the vendor to itself.**
A requirement has no field for the client it is for, so the award copies
`requirement.companyId` into `clientCompanyId`. Result:

```
vendor: Cloudepa Inc.   client: Cloudepa Inc.   endClient: Cloudepa Inc.
engagement: null   msa: null   po: null
```

**3. The client cannot approve the hours.** A consequence of 2 — approval
is the buyer's to give, and the contract says the buyer is the vendor.

**4. Work done cannot be invoiced.** `POST /api/invoices/generate`
requires an `engagementId`; an award creates no engagement.

### Leaks

**5. A consultant reads their agency's whole book.** A consultant's
`Context` carries the agency's `companyId` with `roleId: null`, so every
route that scopes by company but checks no permission opens to them:
`/api/contracts` (colleagues' bill rates), `/api/timesheets` (their
hours), `/api/rate-history` (amounts and the reason for each rise),
`/api/settings`, `/api/roles`, `/api/holidays`, `/api/automation`,
`/api/rolloff`, `/api/companies`, `/api/invitations`, `/api/packets`,
`/api/documents`, `/api/document-shares`, `/api/decisions`, `/api/events`.

**6. Anybody signed in can read another company's invoice.**
`/api/invoices/:id` and `/api/invoices/:id/match` — a rival firm's
delivery manager read `IN_GS_0041`, $264.00, billed to GlobalStaff MSP.

**7. Match scores are readable on somebody else's role.**
`/api/requirements/:id/matches` — the same leak closed on the consultant
profile and missed here.

**8. Any vendor's trust signals are readable by anybody.**
`/api/vendors/:id/trust-signals`. Arguably fine for a marketplace, but
unscoped by accident rather than by decision.

### Friction

**9. Three endpoints refuse without saying what they wanted.**
`/api/contracts/:id/activate` needs an `action` the error only reveals
after a failed call; `/api/submissions` and `/api/conversations/messages`
return 422 to a plain GET.

## The shape of it

Sorting every route by which of two checks it performs explains every
leak. Routes that check a permission **and** scope by company refuse
correctly. Routes that scope by company and check no permission leak to
the agency's own consultants. Routes that do neither leak across
companies. The holes are two quadrants, not a scatter.

## Checked and sound

- All 40 screens render for both a company user and a consultant.
- No route returned a server error in 325 probes.
- The walls hold: an account lead sees their own account only; the outside
  market refuses everybody at a delivery firm but the contractor desk.
- Representation holds stop a second agency at the same client through a
  different role, naming nobody.
- Timesheet authority refused a rival, refused a consultant approving
  their own hours, and let the client through.
- The seeded chain is complete, which is why breaks 1–4 were invisible
  until the chain was walked in the product.
