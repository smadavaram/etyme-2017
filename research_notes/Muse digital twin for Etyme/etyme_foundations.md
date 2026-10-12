# Etyme foundations a per-user agent ("Muse") could stand on — code and document inventory

Read-only study of `/home/user/etyme-2017` on 2026-10-12. Every claim below cites a file path; nothing is from the web. "Source" links are repository paths.

## Plain-English summary for the founder

Etyme already has most of the hard, boring plumbing a personal agent needs, because the product was built to prove to auditors who did what and why:

- **Who may do what is one table.** Every seat holds a short list of permission words (`invoices.issue`, `timesheets.approve`), roles are bundles of them, a seat with no desk sees only its own work, and one door (`getCallerContext`) checks every API call. An agent acting for a person would inherit exactly that person's list and be refused in the same sentences.
- **Every look and every unprompted act is written down.** Reads of other people's data go to `AccessLog` (refusals included, and a refusal is written *before* the "no" goes out). Anything the system does on its own goes to `AutomationLog` with a plain-English reason and an honest "can this be undone" flag, and `lib/autonomy` names the rung on the Observe → Recommend → Draft → Execute ladder for each kind of act. Model calls go to `AgentRun` with their cost.
- **Refusals are sentences, not codes.** `askTheDesk`, `noDeskYet`, `refusalSentence` turn a permission key into "This is for the AP & Payroll desk. Ask your company's owner."
- **Several things already happen without a screen.** A client approves a week from a one-time email link; a consultant answers a text or email and the record changes; notifications route to Teams or email; seventeen nightly jobs act and log themselves.
- **The API is wide (298 route files)**, documented by area in `BUILD.md §3`, and there is already a machine identity (`ServiceAccount`, API key) that calls it with a scoped permission list.
- **Claude is already used** in six places (matching, CV evidence, document extraction, site copy, screening, submission checks) and every output must carry factors, basis, confidence and unknowns.

What is **missing** for a twin: there is no place to keep a person's standing instructions or preferences (the only per-user store is browser `localStorage` for tab choices); no actor kind for "an agent acting as this person" (`Event.actorKind` knows PERSON · AUTOMATION · SERVICE, `AccessLog` knows only person-or-company); dry-run exists on exactly two money routes and nowhere else; the "inbox" exists as `GET /api/decisions` and `GET /api/notifications` but there is no agent-readable queue of "things waiting on *you* with the facts attached"; and nothing records "the twin did this on your behalf and here is why" — `AutomationLog` is company-scoped and unprompted, `Event` is person-or-system. The ladder in `lib/autonomy` is explicitly a *naming* of what already happens, not a policy engine an agent can ask "may I".

---

## Key question 1 — Permission model per seat and desk

### Takeaway
A flat list of 32 permission strings, roles as bundles, one `CallerContext` resolved per request, and a derived allowlist that lets a desk-less seat open only its own pages. An agent would be handed `caller.permissions` and `caller.company` and be judged by `hasPermission` like any route.

