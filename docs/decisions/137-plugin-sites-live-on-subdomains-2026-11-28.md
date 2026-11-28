# 137. Plugin sites and training live on subdomains — 2026-11-28

The owner, relayed by Pax (architect), Sat Nov 28, about 2:16 AM: plugin
websites and training live on subdomains.

- **Etyme's own properties.** The training micro-site sits on its own
  subdomain of etyme.com.
- **Tenants.** A tenant's plugin sites sit on subdomains under the
  tenant's own domain, in the tenant's branding.
- **The public door stays etyme.com/learnai**, on the main domain. It is
  the marketing address. It hands the visitor into the training
  subdomain with the one login and session carried across: no second
  sign-in at the seam.
- **The Website plugin's generated sites** follow the same model.
- Applied in the queue work. Where a subdomain needs a DNS or hosting
  act only the owner can take, it is listed and the work stops on that
  point alone.

Extends 133 (each plugin on its own micro-site) and 134 (one sign-on).

## What was built, 2026-11-28 (etyme-architect)

- `src/lib/plugin-host.ts`: one reader from a host to a plugin site and its
  firm, and back; the label is the registry's micro-site root.
- `src/middleware.ts`: a plugin subdomain is served from the micro-site path
  it already has, the address bar kept; the plugin switch still decides, so
  an off firm reads as not found. Where the session cannot reach the
  subdomain, the visitor is sent to the same path on the app's own address.
- `src/lib/auth.ts`: the session cookie's domain is `.etyme.com` only where
  NEXTAUTH_URL is etyme.com or under it. On etyme2040.vercel.app nothing
  changes. A firm's own domain never shares the cookie; the existing redirect
  to the app's address is the hand-off there.
- Not served yet: a label under a firm's own domain (only the database can
  name the firm). The /learnai door has no course link yet; `courseEntryHref`
  is ready for the market to use.

## Owner-only steps

Nothing above changes production until these are taken. No agent takes them.

1. Point etyme.com at the etyme2040 project on the host, and set
   NEXTAUTH_URL to `https://etyme.com`.
2. Add `learn.etyme.com` to the project, or a wildcard `*.etyme.com`, with
   its DNS record. A wildcard covers one level only, so a firm's plugin
   sites (`learn.<firm>.etyme.com`) need one record per firm (for example
   `*.tapin.etyme.com`). Check mail records first.
3. Each firm with its own domain adds its own DNS records for
   `learn.`, `pods.` and `proposals.` under that domain.
