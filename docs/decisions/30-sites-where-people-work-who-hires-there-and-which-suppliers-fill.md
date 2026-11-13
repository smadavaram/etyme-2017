## Sites — where people work, who hires there, and which suppliers fill jobs there — decided by the founder, 2026-10-28

The founder: *"Are you also setting up branch offices … Branch offices
with plants where hirings and placements from suppliers can happen."*
Then "Build it, sites sounds good" on the drawing
(https://claude.ai/artifact/HqTdsPPMNSwxKyUjp2ynur), drawn as Corvane
Packaging from the seed. The word is **Sites** on every screen (a plant,
a branch office, a warehouse, a hospital are all sites); "plants" is a
buyer's word in manufacturing and is not a screen word.

- **A site is where a contractor works**, and it already exists
  (`CompanyLocation`: country, time zone, region). What is new: **a job
  request names its site by id**, never as free text; **a site names
  which approved suppliers may fill jobs there** (a supplier is approved
  for the company first, by Procurement, then named at sites; a job at a
  site goes to that site's suppliers by default, and a supplier not
  approved at the site is refused in a sentence that says to ask
  Procurement); and **a site names its hiring managers**, read from the
  jobs they posted where nobody typed it.
- **The placement inherits the job's site**, so its week follows the
  site's days off and time zone, the regional manager sees it under her
  region, and the time limit still counts the person's days at the
  company across every site.
- **One screen, Settings → Sites**, in the drawing's shape: every site
  grouped by region with its regional manager, country, time zone,
  hiring managers, suppliers and contractors; one site open with its
  address, days off, managers and the supplier ticks; every answer
  saying where it came from (the contractor list import, the company's
  website by the guarded read, a person). It is also the **Sites item
  of the setup checklist**, the eleventh, after Addresses, and until the
  checklist is built it is a line on the setup reminder.
- **Skipping stops one thing only:** a job with no site is posted at the
  primary site and goes to every approved supplier, and says so.
- **Refused:** a site named by a supplier or a seated MSP; a regional
  manager editing a site outside her region; a site deleted while a
  placement is at it.
- **Not built, on purpose:** the legal-entity layer per branch (own
  currency, tax registration, bank), which waits for a client that bills
  from two entities, per "One tenant is one domain name".
- **Built in this order:** the schema and the Sites screen (architect,
  with Corvane's per-site suppliers and managers in the seed); the job
  form's site and supplier defaults, the distribute refusal and the
  placement's site (demand); the words on the map and the documentation
  (market). A release pass, then production.
- **Built, the first piece, 2026-10-28 (architect, 2ed499317 and
  54fdd1d44).** `Requirement.locationId`, `SiteSupplier`,
  `SiteHiringManager`, and `source` (IMPORT · WEBSITE · PERSON) with who
  and when on every site; Settings → Sites in the drawing's shape;
  `jobSiteDefaults` and `checkSiteSupplier` in `lib/sites` for every
  reader; the Sites step in setup after Your company, skippable, with
  the line saying what skipping stops; Corvane's plants name their
  suppliers and each client names its approved suppliers at its primary
  site. Four coordinator's calls made on the way, each reversible in a
  sentence: a site that names no supplier reads as every approved
  supplier, so a client that never opens Sites is not blocked; a site's
  hiring managers are read from the jobs posted there first, and the
  join row is only for somebody with nothing at the site yet; the
  source is recorded once per site, not per field ("Guessed from the
  state" is not built); and a supplier claimed from a client's
  invitation now opens setup at Sites, then its week and payroll (this
  moves the 2026-10-07 line that opened it at How you work). "Read
  sites from our website" is left out until the guarded website read
  exists. The `seed-step-size` test sits on its 350-query line at the
  rate-change step with or without this change; cutting that step is
  architect's.
- **Built, the rest, the same night (demand 27491ce86 and 3f2550d36,
  architect e1f7e9934 and f9c94f5b5, market b5b178cd2, e6457ecc2 and
  1d7b44089, conversation 53442be64).** The job form opens on the
  primary site with "Your site. Days off, the time limit and the pay
  currency follow it."; "Send the job to" ticks the site's suppliers,
  each "approved at Dayton", with the sentence under them; a firm not
  approved at the site is refused on the raise and on distribute; the
  award writes the placement's site from the job; "Who applied" shows
  "supplier · Dayton, Ohio"; a seat in a client's program posts at the
  client's sites, a region seat at its region's; **a hiring manager's
  ticks are kept** (`Requirement.sendToSupplierIds`, who and when) and
  the job goes only to the ones left when it clears by rule or on the
  last yes, each firm checked again that day; every release panel
  offers only the site's suppliers. By region, the region rollup, Ask
  Etyme's region answers and the home page map's headings all say
  "site"; Corvane's own sentences about its plants stay. Two
  coordinator's calls on the way, each reversible by the founder in a
  sentence: **a hiring manager's ticks send the job**, narrowed only,
  though that role never chose who sees a job before, because whoever
  named the site's suppliers under Settings → Sites already made the
  choice (**confirmed by the founder, 2026-10-28: "Keep it"**; this
  qualifies station 2 of Phase 1, "a hiring manager cannot": the
  manager may remove names from the site's list and never add one); and **a job raised with no ticks or no site** (imports, older
  callers, the simulation) goes where it went before. Known gap:
  unticking every supplier saves an empty list, which reads as the
  site's default. Still on the free-text `location`: the matching
  checks, the consent text, the edit form and parse (demand); the
  match engine, internal moves and the bench routes (supply);
  `seed-standing` (architect), each reading the site's name the raise
  writes there.
- **Shipped to production 2026-10-28 (8ec26a51f on the deploy branch,
  source 428307d9d).** Release pass on a quiet copy of 53442be64: type
  check clean, 12,222 of 12,224 unit (the two reds the posture's route
  count and the new `sites` folder under requisitions read as a job id,
  both fixed in 428307d9d and green), 2,563 of 2,565 integration (the
  two reds, the payroll and week settings seat tests, "No Context
  found", green alone and judged a seat collision under the full run),
  build clean. Gates: no source difference, no Ruby, brand kit present,
  the three "removed" schema lines re-aligned whitespace. Smoke: every
  public page 200, the inbound email door 404 to a POST. Production's
  world still has no Corvane, so Settings → Sites there shows each
  seeded client's primary site with its approved suppliers; the walk as
  Corvane's owner, a regional manager and Marcus Hollins runs on a
  local copy and records its verdict under this line.
