## Model routing: one layer picks the provider by job and by data — 2026-11-16

**What he said.** The founder wrote this build prompt on 2026-11-13 and
sent it on 2026-11-16 with his sequencing:
- Stabilization (Layers 7 to 10, record 80) remains the priority track.
- The prompt is recorded in full, and built in its own order (§7)
  without displacing the stabilization work.
- The prompt's own standing rules govern the build.

**Where it meets the standing rules.**
- *The model boundary* (CLAUDE.md, "Ask Etyme and the twin") still
  holds, and this prompt makes it stricter:
  - per company, off by default;
  - masked before anything leaves;
  - every prompt and answer logged;
  - suggestions only;
  - no model in identity or access.

  "Nothing retained" is read lane by lane:
  - Lane A sends only redacted public or internal text.
  - Lane B goes to a US host or to the provider with zero retention.
    Direct to the other provider only on a tenant's own opt-in.
  - Lane C reaches no model at all.
- *Tests.* §7 limits the unit tests of this build to four named proofs,
  and adds nothing else without asking. That overrides, for this build
  only, the habit of writing a test sentence for every part.
- *Names.* Providers and model names appear only in configuration and
  in the admin cost view, never on a public page (§9).
- *Keys.* The keys (DEEPSEEK_API_KEY, ANTHROPIC_API_KEY) are the
  founder's to set in the hosting project's secret store. Until each is
  set, its routes say so in a sentence, as Ask Etyme does today.

**The prompt, verbatim.**

=== PROMPT BEGINS ===
Scope: the model calls behind Ask Etyme and document parsing/checking — nothing else. A fix to what exists, not a new feature.

0. The decision: Etyme's users do mostly basic jobs — parse a resume, classify a document, pull dates and amounts out of a contract, summarise a record, draft a note. Running those on Claude Sonnet is paying reasoning prices for clerical work. The model is a plugin: no job in Etyme may be hard-wired to one provider again. Every model call goes through ONE routing layer that picks the provider by (1) job type and (2) data sensitivity, logs the cost, and escalates to a stronger model only when a deterministic validator says the cheap answer is not good enough. This build does NOT adopt DeepSeek Harness (dsh) — a developer-preview coding tool with no security audit; it never touches Etyme or tenant data. Only the architecture idea is taken.
Standing owner rules, non-negotiable: (a) No inference engineering — no self-hosting, no vLLM, no quantization, no fine-tuning; models bought via API only (owner ruling Oct 30, 2026). (b) No model decides money or people outcomes — never approves a timesheet or invoice, releases payroll, awards a job, signs anything, or sends a person without consent; model output is extraction/classification/summary/draft, always checked, always human-approved before it acts on the record. (c) Deterministic first — if a rule, date math or schema check can do the job, it is Tier 0 and no model is called. (d) Ledger-first — every model call writes a cost/usage ledger entry (§6). (e) Fix what we have — this routes the existing Ask Etyme and document checker; Ask Etyme today answers "This question needs the model, and it is not set up here" (verified Nov 9, 2026) and the document checker is a failing QA gate.

1. Verified prices (checked Nov 13, 2026) — store as CONFIGURATION, never hard-code in logic: DeepSeek V4.1 Flash: $0.30 in / $1.20 out per 1M peak, half off-peak ($0.15/$0.60), cache-hit input $0.006 peak; peak = 01:00–04:00 and 06:00–10:00 UTC Mon–Fri. DeepSeek V4 Pro: $1.32/$3.96 peak, half off-peak. Claude Haiku 5.5: $0.10 in / $0.50 out (prompts ≤100k), $0.01 cache read. Claude Sonnet 5.5: $2.00/$10.00, $0.10 cache read — escalation only, ~8–13× Flash per job. Reference job: one resume/invoice parse ≈ $0.026 on Sonnet vs ≈ $0.0036 on Flash peak, ≈ $0.0018 off-peak.

