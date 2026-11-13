## A site has a country and a time zone, and a local holiday is a day on the week — decided 2026-10-20

The founder: *"Can clients and businesses have tens of locations
globally and have their own calendar of operations, a local HR
calendar and a sales calendar that a worker has to report to? A
contractor working from India has Diwali, but a client may agree to
it or not."* Then, on the first answer (three calendars, an agreed
list per placement, a reminder from the twin): *"Is this over
engineering?"* It was. The question is one worker, one day, one
client: is this day a holiday for this placement, and who pays for
it. What answers it with what already exists, and nothing more:

- **A site has a country and a time zone.** `CompanyLocation` already
  carries the country; it gains a time zone. Its holidays are the
  country's public holidays, which `Holiday.country` already keeps off
  another site's dates. Nobody edits a site's calendar until a paying
  client with sites in two countries asks for it.
- **The placement's site decides which days are expected.** A
  placement already names the site where the work is done; the week
  is checked against that site's country and days off. An Indian
  worker on a US client's site is expected on Diwali unless the day is
  taken.
- **A local holiday is a kind of day on the week, and the client's
  signature is the agreement.** The worker marks the day "local
  holiday — Diwali" the way they mark leave; the week shows it in
  words; the client signs the week or sends it back, which is the
  "agree or not" the founder named, through the signature that
  already exists. No agreed list, no second table, no reminder.
- **Pay and billing follow what is already there**: a holiday day is
  not billed; whether the worker is paid for it is the employer's
  existing holiday policy (the bench setting of 2026-10-03, off by
  default, on for GSIs), applied to placements too.
- **The generated world's firms still get sites in several
  countries**, because it costs one column and proves "horizontal,
  never vertical" in the simulation. Everything else above waits for
  the first paying client who asks, per the sequencing rule.

Cost: one column on the site, one value in the day kinds, one line
in the week's words. The earlier design (three calendars, agreed
holidays per placement, a twin reminder) is recorded here as what was
cut, so it is not re-derived until a client needs it.