### Cited Findings
- `PERMISSIONS` is one flat `as const` list (`consultants.read` … `privacy.manage`); `DEFAULT_ROLES` are bundles; Recruiter deliberately lacks `*.cost`, `margin.read`, `pnl.read` "so they cannot back-calculate salaries from a bench total" — [src/lib/permissions.ts](src/lib/permissions.ts) lines 11–60, 73–100.
- Checks: `hasPermission`, `hasAnyPermission`, `hasAllPermissions`; field filters `canReadPayRate`, `canReadBillRate`, `canReadMargin`, `canReadConsultantName`, `filterAssignmentFields` "applied to every read path" — [src/lib/permissions.ts](src/lib/permissions.ts) lines 167–240 (offsets from `sed -n 120,439p`).
- `desksHolding(keys, kind)`, `askTheDesk({doing,…})`, `PERMISSION_WORDS`, `inWords()` translate keys into trade words for refusals — [src/lib/permissions.ts](src/lib/permissions.ts) lines ~292–433.
- `CallerContext` = `{ person{id,name,primaryEmail,timezone}, context{id,type,companyId,roleId}, company{…isDemo,outsideAccess,accountWalls}, orgUnitId?, permissions, isService?, staff? }`; `getCallerContext(request)` is "resolved once per request, used by every endpoint"; `realPersonId(caller)` returns null for a machine — [src/lib/api-context.ts](src/lib/api-context.ts) lines 22–100, 284.
- `Context` model: `type ContextType` (CONSULTANT · EMPLOYEE · PARTNER · CLIENT_CONTACT · PLATFORM_ADMIN), `roleId`, `orgUnitId`, `side` (BUY/SELL), `persona` (default INDIVIDUAL), `teamPersonIds`, `expiresAt`, `grantReason`, `lastUsedAt`, suspend/revoke fields — [prisma/schema.prisma](prisma/schema.prisma) `model Context`.
- Persona is a third axis: "Role says WHAT. Persona says HOW FAR." — [src/lib/persona.ts](src/lib/persona.ts) header.
- `ensureDefaultRoles(companyId, kind)` renames/adds/grants/revokes default roles additively so a company formed earlier gets a role added later without migration — [src/lib/company-roles.ts](src/lib/company-roles.ts).
- Nav table is the permission source for the menu: `getNavForKind`, `mayReach`, `mayOpen`, `holdsADesk`, `isDeskless`, `routesOpenToADesklessSeat`, `routeMatches`, `pageNameOf`; `CompanyKind = VENDOR | CLIENT | MSP | GSI | CONSULTANT_CORP` — [src/lib/nav-table.ts](src/lib/nav-table.ts) lines 105, 1059–1328.
- Deskless door: "a seat holding no desk opens the routes behind the links its menu shows it … Everything else is refused in a sentence, before the route reads anything"; allowlist "read off lib/nav-table … never typed here"; hand-kept `SHELL_READS` and `ANSWERS_BY_ID` — [src/lib/deskless-door.ts](src/lib/deskless-door.ts) lines 1–80.
- A program office acts in a client-granted seat: `ProgramSeat {clientCompanyId, officeCompanyId, roleId, orgUnitId, grantedById, reason, validFrom, validTo, revokedAt}`; `seatFor`, `actingInSeat(caller, seat): CallerContext`, `actingDesk`, `noteSeatRead`, `seatTrail`, `mayGrantSeat` — [prisma/schema.prisma](prisma/schema.prisma) `model ProgramSeat`; [src/lib/program-seat.ts](src/lib/program-seat.ts) lines 46–430.
- `CLAUDE.md`: "Field-level permissions. Cannot be retrofitted. Every read path filters by context from the first commit" and "A menu entry the route will refuse is a menu entry that lies" — [CLAUDE.md](CLAUDE.md).

### Inferences
- `actingInSeat` is the closest existing precedent for "act as someone else under their rules with every read logged": it rebuilds a `CallerContext` from a granted seat. A twin could be modeled the same way — a grant from the person, a derived `CallerContext`, a trail sentence.
- Because permissions are strings shared by roles and `ServiceAccount.permissions`, an agent's scope could be expressed in the same vocabulary with no new enum.

### Gaps
- No `ContextType` or permission exists for "agent" or "delegate"; nothing in `Context` records that a context was granted *to* a non-person.

---

## Key question 2 — Audit trail of every read and action

### Takeaway
Three ledgers exist: `AccessLog` (reads of people, refusals awaited), `AutomationLog` (unprompted acts with reason + reversible), `Event` (append-only with `actorKind`), plus `AgentRun`/`Check` for model work. `lib/autonomy` names each `AutomationLog` action's rung and kind and a test fails if a new action has no entry.

### Cited Findings
- `AccessLog {subjectId, actorPersonId?, actorCompanyId?, action, allowed, reason, at}` — [prisma/schema.prisma](prisma/schema.prisma) `model AccessLog`.
- `logAccess` (fire-and-forget, failure reported via `reportError`), `logBulkAccess`, `recordAccess`, and `recordRefusal(subjectIds, params)` which is awaited and "never throws: if the write fails, staff are alerted and the refusal still stands" — [src/lib/access-log.ts](src/lib/access-log.ts) lines 133, 164, 218, 264–296; rule in [CLAUDE.md](CLAUDE.md) "Invariants the database must enforce" (decided 2026-10-08).
- `AccessAction` union has ~30 named reads (PROFILE_VIEW, TENURE_VIEW, PROGRAM_READ, CENSUS_READ, DATA_EXPORT, ERASURE, WEEK_APPROVAL_VIEW …) — [src/lib/access-log.ts](src/lib/access-log.ts) lines 18–105.
- `AutomationLog {companyId?, action, summary, reason (the rule it followed, in words), payload, reversible, reversedAt, at}`; null company = "an act of the platform, before or outside any tenant" — [prisma/schema.prisma](prisma/schema.prisma) `model AutomationLog`.
- `Event {seq, companyId?, type (dotted past tense), subjectType, subjectId, actorPersonId?, actorKind (PERSON · AUTOMATION · SERVICE), payload, occurredAt}` with `WebhookDelivery` — [prisma/schema.prisma](prisma/schema.prisma) line ~6585.
- `lib/autonomy`: "This file is not a capability. Nothing here decides anything. It is a name for what AutomationLog already records"; `LADDER` L0 Observe → L5 Fully autonomous; `ActKind = UNPROMPTED | ENFORCEMENT | ATTRIBUTED`; `Outcome = BLOCK | WARN | PERMIT` ("Never silently permit"); `Basis = RULE | RECORDED`; rung is "derived, not stored"; helpers `actOf`, `rungOf`, `kindOf`, `decidedBy`, `undoSays`, `readRow`, `JOBS` — [src/lib/autonomy.ts](src/lib/autonomy.ts) lines 1–140, 805–918.
- Counted from the file: 30 UNPROMPTED actions, 10 ENFORCEMENT actions, 125 ATTRIBUTED (RULE_ATTRIBUTED list), 3 PLANNED (RETENTION_DUE_SCAN, RETENTION_ANONYMIZE, SUBMISSION_COVER_WARNED) — [src/lib/autonomy.ts](src/lib/autonomy.ts) lines 142–622; held by `__tests__/invariants/autonomy.test.ts` per the header.
- `GET /api/automation` (what ran, with reasons) and `POST /api/automation/:id/reverse` "only where reversible is true", gated by `staffOnly` + `governance.write`; reversal "records the reversal … domain-specific undo logic lives in the respective endpoints" — [src/app/api/automation/[id]/reverse/route.ts](src/app/api/automation/[id]/reverse/route.ts); [BUILD.md](BUILD.md) §3 "The machine".
- `AgentRun {agent, recordType, recordId, attempt, verdict PASS|FAIL|ERROR, model, tokens, costMicros, ms, consideredCount, scoredCount}` and `Check {runId, checker, code, verdict, reason, evidence, checkedById, agreed, disagreedNote}`; `record()`, `runAgent()`, `costMicrosOf()` — [prisma/schema.prisma](prisma/schema.prisma) `model AgentRun`, `model Check`; [src/lib/agent-run.ts](src/lib/agent-run.ts).
- `notify()` header: "AutomationLog is separate — callers that are automations must write their own AutomationLog entry" — [src/lib/notify.ts](src/lib/notify.ts) lines 7–25.

