## Layer 6: storefront templates on the tenant's own address, built beside stabilization — 2026-11-16

**What he said.** The founder added Layer 6 to the fix list of 2026-11-14
(record 72) on 2026-11-16, with its spec and three rulings. Later the same
day he set its order: *"We have to do this while we stabilize system."*
Layer 6 does not wait for Layers 7 to 10 (record 80). It runs beside
them as its own batch. It has its own deploy and its own retest on
Tapin. Stabilization stays the priority track, and Layer 6 must not
destabilize it.

**The spec, as he gave it** (verbatim from the fix list):

> Etyme provides landing-page TEMPLATES that any tenant gets on its Etyme
> subdomain (<tenant>.etyme.com); Tapin is the first instance and the
> proof. The page is rendered from the same Etyme record (owner ruling:
> Etyme owns each tenant's website — no separate site, content or CRM in
> two places), with the Ask Etyme agent on the page. The Nov 14 Tapin
> homepage candidate is the content draft for Tapin's instance (hero
> "Data engineering consultants, ready to interview", bench profiles, AI
> data readiness pods, train → bench → profile → interview, "Tapin runs
> on Etyme", Durham address, no "bench company" wording publicly).
>
> Three template models (tenant picks one; all fed by the same record):
> (1) Ask-first (ChatGPT model): one Ask box is the page — the agent
> answers from the tenant's public record and offers the next action.
> (2) Feed (X model): a stream, newest first — bench profiles and open
> roles as cards, each with its action (Request interview / Submit a
> profile). (3) Board (Reddit model): grouped by skill/topic — jobs and
> bench traded board-style, the 2017 model: vendors post requirements,
> suppliers post bench/hotlists, responses land in the record as
> submissions. Improvise the 2017 code you found for this Board template.
>
> Trading stays inside the known network, following the record's
> visibility/Walls settings; public visitors see only what is marked
> public. NOT a public marketplace.
>
> Common blocks in every template: tenant name/brand from the record, Ask
> Etyme agent, the three doors in owner order (Teams, Google Chat,
> WhatsApp — WhatsApp is a contact route only in this layer, no
> integration build), Request an interview, Join the bench, real counts.
> Tenants can switch templates without a rebuild.
>
> Real data only: bench, pods and counts from the tenant record; no
> invented clients, rates, margins or placements; where the record is
> empty, the page says so honestly.
>
> Ask Etyme public mode: answers only from the PUBLIC record (bench
> skills/availability, pods, how to request an interview, how to join the
> bench, contact hradmin@etyme.com). Style: concise, simple, direct, no
> fluff, next action attached. Never expose internal data: rates, margin,
> timesheets, invoices, tenure.
>
> "Request an interview" and "Join the bench" create the
> submission/candidate in Etyme — not just an email.

**His three rulings.**
1. Tapin's default template is Ask-first. Feed and Board are templates
   the tenant switches to, over the same record.
2. A public visitor sees the bench anonymized: skills and availability
   only, with no names, contacts or rates. Full board trading is for
   companies in the tenant's known network only.
3. A consultant's profile cannot be submitted to a client until her
   consent is on the record.

**What it changes in the standing rules.**
- "Never lead with AI" keeps holding on Etyme's own public pages. A
  tenant's own storefront may open on its Ask box when that tenant
  chooses the Ask-first template. For Tapin this is the founder's ruling.
  The page never sells the AI; it answers and offers the next act.
- A tenant's storefront may draw the three doors by name, as labels on a
  contact route. This is the same exception as an integration target a
  customer picks.

**What the 2017 code holds, read before building** (read-only search,
2026-11-16):
- The January 2017 branches already route a company's own subdomain to
  its public jobs and apply pages.
- The later Rails app (`origin/development`) has:
  - one `Job` table carrying jobs, bench jobs, products, training and
    blog pages;
  - a firm-set "hot candidate" flag as its bench;
  - an invitation whose purpose was job or bench, with the rate range on
    it;
  - an application that moved from applied to submitted to client to
    hired;
  - a marketplace across every company's public jobs;
  - job and bench feeds;
  - a visitor page on each company's subdomain showing up to 50 hot
    candidates by name.
- Kept as ideas: a storefront per firm drawn from its record; a public
  jobs list with an apply door that needs no account; one invitation
  shape for a job or a bench offer, answered by the person who receives
  it; a feed per firm; "approved suppliers first".
- Not kept, because each breaks a standing rule: candidates shown by
  name without their yes; a marketplace across all companies; rates
  sent down the chain; reads of a person that nothing logged; one
  accepted bench declining all others; training in the same table as
  jobs.

**Points the build must hold, read against the standing rules.**
- Nothing a client reads says Tapin trains (record 69). The draft's
  "train → bench → profile → interview" therefore goes to the founder
  before it is drawn on Tapin's page.
- A visitor's "Request an interview" lands in the record as a lead the
  tenant acts on. The submission is made from it only through the
  existing route, with her consent on the record (ruling 3). It is
  never emailed alone.
- "Join the bench" is her own yes, through the existing door on the
  company page.
- The subdomain already routes to `/site/<slug>` in the middleware.
  Serving `<tenant>.etyme.com` live needs a wildcard DNS record and a
  domain on the hosting project. Both are the founder's to add, and
  they are checked against the mail records first.

**The order of work.** First a prototype of the three templates for
Tapin, in the live page's own words, drawn from the record and
photographed at phone width. The founder looks at it. Only then is it
built, by etyme-market for the pages and etyme-supply for the bench
cards. It ships as its own deploy and is retested on Tapin.

### Branding: a template is a layout, never a look — 2026-11-16

The founder's instruction covers Layer 6 and the Layer 8 storefronts.

- **Every tenant page renders in the tenant's own branding**, stored on
  the tenant's record as settings: the logo, the primary and secondary
  colors, and the font pairing. Branding is never hard-coded into a
  template.
- **Etyme's own branding is never forced onto a tenant's storefront.** At
  most a small "Runs on Etyme" line appears.
- **A tenant gets its branding in one of two ways.**
  1. *Adopt what exists.* The Owner uploads the logo and confirms the
     colors. Etyme offers to read the colors from the logo, or from the
     company's own website when the Owner asks. The template renders in
     those colors.

     The test case is Tapin. Its branding is the ink-navy and teal of its
     Nov 14 home page draft, not Etyme's purple.
  2. *Create.* For an Owner who has no branding, or who asks Etyme to make
     it:
     - Etyme generates a small brand kit (a wordmark, a color palette and
       a font pairing) from a short choice by the Owner.
     - Etyme previews it on the chosen template.
     - The kit is published only on the Owner's explicit yes. Until then
       the page uses a neutral default.
- **Rules.**
  - Branding lives in tenant settings.
  - Changing the branding never touches the tenant's data or its
    template choice.
  - Switching templates keeps the branding.
  - When an Owner's colors fail the contrast and accessibility checks,
    the Owner is warned. Etyme never changes the colors silently.

**Answers that bear on Layer 6** (record 80, question 8): the chat doors
Microsoft Teams, Google Chat and WhatsApp stay named on storefronts. They
are entry doors the tenant offers.
