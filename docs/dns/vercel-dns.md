# Moving etyme.com's DNS to Vercel

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

Vercel makes the web records (`etyme.com`, `www`, `*`) itself. These are
the ones that keep mail and verification working. Name is relative to
etyme.com; leave it blank for the domain itself.

| Name | Type | Value | Priority |
|---|---|---|---|
| (blank) | MX | `aspmx.l.google.com` | 1 |
| (blank) | MX | `alt1.aspmx.l.google.com` | 5 |
| (blank) | MX | `alt2.aspmx.l.google.com` | 5 |
| (blank) | MX | `alt3.aspmx.l.google.com` | 10 |
| (blank) | MX | `alt4.aspmx.l.google.com` | 10 |
| (blank) | TXT | `v=spf1 ip4:162.144.178.127 include:_spf.google.com include:spf.smtp.adxemailhelp.com ~all` | |
| (blank) | TXT | `google-site-verification=BBDibdPX9tTYPhaDsrVgPeKBEqMiCXs8rZjrf4WbfYk` | |
| (blank) | TXT | `google-site-verification=cxCyQld11ghvCXM09SlUlmD1aVXzandjIVzX9EPXQlc` | |
| (blank) | TXT | `google-site-verification=hxgsHBmOvl9N-eZ2B67Y-NIuWG2-L0t0SZeDnTrb4z8` | |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:support@etyme.com` | |
| `send.notify` | MX | `feedback-smtp.us-east-1.amazonses.com` | 10 |
| `send.notify` | TXT | `v=spf1 include:amazonses.com ~all` | |
| `resend._domainkey.notify` | TXT | the DKIM value shown in Resend → Domains → notify.etyme.com | |

Copy the two Resend values (the MX host and the DKIM key) from Resend's
own page if they differ from this table; Resend's page is the truth.

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
- `docs/dns/etyme.com.zone` is the Bluehost version, kept for the record.