### Inferences
- A twin's acts would need to be a *fourth* kind in `lib/autonomy` (the file's own prose says a rung answers "who started this" and that consequence would be "a fourth axis with a name of its own") — the invariant test would force naming every new action.
- `Check.checkedById/agreed/disagreedNote` is an existing human-over-model feedback shape a twin could reuse for "did you agree with what I did".

### Gaps
- `AccessLog` has no actor kind; a read made by an agent for a person would be indistinguishable from the person's own read unless written into `reason`.

---

## Key question 3 — Refusals in plain sentences

### Takeaway
Three helpers make every refusal a sentence that names a desk and a next step, never a key; a test (`the-desk-not-the-key.test.ts`) enforces it. An agent can relay these sentences verbatim.

### Cited Findings
- `noDeskYet(what, company)` → "X is not part of your seat at Acme. Ask your company's owner if you need it." Names no desk on purpose — [src/lib/no-desk.ts](src/lib/no-desk.ts).
- `refusalSentence(message, {kind, company, what})` replaces any permission key in a route's message with the desks that act ("This is for the AP & Payroll or Finance desk…"); `namesAPermission()`; pure, no DB — [src/lib/refusal-words.ts](src/lib/refusal-words.ts).
- `askTheDesk({doing,…})`: "`doing` is the act, as a gerund phrase and in the reader's words … Never the route, never the permission"; two shapes (name the desk, or say nobody here does) — [src/lib/permissions.ts](src/lib/permissions.ts) ~lines 342–383.
- `lib/why`: `whyContract`, `whyConsultant`, `whyRequirement`, `refusalText(w)`; "Every answer explains itself … the sentence says what to do about it"; `GET /api/why/:type/:id?person=` answers "why can they" (needs `team.manage`) — [src/lib/why.ts](src/lib/why.ts); [src/app/api/why/[type]/[id]/route.ts](src/app/api/why/[type]/[id]/route.ts).
- Refusal shape in week approval: `Refused { ok:false, status, code, says }` — [src/lib/week-approval.ts](src/lib/week-approval.ts) line 56.
- CLAUDE.md rule: "Explain in a sentence, not a code … never `DOCUMENTS_BLOCK`" — [CLAUDE.md](CLAUDE.md) "Zero training".

### Inferences
- `/api/why` is a ready-made "explain my access" oracle an agent could call before attempting an action, avoiding a logged refusal.

### Gaps
- None found for this area.

---

## Key question 4 — Actions that already happen without a screen

### Takeaway
Approve-by-email links, reply-by-email/text answers, a notification router with Teams/email delivery states, and 17 cron jobs each with a ladder rung already act without a UI — all through signed tokens or cron secrets, never through a person's session.

