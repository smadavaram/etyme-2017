## Every sign-in door shows the account chooser, and setup asks for addresses and papers — decided by the founder, 2026-10-20

The founder, trying to sign in to Tapin as sharath@etyme.com while
already signed in to a Gmail account: the Google door reused the
signed-in account and gave no way to switch, so he was seated as a
candidate (a consumer domain is a person, by the domain rule) and
offered a one-person company's two steps, the week and the payroll.
He asked whether Teams would do the same, and said he expects a
company's setup to be "more elaborate: addresses, invitations, doc
flows". Decided:

- **Both OAuth doors ask the provider for the account chooser on every
  sign-in** (`prompt=select_account` on Google and on Microsoft), and
  the sign-in page and the first screen after it carry "Not you? Use
  another account". Microsoft without it behaves exactly as Google
  did, so this is one fix for both. The password door (work email,
  password, Etyme address) stays the way in that never touches a
  provider.
- **The domain rule stands.** A consumer address is a candidate; that
  was right for the address and wrong only because of the account
  mix-up.
- **Setup grows by one step and two fields, every answer still
  defaulted** (this extends "Setup asks five things, then stops" of
  2026-10-07): *Your company* asks the legal and billing address,
  because every bill names them, and a site address per place people
  work, which the days-off calendar hangs on; a new step, **Papers you
  require**, is pre-filled from the shipped default sets for a W2, a
  corp-to-corp worker and a sub-vendor (`lib/document-type`,
  `lib/document-requirements`), so a company sees what it will ask for
  before it asks, and adds or waives with a reason; *Your team* is
  unchanged, invitations already live there. A company-level required
  set is a schema request for the architect (today a set belongs to an
  order or a line); the step writes that, and every order inherits it
  as its floor.
- **Built in this order:** the account chooser first, because it keeps
  the founder out of Tapin today (architect); then the setup fields and
  the papers step (architect, with regulatory for the sets).

**Shipped to production 2026-10-21 (4d7ac5d4f on the deploy branch,
source 23b545d89):** both sign-in doors ask for the account chooser
and the first screen says "Not you? Use another account"; every notice
names who and what; the queue holds the invoice receipts a person owes
a payment on; a worker files their own expense, billable only where
the agreement says; a placed worker reads their own pay line's rate
history from their own seat; the twin's question says who and what; a
week approved by email tells the worker once and never asks a
one-person firm to accept its own; a site has a time zone and a day on
the week can be a local holiday (two nullable columns, pushed on that
deploy). Release pass green on a quiet copy: type check, 11,411 unit,
2,312 of 2,313 integration with the one red (the census page's access
log count) green alone and judged a timing flake of the fire-and-forget
bulk log, build. **Open for the founder:** `DB_PUSH_ON_BUILD` on the
production project was set to 1 for that deploy and could not be set
back to 0 afterwards (the Vercel connection dropped); until it is
flipped, every production deploy reconciles the database to the schema,
which is harmless for additions and must be off before any deploy that
removes a column.

**Shipped to production 2026-10-22 (0c4b50536 on the deploy branch,
source 3a758ca9e):** the document-flow fixes from the walk; the steps
after a flagged background report as rows of their own; who examined a
paper; the I-94 and work-permit papers; an extension that checks every
added day against the person's and the supplier's papers; bills that
stay correct under load and tell the payer in the same save; the
nightly agent run and its approvals under load; one nightly letter per
person; a worker's greeting that says the notices other firms wrote;
jobs with one title told apart and a minute's batch sent as one
notice; and the forwarded-email intake, **closed**: the inbound
address answers 404 and writes nothing until `EMAIL_INTAKE_LIVE=1`,
which waits for the founder's attack walk and his yes on the privacy
and DPA draft (`src/lib/legal/drafts/forwarded-email.md`). Release
pass on a quiet copy: type check clean, unit and integration green
after one test list was brought up to the nightly jobs, build clean;
every "removed" schema line was re-aligned whitespace, nothing dropped.

**The admin's setup is a checklist, every item skippable, and it comes
back until it is done. Decided by the founder, the same day**, after
reading the 2017 code: *"I am glad it's easy, but shouldn't the admin
account be more elaborate, even if it means giving a 'skip for now'
option and asking them to complete onboarding in future?"* The 2017
registration asked four things (type, domain, name, owner) and the
admin then filled, over weeks and from six screens: the company's
profile (legal name, DBA, entity type, established, website, logo,
phone, time zone, currency), its locations with addresses, the people
in charge (owner, HR manager, billing contact, the accounts email),
bank details, company contacts, the firms it already traded with, four
document sets (what it required from candidates, employees, vendors
and customers), the payroll configuration, and domain verification.
The rebuild asks four and stops. So, superseding "Setup asks five
things, then stops" (2026-10-07) in its second half only:
- **Sign-in and "Your company" stay a minute long**, and a company can
  post its first job after them.
- **After that, the Owner or Admin reads one checklist**, each item a
  screen with its defaults filled and a **"Skip for now"**: your company
  (the profile above); addresses (legal, billing, each site); the
  people in charge (owner, HR, billing contact, accounts email, each an
  invitation if they are not seated yet); how you work (week, days off,
  holidays, payroll); papers you require (one set per party it deals
  with: workers, employees, suppliers, customers, from the shipped
  defaults); bank details (for a firm that gets paid, through the same
  Finance verification a supplier walks); your companies (the clients
  and suppliers it already trades with, by name and address, each an
  invitation); your team; your domain (verify it, so colleagues join
  by signing in); integrations (Teams, the accounting export). The
  2017 six screens become these ten items, in the trade's words.
- **A skipped item comes back**: the setup reminder already lists what
  is outstanding (`lib/setup-steps`, `components/setup-reminder`); it
  now carries every item, in the order above, with "complete setup" on
  Today and in the Ask Etyme greeting until the list is empty. Nothing
  nags daily; it is one line that stays.
- **A skipped item refuses only the act that needs it, in a sentence
  that names the step**: no bill without a billing address, no payment
  to a firm without verified bank details, no colleague joining by
  domain until the domain is verified, no I-9 chased for a party whose
  set was never confirmed. Everything else works on the defaults.
- **What is answered is recorded with who and when**, as before.
- **The brief for the whole of it, in the founder's words: "real easy
  but secure and neat."** Easy: one item per screen, every field
  filled with a default, Skip for now on every item, a minute each,
  and the company works before any of it is done. Secure: only the
  Owner and Admin see the checklist; bank details go through the same
  Finance verification a supplier walks and are shown as the bank, the
  account name and four digits; the domain is claimed only by
  verification; every answer carries who and when; nothing in it is
  readable by another company. Neat: one column, the brand kit, the
  home page's density, a short heading and plain fields, no cards of
  explanation, no progress bars with percentages, the trade's words
  (ASD-STE100 at about 80%). The drawing is judged on those three
  words before the build.
