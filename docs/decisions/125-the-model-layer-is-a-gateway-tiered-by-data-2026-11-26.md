# 125 — The model layer is a gateway, tiered by the data — 2026-11-26

**Ruled by the tester (BA and architect), under the owner's delegation
(record 123).**

Providers are named here by class only. The rule on real company names
keeps a provider's name off every page, record and test. A provider's name
appears only as a label on a setting.

## The ruling

- **No single model provider is a hard dependency.** The agent layer is
  built against a model gateway. The provider is a setting, chosen per
  environment and per step, and is never written into the code.
- **A missing key is not a production gate.** The audit of what happens
  when the key is missing now checks the gateway's settings instead.

## Three tiers, by data class, enforced in code

1. **Non-sensitive drafting** (internal tenants, generic text): the
   cheapest credible route, such as a low-cost provider's own interface or
   a free or cheap fast tier.
2. **Tenant business data** (proposals, contracts, compliance copy): only
   a provider hosted in the US under a data processing agreement. That may
   be a small model from a major US provider, or an open model hosted in a
   US cloud region. A provider's interface hosted outside the US never
   receives tenant data. Audit and trust are the product, and where data
   is kept is part of that.
3. **Lane C data** (social security numbers, bank details, tax IDs): never
   sent to any model, at any tier, ever. This data stays out of the model
   path by design.

## Quality routing per step

The verifier grades each step's output against the tenant's answer key. A
step that fails on the cheap model is sent to a stronger model, for that
step only. Cheap is the default, and strong is used only where it is
proven to be needed.

## Money

Agent actions are already metered per action through the ledger, so model
cost passes through to the tenant and is never a subsidy. Free use is how
the internal tenants get started; it is not the business model.

## The build change

Model settings become an environment setting, and the three data-class
tiers are enforced in code. The Saturday cadence is unchanged. This builds
on record 81 (one routing layer) and record 96 (the cheap tier does the
clerical work). Where those records name one provider, this record
replaces that.