### Cited Findings
- Week approval by email: `sendApprovalLink`, `attachEvidence`, `openLink(token)`, `answerLink`, `readWeekApprovals`, `newLinkToken`/`hashLinkToken`, `approveWeekUrl`; the approver "presses Approve or Send back" with no account; "What an approval writes is the client's signature and nothing else: a CLIENT_APPROVAL assertion with no byId" — [src/lib/week-approval.ts](src/lib/week-approval.ts) lines 1–30, 87–96, 465, 573, 829, 875; route [src/app/api/approve-week/[token]/route.ts](src/app/api/approve-week/[token]/route.ts); rules in `app/api/timesheets/approval-by-email.ts`.
- Reply tokens: `signReply`, `readReplyToken`, `CHOICES`, `choicesBlock`, `questionFor` (signed via `lib/signed-link`) — [src/lib/reply-link.ts](src/lib/reply-link.ts); route [src/app/api/reply/[token]/route.ts](src/app/api/reply/[token]/route.ts).
- Free-text answers: `readReply(raw, asked)`, `applyReply`, `Kind = FRESHNESS | CONSENT | OUTCOME`, `INBOUND_SECRET_ENV='RESEND_INBOUND_SECRET'` — [src/lib/texts.ts](src/lib/texts.ts); `recordAnswer(a)` writes the inbound `TextMessage` first, then updates `ConsultantProfile` and a `Representation` hold ("no, someone already put me forward there") — [src/lib/answers.ts](src/lib/answers.ts); `POST /api/texts/inbound` — "Nothing is pointed at it yet — turning inbound email on is a DNS record, a provider setting and the signing secret" — [src/app/api/texts/inbound/route.ts](src/app/api/texts/inbound/route.ts).
- Notifications: `notify(params)`, `notifyBulk`, `pageOf`, `notificationHref`, `appLink`; types SUBMISSION … MATCH_READY; channels `IN_APP | EMAIL | TEAMS`; "The in-app row is written first and always" — [src/lib/notify.ts](src/lib/notify.ts); `Notification {deliveryState PENDING|SENT|FAILED|NOT_CONFIGURED, deliveryNote, deliveredAt, status UNREAD|READ}` — [prisma/schema.prisma](prisma/schema.prisma) `model Notification`.
- Delivery: `routeFor(recipient)` (business users → Teams webhook, email fallback; consultants → email only), `attemptDelivery`, `deliverySummary`, `DEMO_SKIPPED` — [src/lib/notification-delivery.ts](src/lib/notification-delivery.ts); Teams: `teamsLinkKind`, `checkTeamsLink`, `teamsCard`, `teamsEdge`; `Company.teamsWebhookUrl` — [src/lib/notify/teams-link.ts](src/lib/notify/teams-link.ts); [prisma/schema.prisma](prisma/schema.prisma) line 655.
- Cron jobs (17 dirs): agreement-terms, auto-approve, bench-stays, cold-openings, daily, deliver-webhooks, due-cycles, end-contracts, expire-invitations, freshness-ping, loose-ends, proactive-match, reap-demos, retention, rolloff-scan, visa-watch, watch — [src/app/api/cron](src/app/api/cron). Rungs in `JOBS`: daily/due-cycles/visa-watch L0; loose-ends/proactive-match L1; rolloff-scan L2; cold-openings/bench-stays/expire-invitations/deliver-webhooks/freshness-ping/watch L3; auto-approve L4; agreement-terms/end-contracts/retention/reap-demos L5 — [src/lib/autonomy.ts](src/lib/autonomy.ts) lines 668–801.
- Threads: `Conversation {companyId, withCompanyId, topic, topicId, participants Json}`; `Message {authorId, body, type TEXT|SYSTEM|RATE_CONFIRMATION|INTERVIEW|DOCUMENT_REQUEST, metadata}`; "Demand opens these and supply answers (src/lib/threads.ts)" — [prisma/schema.prisma](prisma/schema.prisma) `model Conversation`, `model Message`.

### Inferences
- The signed-link pattern (`lib/signed-link`, one-time tokens, "always a named person behind it") is the existing shape for a human confirming an agent's proposal without logging in — e.g. a twin drafts, the person taps Approve from email.
- `recordAnswer`'s "write the inbound message first, whatever it means" is the model for an agent inbox: record what was heard, then act.

### Gaps
- No evidence that inbound email is wired in any deployment (route says nothing is pointed at it).

---

## Key question 5 — API surface an agent would call

### Takeaway
298 `route.ts` files under `src/app/api`, every one passing through `getCallerContext` (or cron/staff checks, enforced by `every-route-has-a-door.test.ts`), returning `{ data }` or `{ error:{code,message} }`. `BUILD.md §3` lists the canonical surface by area.