2. The routing layer: one internal interface — route(job_type, sensitivity_lane, tenant_id, payload, record_refs) → {provider, model, tier, output, usage, cost, ledger_id}. All model calls use it; a direct SDK call to any provider elsewhere in the codebase is a defect. Config as data (per tenant, every edit ledgered): ModelRoute {job_type, default_tier 0|1|2, sensitivity_ceiling, escalation_model, monthly_budget_usd, alert_at_pct}; ProviderConfig {provider: deepseek | deepseek-us-host | anthropic, base_url, api_key_env (key in env/secret store only — never in DB, never logged), rates {in, out, cache_hit, peak_windows}, enabled (kill switch)}. Adapter note: DeepSeek's API speaks OpenAI format (api.deepseek.com) and Anthropic format (api.deepseek.com/anthropic) — where code already calls the Anthropic SDK, a Tier 1 route can be a base-URL + key + model change INSIDE the layer; never use that shortcut to bypass the layer or the ledger.

3. Sensitivity lanes — enforced in the routing layer itself, before any call; a job's lane is set by the data it carries, not by who asks. Lane A — Public/internal, redacted (no worker PII, no client rates, no identifying contract text) → DeepSeek direct API allowed (Tier 1 default). Lane B — Confidential (worker names/emails, client names, rates, contract/SOW text) → DeepSeek direct FORBIDDEN by default; allowed only (a) the same DeepSeek weights via a US host (Azure AI Foundry / Google Vertex AI — the deepseek-us-host provider via base_url), or (b) Claude Haiku. DeepSeek direct for Lane B requires a per-tenant opt-in stored as data (allow_deepseek_direct: true, set by Tenant Admin, ledgered) — DeepSeek's policy stores personal data in China with no zero-retention/DPA on the public API; the default answer to enterprise clients must be "your data does not go to China." Lane C — Restricted (SSN, DOB, bank details, government ID, I-9 data) → NO model call at all, on any provider; deterministic handling only; if a document may contain Lane C data, the redactor runs first. Redaction step before every Tier 1/2 call: strip/tokenise names, emails, phones, SSN/bank patterns; replace with record IDs/placeholders; rehydrate placeholders in the validated output. Unit tests must prove a Lane B job cannot reach DeepSeek direct without the opt-in and a Lane C job reaches no endpoint.

4. Tiers and job table. Tier 0 — deterministic, $0: tenure-cap date math; timesheet × rate reconciliation and invoice totals; document present/expired; status transitions; duplicate detection on exact IDs. Tier 1 — cheap model (DeepSeek Flash; Lane B: US-host Flash or Haiku), default for every basic job. Tier 2 — escalation (Claude Sonnet; V4 Pro acceptable where lane rules allow), only via §5, never a job type's default. Jobs (all Tier 1 unless noted): Resume/CV parsing → candidate fields; validator: JSON schema, dates parse, missing = null never guessed. Document classification → type enum + confidence; below threshold → human queue. Compliance doc extraction (COI/certs) → issuer, coverage, expiry; expiry feeds Tier 0 date math; the model never decides "compliant". MSA/SOW extraction → parties, rate, dates, notice, caps; rate must match a record or flag, never overwrite silently. Invoice/timesheet explanation (words only) → plain-English reason built on the Tier 0 mismatch result; numbers in the text must equal the Tier 0 numbers (string-check). Submission first pass → matched/missing evidence list citing text present in the resume/role; NEVER awards, ranks for award, or rejects — a human decides. Ask Etyme → answer with record citations; every number/fact cites a record ID that exists; transaction requests keep today's correct refusals (no approving, no paying). Company/contact normalisation → clean fields; dedupe is Tier 0 on the cleaned domain. Drafts (notes, reminders, summaries) → saved as draft, human sends; no send path from a model output. Document checker (Tier 1 + §5) → uploaded doc vs its record, pass/flagged fields; a "pass" requires every checked field to validate, not a model's opinion.

