# 138. Staff screens are metadata only — 2026-11-28

Pax (architect), Sat Nov 28, about 5:14 AM: "The standard for every
staff/superadmin surface is metadata only: firm name and address, plugins
on/off, switch history — never a company's data, and Lane C data (bank
digits in any form, tax IDs, SSNs) never appears cross-tenant, ever."
The bank-checks report showing suppliers across firms with the last four
bank digits is a clear violation: the digits and cross-firm naming leave
the staff view, and the data stays inside each tenant. Every other legacy
staff screen is audited and reported first; only clear violations are
fixed, and the judgment calls go back to Pax. No screen is deleted.

## The audit (read-only, 2026-11-28)

| Surface | What it shows across tenants | Verdict |
|---|---|---|
| Superadmin "Plugins by firm" list | Firm name, address, plugins on, last switch | Meets |
| Bank-checks report | Supplier names, paying firms' names, last four bank digits | Clear violation; being fixed |
| Breaches register | Every incident: summary, populations, categories, clocks, who opened it, each affected company's name and notice dates. No bank, tax or SSN field | Judgment call for Pax |
| Census import, page and review | The client's workforce sheet, contact name and work email, read by the one Etyme person the client agreed to | Judgment call for Pax: consented, but not metadata |
| Companies list, staff with no seat | Every company's name, address, kind, domain and register positions | Judgment call for Pax: more than name and address |
| "Email that did not go" panel | When, kind, company name, provider status, masked recipient | Judgment call for Pax |
| Bootstrap a company (cron secret) | Creates a company from what it is given; reads no other tenant | Meets |
| Owner identity proof | One named company and one seat, to record a provider's result; lists nothing | Meets |
| Demo world rebuild | Steps run and left; no tenant data | Meets |

A search of the breaches, census, staff, superadmin and seed-world routes
for tax ID, SSN and account number found none. The bank-checks report is
the only Lane C field that crosses tenants.