### Cited Findings
- Count by top-level area (route.ts files): bench 18 · program 17 · cron 17 · me 14 · settings 13 · invoices 11 · submissions 9 · requirements 8 · payroll 7 · imports 6 · documents 6 · contracts 6 · census 6 · auth 6 · ar 6 · timesheets 5 · compliance 5 · vendors/rolloff/requisitions/profitability/placements/onboarding/invitations/integrations/companies 4 each · training/suppliers/seed-world/rate-history/people/consultants/ap/access 3 each · 2 each: week-approvals, texts, supplier-requests, purchase-orders, packets, outbound-pack, openings, notifications, market, leads, interviews, expenses, document-shares, demo, data-requests, conversations, contractor-invites, checks, blacklist, automation, alumni · singletons incl. why, tenure, decisions, events, ready, reply, approve-week, answer, health — from `find src/app/api -name route.ts` (298 total).
- BUILD.md §3 by area, one line each — [BUILD.md](BUILD.md) lines 55–137:
  - Auth/identity: `GET /api/me`, `POST /api/me/context` (switch seat), `/api/me/credentials`, `GET /api/me/access-log` ("who looked, and when, including refusals").
  - Onboarding: `POST /api/companies`, `/api/companies/:id/template-pack`, `/api/imports` (+ mapping, rows, commit), `/api/companies/:id/invitations`.
  - Supply: `GET/POST /api/consultants`, `GET /api/bench?scope=mine|company|network`, `POST /api/bench/listings`, `PATCH .../grant|revoke` (consultant only).
  - Demand: `GET/POST /api/requirements`, `POST /api/requirements/parse` ({text} → fields with per-field confidence), `POST /api/requisitions/:id/distribute`, `GET /api/requirements/:id/matches` ("scores with factors, basis, confidence, unknowns"), `POST /api/submissions` (batch, kind computed server side).
  - Work and money: `POST /api/assignments`, `PATCH .../extend`, `GET /api/timesheets`, `POST /api/timesheets/:id/submit|approve`, `GET /api/invoices`, `POST /api/invoices/generate`, `POST /api/invoices/:id/payments`, `GET /api/rolloff`, `POST /api/rolloff/:id/claim`.
  - The machine: `GET /api/automation`, `POST /api/automation/:id/reverse`, `GET /api/decisions` ("what needs a person right now").
- `/api/me/*` actual routes: me, me/context, me/work, me/papers, me/pipeline, me/portfolio(+write), me/scorecard, me/data, me/resumes, me/benches(+/:id/respond), me/submissions/:id/rate, me/interviews/:id/respond — from `find src/app/api/me`.
- `GET /api/decisions` aggregates TIMESHEET_APPROVAL, EXPENSE_APPROVAL, ROLLOFF_ACTION, SUBMISSION_REVIEW, INVOICE_OVERDUE, RATE_CONFIRMATION, SUPPLIER_REVIEW, CONTRACT_PAPERING, CONTRACT_START "into a single prioritized queue. Each item is a decision that requires human input" — [src/app/api/decisions/route.ts](src/app/api/decisions/route.ts) lines 21–40.
- Machine caller: `ServiceAccount {name, keyHash, keyPrefix, permissions String[], expiresAt, lastUsedAt, revokedAt}`; key prefix `etyk_`; `mintKey`, `hashKey`, `keyMatches`, `checkKey`; `callerFromApiKey` builds a `CallerContext` with `context.type: 'SERVICE'`, `isService: true`, `staff: false` — [prisma/schema.prisma](prisma/schema.prisma) `model ServiceAccount`; [src/lib/service-accounts.ts](src/lib/service-accounts.ts); [src/lib/api-context.ts](src/lib/api-context.ts) lines 580–660.
- Dry run exists on exactly two routes: `body.dryRun === true` in `POST /api/ar/dunning` and `POST /api/profitability/settle` — [src/app/api/ar/dunning/route.ts](src/app/api/ar/dunning/route.ts) line 90; [src/app/api/profitability/settle/route.ts](src/app/api/profitability/settle/route.ts) line 67. The grep for `dryRun|dry-run|dry run|preview` found no other write route.
- CLAUDE.md: `__tests__/invariants/every-route-has-a-door.test.ts` "fails on any API route that goes through none of the shared door, the cron check or the staff check" — [CLAUDE.md](CLAUDE.md) "Corrected 2026-10-08".

### Inferences
- A `ServiceAccount` is company-scoped and "not a person" (`realPersonId` → null), so it cannot stand in for a user: foreign keys like `checkedById`, `grantedById`, `authorId` would be null. A per-user agent needs a person-linked identity, not a key.

### Gaps
- No per-route machine-readable catalogue (OpenAPI) was found; `BUILD.md §3` is prose and covers a subset of the 298 routes.

---

## Key question 6 — Matching and parsing that already use the Claude API

### Takeaway
Six files import `@anthropic-ai/sdk`; every call records an `AgentRun` with cost, falls back to rules when no key is set and says so, and an eval harness fails if a seventh surface is added without cases.

