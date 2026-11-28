## One tenant is one domain name — decided 2026-09-21

**The founder's rule: one tenant = one domain name.** A company signs in
through its OAuth tenant, and the verified corporate domain is the tenant.
Everything that shares that domain is one tenant, however many legal
entities, countries or branches sit under it. Terimo Inc. in the US and
Terimo Ltd. in Canada, both on `terimo.com`, are **one tenant**, not two
companies.

What follows, so nobody models a group as two companies:

- **The legal entity is a layer under the tenant, not a tenant of its
  own.** It is what signs an agreement, raises an
  order, receives and pays an invoice, and employs or engages a person. It
  carries a country, a currency, a tax regime, registration numbers and a
  bank. Every money document names exactly one legal entity. A person's
  seat is at the tenant; their placement is with an entity; their tenure
  is at the tenant, across entities.
- **A branch is a site under a legal entity.** It carries a calendar, a
  time zone, a state or province, and hiring managers. Work happens at a
  site. Tenure never depends on the site.
- **Rules live on the tenant and are overridden at the entity, then the
  site.** Approval chains, rate bands, required documents and caps are set
  once; an entity overrides currency, tax and the document set; a site
  overrides the calendar and the language.
- **A group with several domains** (`terimo.com`, `terimo.ca`) maps the
  extra domains onto the one tenant as aliases. A verified alias joins the
  tenant; it never creates a second one.
- **Today `Company` is both tenant and legal entity**, with one currency
  and US documents. The legal-entity layer is a schema request for
  `etyme-architect`, sequenced as the first Phase 3 piece a paying client
  funds. Until it exists, two entities under one domain are still one
  company on the record, and the two ledgers are a report, not a table.
  Two companies on the record for one group is the wrong workaround and is
  not used.
