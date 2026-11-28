## Who pays — decided 2026-09-10

**The client is the customer.** An enterprise with a dozen suppliers pays
for the one thing none of its suppliers can give it: every contractor on
its sites, across every supplier, with tenure added up, paperwork on
file, hours signed and invoices matched — from the desk of whoever does
that job. Suppliers are on the platform because their clients are.

This replaces the earlier plan to sell tooling to vendors first. A
vendor at a hundred dollars a month buys efficiency and can manage
without it; a client at fifty thousand a year buys a legal exposure it
cannot see any other way. The phases below are cut on that.

### Phase 1 — one hire, from every desk (built; ships on this)

The ten stations of one placement, walked from the client's own desks
and refused at each to whoever has no business there:

1. the hiring manager posts a requirement; within plan it publishes
   itself, every desk cleared by rule and by name; a miss goes to the
   desk that owns it — HR reads the role, Procurement audits the
   suppliers, the lead who owns the cost centre signs the money, after
   both — and nobody, the manager least of all, signs their own
2. the programme office chooses which suppliers see it; a hiring
   manager cannot
3. a supplier submits; the client awards; a supplier cannot award its own
4. both contracts and their due dates are written by the award
5. nobody starts without an I-9; a lapsed certificate blocks; a missing
   background check warns and records the reason; a stranger to the
   contract cannot touch it and the AP clerk, a party, still cannot
   start anybody
6. the worker files their own week; nobody else may
7. the client signs the work, the supplier accepts what it pays; nobody
   signs their own hours
8. the supplier invoices its own engagement only
9. the client pays what came through the match — never an invoice the
   supplier has not submitted — and the payment says who paid whom
10. tenure is the person's, across every supplier, counted once per day
    on site, and every read of it leaves a trail

`__integration__/client-programme.test.ts` is that walk, as sentences.

**Three client demo accounts** — Northbend Athletic, Cavanaugh Glassworks,
Talvern Medical — each with a
programme manager, hiring manager, VP, AP clerk and compliance officer
holding the real roles from `lib/company-defaults`, several suppliers,
a history across suppliers, and something waiting at every desk. Built
by `lib/seed-programmes` inside the world seed; reached from `/demo`, or
`POST /api/demo {"as":"world-nike","desk":"ap"}`. Seed once per
deployment with `POST /api/seed-world` and the `CRON_SECRET`.

### Phase 2 — governance and the supplier's own operation

Approval chains beyond one VP · rate bands and headcount enforced at
requisition · three-way match exceptions routed to a desk · rate
variance across suppliers · multi-manager org · the supplier's bench,
releasing-soon and rolloff · screening and interviews as a pipeline ·
1099 and sub-vendor payment down the chain · matching with reasons.

**A program office that is not the client.** Decided 2026-09-14, over
the uniform test. An MSP runs a client's program and places nobody, so
nothing ties it to a client the way a placement ties a supplier — and
so it cannot raise a requisition at all. Letting a firm's own record of
a counterparty stand in would let any firm claim any client, which is
worse than the gap. The answer is a seat: the client grants the MSP a
desk in its program office, the way it grants one to its own people,
and the MSP acts there under the client's own rules with every read
logged. Until that is built the refusal says what is missing rather
than "No client company found for this caller"
(`lib/resolve-client-company`), and
`__integration__/party-uniform.test.ts` holds the sentence.

### The assurance gate — decided 2026-09-22

The founder, after a second conversation with the CTO of the
two-billion-dollar company who is the exact buyer: **without SOC 2 Type
II and ISO 27001 there is almost no chance of an enterprise contract.**

That reverses the sequencing this file and the matrix both carried. The
old line said the attestations start after the first contract that
requires one, on the reasoning that buying one ahead of a buyer is a
year of cost with nobody on the other side. Half of that is still true
and the other half is now wrong: the buyer is asking before he will sign
anything at all, so for him the attestation is **Phase 1, not Phase 3.**

Three things follow, and none of them is a product change:

- **Type II cannot be bought quickly.** It attests that controls
  *operated* over a window, commonly six months. The window is the long
  pole and the only part that cannot be compressed later, so the clock
  starts now or the delay is paid in full later. Type I is a
  point-in-time assessment of design, takes weeks, and is the bridge a
  buyer accepts meanwhile. The penetration test still runs first, because
  a report written over controls nobody has attacked is the wrong order.
- **Most of the hard evidence already exists**, built for its own
  reasons: every read of another person's data logged including refusals,
  every unprompted act on a declared ladder, retention as code with the
  legal basis cited or its absence stated, erasure, the breach clock, and
  a deploy that is a reviewed replay through two gates. Firms usually
  start this with nothing and collect for six months.
- **It is one buyer describing his own procurement**, and he is very
  likely right about it. Two or three of the hundred leads asked the same
  question would say whether it is the market or the man, and that costs
  nothing to find out.

The sequencing rule below still holds for everything else. This is the
one exception, and it is an exception because the gate is commercial
rather than technical: the product is finished enough to sell and cannot
be bought.

### Phase 3 — scale

Multi-region programmes · IR35, GST, withholding · supplier scorecards
and tiers · document templates and attestations · reporting and export ·
commissions · sourcing at volume.

**The sequencing rule, kept from the BRD:**

> Phases 1–2 must ship to PAYING customers before enterprise scale work
> begins. The 2017 sprawl happened because everything was built at once.

The 2017 build reached 4,197 commits and stalled on adoption, not on
engineering. Building is now cheap, which makes over-building the primary
risk. If you find yourself scaffolding Phase 3 while a client is not yet
paying for Phase 1, stop.

**Prototypes (reference, not production):** `prototypes/client-console.tsx`
and `prototypes/rolloff-console.tsx` still define the target look of the
client and vendor consoles. `BUILD.md` §6 lists what the 2017 system had
that this one does not yet.