### Cited Findings
- Importers of `@anthropic-ai/sdk`: `src/lib/match-engine.ts`, `src/lib/extract.ts`, `src/lib/site-voice.ts`, `src/lib/consultant-portfolio.ts`, `src/app/api/requirements/[id]/screen/route.ts`, `src/app/api/submissions/[id]/check/route.ts` — from `grep -rln "@anthropic-ai/sdk" src`.
- `runMatchEngine` uses `MODEL = process.env.MATCH_MODEL ?? 'claude-opus-5'`, "Uses Claude for semantic skill matching … then scores on five dimensions"; pool from `lib/match-pool` (`Reach = OWN | PANEL | TRADING | SUGGESTION`, `reachOf`, `onePerPerson`, `ranked`) "Never the platform" — [src/lib/match-engine.ts](src/lib/match-engine.ts) lines 1–40, 94; [src/lib/match-pool.ts](src/lib/match-pool.ts) lines 67–194.
- `POST /api/requirements/parse`: "For now, uses a deterministic keyword parser. When Claude API credentials are configured, this switches to the full AI extraction" — [src/app/api/requirements/parse/route.ts](src/app/api/requirements/parse/route.ts) lines 6–16. (It does not import the SDK.)
- `lib/extract`: `Method = 'MODEL' | 'HEADERS'`; "Confidence and provenance travel with every field … The fallback is labeled, not disguised" — [src/lib/extract.ts](src/lib/extract.ts).
- `POST /api/submissions/:id/check`: "Rules first and always … Then, only if the rules are clean and there is a CV to read, the one question worth paying for … AgentRun gets what it cost. Check gets each verdict with its evidence" — [src/app/api/submissions/[id]/check/route.ts](src/app/api/submissions/[id]/check/route.ts).
- `POST/GET /api/requirements/:id/screen` — demand-side screen of arrivals, asks duplicate-submission, tenure cap, "did they leave badly" — [src/app/api/requirements/[id]/screen/route.ts](src/app/api/requirements/[id]/screen/route.ts).
- Evals: "With no API key configured — which is the state this system is in today — every one of these surfaces runs its rule-based path … add a fifth thing that imports the model SDK and the suite fails until it has cases" — [src/lib/evals/harness.ts](src/lib/evals/harness.ts); surfaces in [src/lib/evals/surfaces.ts](src/lib/evals/surfaces.ts).
- `agent-run` price table lists `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5` etc.; `costMicrosOf` rounds up — [src/lib/agent-run.ts](src/lib/agent-run.ts) lines 49–100.

### Inferences
- `runAgent<T>()` in `lib/agent-run` is the existing wrapper a twin's model calls should go through so cost, attempt and verdict land in `AgentRun`.
- The harness note that the system is key-less "today" means the production model path is unproven; a twin would be the first always-on model consumer.

### Gaps
- Harness says "four features" while six files import the SDK (the evals registry may count by surface, not file); not reconciled here.

---

## Key question 7 — The "Why" reasoning disclosure pattern

### Takeaway
Every match score must carry `factors`, `basis`, `confidence`, `unknowns`; the `Match` model stores them, and the requirement matches screen shows one line by default and the reasoning on click.

### Cited Findings
- Invariant: "Match scores always carry `factors`, `basis`, `confidence` and `unknowns`. A bare number is a bug." — [CLAUDE.md](CLAUDE.md) "Invariants the database must enforce".
- `Match {score Int, confidence HIGH|MODERATE|LOW, factors Json [{label,value,weight}] "shown in the UI, not hidden", basis String, unknowns String?}` — [prisma/schema.prisma](prisma/schema.prisma) `model Match`.
- Design-system component spec: "**Why** (reasoning disclosure) — score + confidence label, expandable to show factors (bar chart), basis, and unknowns"; "Progressive explanation. One line by default, reasoning on click" — [CLAUDE.md](CLAUDE.md) "Components" and "Eight things to build before features".
- Implementation: `matches.tsx` type `{confidence, factors: MatchFactor[], basis, unknowns}`, `confidenceWords(m.confidence, m.unknowns)`, factors mapped to bars, basis and unknowns paragraphs — [src/app/dashboard/requirements/[id]/matches.tsx](src/app/dashboard/requirements/[id]/matches.tsx) lines 16–17, 50–53, 225, 375–399. Also used in requisitions, program/budget, program/milestones, my-standing, people, scorecards pages (grep `unknowns`).
- `AutomationLog.reason` "the rule it followed, in words" and `autonomy.decidedBy(action, payload)` (RULE vs MODEL "read from the row, never derived") — [prisma/schema.prisma](prisma/schema.prisma); [src/lib/autonomy.ts](src/lib/autonomy.ts) line 853.

### Inferences
- A twin's proposals should be emitted in the `Match`-shaped envelope (score, confidence, factors, basis, unknowns) so existing screens and the "Why" component render them unchanged.

### Gaps
- No standalone `components/why.tsx` exists; the pattern is inlined per page (no shared component file found by grep for `unknowns` in `src/components`).

---

## Key question 8 — Rules in CLAUDE.md an agent must obey (neutrality, never silently permit, BLOCK vs WARN, segregation, ladder)

