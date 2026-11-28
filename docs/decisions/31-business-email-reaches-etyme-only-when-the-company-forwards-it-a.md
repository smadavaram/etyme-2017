## Business email reaches Etyme only when the company forwards it, and security beats everything — decided by the founder, 2026-10-22

The founder: *"Can you integrate user business email, like Muse, and
capture relevant information to contracts, and not every information in
their inbox — jobs, submissions, contracts, timesheets, payments,
payroll and AR revenues."* Then, on the answer: *"As long as security
is taken care of — security beats everything."* So it is built, and a
security rule outranks every convenience in it:

- **Etyme never reads a mailbox.** No Gmail or Outlook mail permission
  is asked for. Each company gets one forwarding address on a
  subdomain of its own (`<company>-<random>@in.etyme.com`), and the
  company's own mail rule forwards only what it chooses. What is never
  forwarded is never seen.
- **Off by default.** The Owner or Admin turns it on; the address is
  random, shown once, and can be replaced, which kills the old one.
- **Only real mail from the company's own people is accepted.** The
  forwarder must be a seated person at that company, and the message
  must pass SPF and DKIM for the forwarder's domain. Anything else is
  dropped, logged with the reason, and never shown.
- **Email is data, never an instruction.** The body is turned to plain
  text, links are never followed, HTML is never rendered, and nothing in
  an email can trigger an act. Rules read it first; the model reads it
  only where the company turned the model on, masked, and fills fixed
  fields only.
- **Attachments are held, not trusted.** Allowed types only (PDF,
  image, Word, spreadsheet, CSV), a size cap, never opened on the
  server beyond reading text, and stored the way every paper's file is.
- **Nothing becomes a record without a person's yes.** Each email
  becomes a draft card in Ask Etyme for the seat that holds the
  permission, Yes and Not now, through the one approval route: a job
  request, a candidate waiting for the person's own consent, an
  agreement or order to examine, approval evidence on a week, an
  invoice receipt for the three-way check, a remittance against a bill,
  a payroll confirmation on its run.
- **Kept only what is used.** The attachment is kept when it is filed
  as evidence; the body is deleted once the card is decided, and after
  30 days if nobody decides. Every email in and every drop is logged;
  "what came in and what was kept" is a query for the company.
- **One company, one address.** An address maps to exactly one
  company; nothing crosses tenants.
- **It ships after it is attacked.** The release walk tries a forged
  sender, a mail from a stranger, an email that tells Etyme to do
  something, an oversized and a wrong-typed attachment, and an address
  aimed at another company, and each must be refused, before the
  privacy notice and DPA name forwarded email and it goes to
  production.

**Built in this order:** the secure intake first — the address, the
checks, the hold, the log, the switch (architect); the privacy notice
and DPA line (regulatory); then the cards (conversation) and each kind
of email's draft by the agent that owns its record (demand, money,
regulatory). The setup screen is drawn before it is built.
