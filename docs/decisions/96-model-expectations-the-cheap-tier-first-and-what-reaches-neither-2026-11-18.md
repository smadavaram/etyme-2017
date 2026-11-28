## Model expectations: the cheap tier first, and what reaches neither — 2026-11-18

**What he said** (message 131, and one line after it). The providers'
names are in record 81 and in configuration; here they are the Tier 1
provider and the Tier 2 provider.

His rule in one line: the Tier 1 provider does the clerical work, the
Tier 2 provider is reached only when the cheap answer cannot be trusted,
and some data never goes to the Tier 1 provider at all.

**Verified by him that day, by name only.** Neither provider's key
exists on the hosting project. The owner pastes both keys, never an
agent, never through chat.

**The Tier 2 provider today, before routing ships.**
1. No new wiring is needed. The code already reads its key for Ask
   Etyme, extraction, matching and the document check. His paste turns
   it on.
2. Before he turns it on, he is told which model each job uses today and
   the expected cost per job. The check and match jobs sit on the most
   expensive model, and that is priced plainly.
3. With no key, rules answer, and a check that needs the model says it
   is unverified. A rules result is never presented as a model result.
4. Once routing ships, it is no longer the default for basic jobs. It is
   the escalation tier, and the fallback for confidential data on its
   small model.

**The routing build** (record 81 holds the full prompt).
1. One routing layer. Every model call goes through it. A direct call to
   a provider anywhere else is a defect. He pastes the Tier 1 key only
   after the build is reported live against the acceptance list.
2. Tier 0 jobs are rules, cost nothing and call no model: tenure-cap
   arithmetic, invoice totals, expiry checks. Tier 1 is the default for
   basic jobs: resume parsing, document classification, insurance and
   contract extraction, company and contact clean-up, drafts, the
   document checker and Ask Etyme answers. Tier 2 is reached only when:
   - the cheap output fails validation after one retry with the error
     fed back;
   - a required field's confidence is below its threshold;
   - two documents for one record disagree on a rate, a date or a total;
   - a tenant has put the job type on its escalation list, for example
     for final text a client reads.
3. Lanes are enforced inside the layer.
   - Lane A is public, internal or redacted data. Only Lane A goes to
     the Tier 1 provider directly.
   - Lane B is worker names, client names, rates and contract text. It
     goes to the Tier 2 provider's small model, or to the Tier 1 weights
     on a US host. It goes direct only on a tenant's own opt-in, stored
     as data and written to the ledger.
   - Lane C is social security numbers, dates of birth, bank details,
     government ID and I-9 data. It reaches no provider, ever.
   - Redaction runs before every Tier 1 or Tier 2 call.
4. Every call writes one cost-ledger entry. Prices live in
   configuration. Each tenant has a monthly budget and an admin cost
   view. At the budget, Tier 2 pauses and Tier 1 keeps running.
5. If Tier 2 also fails validation, the job goes to a person's queue. It
   is never accepted silently.
6. Acceptance is proof first, on the Tapin tenant, as a table of job,
   tier, provider, cost and validation result:
   a. a resume parse, an insurance extraction and a classification each
      finish on Tier 1, with no Tier 2 call in the ledger;
   b. a Lane B contract job does not call the Tier 1 provider directly
      without the opt-in, and succeeds on the Lane B route;
   c. a document holding a social security number makes no model call;
   d. a corrupted extraction (a wrong invoice total) is rejected,
      escalates once, lands in the person's queue, and changes no
      record;
   e. Ask Etyme answers citing a real record, and still refuses "approve
      this timesheet" and "pay this invoice";
   f. the cost view's total equals the sum of the ledger entries.
7. Not in this build: any provider's coding harness, self-hosting or
   inference engineering, new user-facing model features, and any model
   output that sends something or decides money or a person's outcome.

**How it is sequenced.** The build adds tables, so it starts after the
batch in release is deployed. No key exists in the build environment, so
the acceptance report marks each item as proven before his paste or
provable only after it, and never claims a live result from a stand-in.