5. Escalation — the ONLY way Tier 2 is reached: (1) output fails schema validation after ONE retry with the validation error fed back; (2) a required field's confidence is below the job's configured threshold; (3) two documents for the same record disagree on a checked field (rate, dates, totals); (4) the job type is on the tenant's escalation list. Log the reason in the ledger. If Tier 2 also fails validation → human queue; never silently accepted, never loops. Track escalation rate per job type; >20% in a week is a report item (prompt or schema is wrong), not a reason to raise the default tier.

6. Cost controls and ledger: every call writes one entry — timestamp, tenant, user/actor, job type, tier, provider, model, prompt version, record refs, tokens in/out/cache-hit, cost computed from ProviderConfig rates, lane, escalation reason, validation outcome. Prompts are versioned data. Per-tenant monthly budget with admin view (spend by job type, by tier, escalation rate, cost per document); alert at the configured %; at 100% Tier 1 keeps running and Tier 2 pauses for that tenant (never the reverse). Batch the batchable: non-urgent parsing queues for off-peak windows at half price; anything a user is waiting on runs immediately. Cache the repeated context: system prompt + tenant rules structured as a cacheable prefix (Flash cache-hit input ≈ 2% of normal price). Provider outage: queue and retry the same tier; no automatic failover to Sonnet except jobs a user is actively waiting on, and ledger any failover as an escalation.

7. Build order: (1) routing layer + cost ledger behind the existing Ask Etyme and document checker, §1 routes as defaults; (2) lanes + redaction; (3) batch + cache; (4) admin cost view; (5) escalation tuning from the first week's ledger. Build discipline: unit tests ONLY for (a) Lane B cannot reach DeepSeek direct without opt-in, (b) Lane C reaches no provider, (c) validator rejects output whose numbers differ from Tier 0, (d) ledger cost math against the §1 config — nothing else without asking. No extra test frameworks, no coverage chasing, no refactoring working flows. Document every shortcut and mock in KNOWN-LIMITS.md, plainly. API keys in env/secret store only (DEEPSEEK_API_KEY, ANTHROPIC_API_KEY) — never in the DB in plain text, never in a log, never in a ledger entry.

8. Acceptance — report proof first (a table: job, tier used, provider, cost per job, validation result), then judgement. On the Tapin tenant with sample documents: (1) a resume parse, a COI extraction and a document classification each complete on Tier 1 with ZERO Sonnet calls in the ledger; (2) a Lane B job (contract with rates) provably does not call api.deepseek.com without the tenant opt-in, and the same job succeeds on the Lane B route; (3) a document containing an SSN triggers Lane C — no model call in the ledger; (4) a deliberately corrupted extraction (wrong invoice total in the model output) is rejected by the validator, escalates once, lands in the human queue, record unchanged throughout; (5) Ask Etyme answers a record question citing a real record and still refuses "approve this timesheet" / "pay this invoice" exactly as today; (6) the month-to-date cost view total equals the sum of the ledger entries; (7) existing flows untouched — no change to tenure-cap, timesheet or invoice-approval behaviour except the document checker now returning validated results.

9. What NOT to build: no DeepSeek Harness / dsh anywhere in the product or pipeline; no self-hosted models, fine-tuning or GPU work; no new user-facing AI features in this pass — routing + checker + Ask Etyme only; no auto-send (no model output sends an email, submission or notification); no model involvement in approvals, awards, payroll, signing, or identity/access; no company-size range or provider names in public copy (the admin cost view may name providers; the marketing site may not promise a model).
=== PROMPT ENDS ===

**What exists today, read before building** (2026-11-16):
- The model's own modules are in `src/lib`: model-boundary, model-health,
  model-ids and model-allowance.
- About a dozen call sites reach the model. Among them: Ask Etyme's read,
  the submission check, requirement screening, the site writer, the
  sheet import, the match engine and extraction. Each becomes a call
  through the one layer.
- KNOWN-LIMITS.md already exists at the root.
- The build belongs to etyme-architect (the model boundary and the agent
  loop). Its ledger tables go through the schema queue.