### Takeaway
The rules are explicit and most are already enforced in code; the BLOCK/WARN split is a legal-grounding test, segregation is "nobody signs their own", and neutrality is absolute.

### Cited Findings (exact quotes from [CLAUDE.md](CLAUDE.md))
- Neutrality: "Neutrality is absolute. Etyme never runs a bench and never places anybody. The moment it competes with its own suppliers the network stops growing." · "Etyme can be an MSP and not prime vendor. Etyme at all times should maintain neutrality." · "Etyme never holds the contract for a person, never bills for one and never pays one." · "Ask for them … goes to the supplier … never to the consultant, because Etyme places nobody."
- Enforcement: "**BLOCK** where legally grounded — tenure limit, break in service, work authorisation, lapsed supplier insurance, segregation-of-duties violation. **WARN, capture a reason, proceed** everywhere else — rate band, headcount plan, vendor tier. **Never silently permit.**"
- Alumni: "Alumni re-engagement ('ask them back') must check the tenure ledger **before** the action is offered. Inside a break period, show the eligibility date instead of a button."
- Fallback desk: "A desk nobody has named falls back; it never refuses." · "Most requisitions must clear **without human approval**. Governance slower than the workaround produces the workaround."
- Segregation: "nobody, the manager least of all, signs their own" · "a supplier cannot award its own" · "nobody signs their own hours" · "Nobody decides their own recommendation and nobody decides two desks." · "Segregation is a BLOCK, said in a sentence."
- Audit: "Every read of another person's data writes an `AccessLog` row, including refusals … a refusal's row is written before the refusal is sent." · "Anything the system does unprompted writes an `AutomationLog` row with a plain-English reason and an honest `reversible` flag."
- Worker files own week: "Only the worker files the week. No supplier, prime or client desk enters hours for somebody else."
- Three-way check: "A week the paying firm has not accepted blocks the invoice receipt that includes it. No 'approve anyway with a reason' for it."
- Waivers: "work authorization cannot be waived at all, a waiver against one being refused rather than honored quietly."
- Verdicts: "Etyme never renders that verdict [background check] and no desk in Etyme renders it either."
- Care areas: "When you are uncertain, stop and ask … Especially in: timesheet valuation, invoice generation, cycle date arithmetic, tenure math."
- Never lead with AI: "Never lead with AI. It is in there, it does real work, and it is the least defensible thing in the product."
- Ladder (code): `LADDER` L0–L5 in [src/lib/autonomy.ts](src/lib/autonomy.ts) lines 88–121, with "Honesty about rules: Most of what we do unprompted is a date comparison."

### BLOCK vs WARN table (from CLAUDE.md rules and `ENFORCEMENT` in `lib/autonomy`)

| Action | Outcome | Where |
|---|---|---|
| Place/activate past tenure limit or inside break in service | BLOCK | CLAUDE.md Addendum E; `AWARD_BLOCKED` |
| Start without I-9 / work authorization; waiver of work authorization | BLOCK | CLAUDE.md station 5, "Where a document lives"; `AWARD_BLOCKED` |
| Lapsed supplier insurance / certificate of good standing | BLOCK | CLAUDE.md; `GOOD_STANDING_LAPSED` |
| Segregation of duties (sign own requisition, award own submission, approve own hours, decide own supplier recommendation) | BLOCK | CLAUDE.md stations 1, 3, 7; supplier onboarding |
| Worker's week filed by anyone but the worker; week filed on a rung not the worker's | BLOCK (refused) | CLAUDE.md 2026-09-28; `rungsToFile` |
| Invoice receipt including a week the payer has not accepted | BLOCK | CLAUDE.md 2026-09-28 rule 3 |
| Adding/removing a holiday on a calendar not yours | BLOCK | `HOLIDAY_ADD_REFUSED`, `HOLIDAY_REMOVE_REFUSED` |
| Data request from someone not entitled | BLOCK | `DATA_REQUEST_REFUSED` |
| Reversing an automation without `governance.write` / staff | BLOCK | `automation/[id]/reverse` |
| Submission outside rate band | WARN + reason | `SUBMISSION_OFF_BAND` |
| Submission that would cross the client's time limit | WARN + reason | `SUBMISSION_TIME_LIMIT_WARNED` |
| Submission with work authorization missing/expiring | WARN + reason (block is at start) | `SUBMISSION_WORK_AUTH_WARNED` |
| Headcount plan, vendor tier misses | WARN + reason | CLAUDE.md Addendum E |
| Missing background check at activation | WARN + reason | CLAUDE.md station 5 |
| NDA unsigned | WARN | `NDA_UNSIGNED_WARNED` |
| Approve a flagged week ("Approve anyway") | WARN + reason on signature | CLAUDE.md client dashboard |
| Colleague joining on a claimed domain | PERMIT (logged) | `COLLEAGUE_JOINED` |

