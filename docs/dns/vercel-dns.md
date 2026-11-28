# Moving etyme.com's DNS to Vercel

> **2026-11-12: the nameservers were switched before the records were
> added, and mail to and from @etyme.com stopped.** Vercel's DNS for
> etyme.com held no MX record and no SPF record. The records to restore
> are in `docs/dns/etyme.com.mail-restore.zone`: the five Google MX
> records first (receiving), then the one SPF record (sending). Type each
> into Vercel → Domains → etyme.com → DNS Records; that only adds, and it
> leaves the three records Resend added on 2026-11-11 alone. Since that
> day Resend sends from etyme.com itself (`send`, `rsend` and
> `resend._domainkey`), not from notify.etyme.com, and the site answers
> on www.etyme.com, so steps 5 and 6 below and the `send.notify` lines in
> `etyme.com.vercel.zone` are out of date.

Option 2, chosen by the founder on 2026-11-09: Vercel holds the DNS, so
every `<firm>.etyme.com` works the moment the firm exists, under one
certificate for `*.etyme.com`.

## Do it in this order

1. **Vercel → Project etyme2040 → Settings → Domains.** Add `etyme.com`,
   `www.etyme.com` and `*.etyme.com`. Vercel will say the domain must use
   its nameservers. Leave it waiting.
2. **Vercel → Domains → etyme.com → DNS records.** Add every record in the
   table below **before** you switch, so mail never breaks.
3. **Bluehost → Domains → etyme.com → Nameservers.** Choose custom and set:
   - `ns1.vercel-dns.com`
   - `ns2.vercel-dns.com`
4. Wait for Vercel to show the domains as valid (minutes to a few hours).
5. **Sign-in:** add `https://etyme.com/api/auth/callback/google` to the
   Google OAuth client and `https://etyme.com/api/auth/callback/azure-ad`
   to the Microsoft app, then set `NEXTAUTH_URL=https://etyme.com` on the
   etyme2040 project and redeploy.
6. **Resend:** open Domains → notify.etyme.com and press Verify.

## Records to add in Vercel's DNS (step 2)

All of them are in `docs/dns/etyme.com.vercel.zone`, written from the
live zone exported on 2026-11-09. Import it in one command:

```
vercel dns import etyme.com docs/dns/etyme.com.vercel.zone
```

or type each line into Vercel → Domains → etyme.com → DNS Records.
Vercel makes the web records (`etyme.com`, `www`, `*`) itself.

Two values have to be pasted in before you switch:
- **Google DKIM** (`google._domainkey`): Google Admin → Gmail →
  Authenticate email → Generate new record. The live zone had none.
- **Resend DKIM** (`resend._domainkey.notify`): Resend → Domains →
  notify.etyme.com. Resend's page is the truth for its MX host too.

## What changes and what does not

- **Mail to @etyme.com** keeps working: the five Google MX records move
  with the nameservers.
- **The old site at etyme.com goes away.** The app's own home page,
  documentation and footer take its place. Its `/product` and `/pricing`
  pages are not carried over.
- **Every firm's address works by itself.** `tapin.etyme.com` opens
  Tapin's page, and a new firm's `<slug>.etyme.com` opens its page the
  day it signs up, with nothing added to DNS.
- **`in.etyme.com`** (forwarded business email) gets no records yet; that
  door stays closed until `EMAIL_INTAKE_LIVE=1`.
- **Mailgun, Mailchimp, SendGrid and Bluehost mail records are dropped.**
  Marketing and notices go through Resend on notify.etyme.com. The zone
  file lists each dropped record and why; add one back if it is still used.
- `docs/dns/etyme.com.zone` is the older Bluehost version, kept for the record.
