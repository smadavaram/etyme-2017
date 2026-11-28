# 129 — The affiliate model: spec, queued behind pricing — 2026-11-26

**Specified by the tester (BA and architect), Nov 26.** The owner pointed
out: "We haven't built affiliate model yet." The terms are locked (record
127): 40% for months 1 to 12, then 20% for as long as the tenant pays.
The model that pays them is not built. It is a build item, queued after
the pricing build, because commissions are worked out by the pricing and
ledger machinery.

## Where it lives

The affiliate program is Etyme's own channel program, on Etyme's own
record (the internal tenant). It is not a tenant plugin.

## The registry

Each affiliate is a person or a company, with:
- contact details;
- payout details. These follow the Lane C rules: bank details are
  masked and encrypted, and every reveal is on the ledger;
- a status.

## Attribution

- Each affiliate has its own code or link.
- When a new tenant is activated, its affiliate is written on the ledger,
  once, and never changed.
- A tenant with no affiliate belongs to the house.
- No self-referral: an affiliate never earns on its own tenant.

## The commission engine

Commission is worked out only from the subscription receipts the tenant
actually paid: the charges per contractor plus the platform fee.
- **Months 1 to 12 from activation:** 40%.
- **From month 13 onward:** 20%, for as long as the tenant pays.
- **No payment, no commission.**
- **A refund or a chargeback claws back** the commission it paid.

## Payouts

- Each affiliate gets a monthly statement, made from the ledger.
- The payout itself is a money act, under the standing approval gates.
- Nothing is paid out automatically until the owner rules otherwise.
- Etyme never moves money. A payout leaves as a file, like a payment run.

## What the affiliate sees

A narrow view of the record: its own referrals, its earnings and its
statements, and nothing else.

## Order

It is built after the pricing build, on the Saturday cadence. It passes
its own plan gate first.

## Pax's rulings, 2026-11-28

- Etyme's own affiliate records live on Etyme's own tenant record, tenant
  #0: Etyme is its own first tenant.
- A firm counts as active when its trial clock starts, that is when it
  begins running its own business on the record (the batch A rule).
  Commission still pays only on paid receipts.
- Payouts stay gated until the owner rules the money questions.