Automated-with-approval already (L4): `TIMESHEET_AUTO_APPROVED` (only where the client agreed in writing that silence approves), `REQUISITION_AUTO_CLEARED` (within plan). Fully autonomous (L5): `CONTRACTS_ENDED`, `AGREEMENT_TERM_WATCH`, `RETENTION_DELETE`, `ERASURE_COMPLETE`, `CENSUS_DELETED`, `DEMO_SANDBOX_REMOVED` — [src/lib/autonomy.ts](src/lib/autonomy.ts).

### Inferences
- An agent's permitted unprompted acts map cleanly onto L0–L3 (observe, recommend, draft, low-risk reversible); anything on the BLOCK list is never the agent's to decide, and WARN items need the agent to supply the reason that gets captured.

### Gaps
- CLAUDE.md does not state a rule about an agent acting *as* a person; all segregation rules assume the actor is a human seat.

---

## What is missing for a per-user agent (cross-cutting)

### Takeaway
Five foundations are absent or only partly present; each is named with the nearest existing precedent.

### Cited Findings
- **Standing instructions / preferences:** `Person` has only `name, primaryEmail, timezone, erasedAt, passwordHash, emailVerifiedAt` — [prisma/schema.prisma](prisma/schema.prisma) `model Person`. The only per-user preference store is `lib/remember` (browser `localStorage`): "Only per-reader conveniences … unreadable by us" — [src/lib/remember.ts](src/lib/remember.ts). Grep for `preference` in the schema hits only a comment about erasure — [prisma/schema.prisma](prisma/schema.prisma) line 180. Company-level settings exist (`Company.daysOff`, payroll settings via `lib/payroll-settings`, `teamsWebhookUrl`) but nothing per person.
- **Agent identity acting as a person:** `Event.actorKind` = PERSON · AUTOMATION · SERVICE — [prisma/schema.prisma](prisma/schema.prisma) ~line 6585; `ContextType` = CONSULTANT · EMPLOYEE · PARTNER · CLIENT_CONTACT · PLATFORM_ADMIN; `CallerContext.context.type` is 'SERVICE' for keys; `AccessLog` has only `actorPersonId`/`actorCompanyId`. No "DELEGATE"/"AGENT" kind anywhere (grep for `twin|muse|copilot|on your behalf|standing instruction` across `src`, `prisma`, `docs` found only unrelated seed/rebuild hits).
- **Dry-run on write routes:** only `POST /api/ar/dunning` and `POST /api/profitability/settle` accept `dryRun` — [src/app/api/ar/dunning/route.ts](src/app/api/ar/dunning/route.ts); [src/app/api/profitability/settle/route.ts](src/app/api/profitability/settle/route.ts). Precedents for "preview without writing": `lib/why` (explain access without acting), `GET /api/requirements/:id/screen` (what the last screen decided), `lib/contract-clearance` verdicts shown "a week early, in activation's own words" — [CLAUDE.md](CLAUDE.md) client dashboard section.
- **An inbox an agent could read:** `GET /api/decisions` (nine categories, "requires human input") — [src/app/api/decisions/route.ts](src/app/api/decisions/route.ts); `GET /api/notifications` and `/api/notifications/stream`; `/api/me/work`, `/api/me/pipeline`, `/api/me/papers`; threads via `/api/conversations` — from `find src/app/api`. Items carry a `says` sentence and a link, not the full record.
- **"The twin did this on your behalf and here is why":** `AutomationLog` is unprompted/company-scoped with no person; `Event.actorPersonId` + `actorKind` could carry "person via agent" only by adding a kind; `ProgramSeat` + `seatTrail` + `AccessAction 'PROGRAM_READ'` is the one existing pattern of "acted under a grant, trail says on whose authority" — [src/lib/program-seat.ts](src/lib/program-seat.ts) lines 260–297; [src/lib/access-log.ts](src/lib/access-log.ts).

### Inferences
- The shortest path to an agent identity is a new `actorKind` (e.g. DELEGATE) on `Event` and an `AccessLog` reason prefix, plus a `Context`-like grant row naming the person and the scope — mirroring `ProgramSeat` (grant, reason, validTo, revoke) rather than `ServiceAccount` (no person).
- `lib/autonomy`'s own rule — a rung answers "who started this" — implies agent-initiated acts need their own `ActKind` so the ladder's buyer-facing claims stay honest.

### Gaps
- Whether `docs/delivery-matrix.html` or `docs/how-agents-work.md` plan any per-user assistant: grep of `docs/how-agents-work.md` for "assistant|twin|per-user" found only build-agent (Claude Code) usage; the delivery matrix HTML was not read.
- `lib/evals/surfaces.ts`, `lib/consultant-portfolio.ts` model usage and `lib/matrix.ts` were not read in full.
