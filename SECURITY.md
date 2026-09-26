# Security policy

How to tell us about a vulnerability in Etyme, what happens after you do,
and what is and is not worth your time.

> ### ⚠ The address below is a placeholder, not a real mailbox
>
> `security@etyme.example` **does not exist and nobody reads it.** It is
> written here so that the process around it can be reviewed and agreed
> before anybody relies on it.
>
> **The founder has to set the real address**, point it at a mailbox
> somebody actually watches, and replace every occurrence in this file.
> Until that happens, a reporter should use the commercial contact who
> gave them access to Etyme. This banner comes out in the same change
> that puts the real address in.

---

## Reporting a vulnerability

Email **`security@etyme.example`** — *(placeholder; see the banner above)*
with:

- what you found, and where — a URL, an API route, or a file path
- how to reproduce it, as concretely as you can
- what an attacker gets out of it
- anything you would like to be credited as, if you want credit

Please report privately first. Do not open a public GitHub issue, and do
not post it anywhere public, until we have had a chance to fix it. See
**Coordinated disclosure** below.

If the finding involves customer data you can see and should not, **stop
as soon as you have proved it is possible.** Tell us what you saw and how
much of it; do not download it, keep it, or go looking for more. That is
the difference between a report we can act on and an incident we have to
notify somebody about.

**PGP.** No key is published. If you need encrypted transport, say so in
a first message with no details in it and we will arrange one.

---

## What happens next

Honestly: less machinery than a larger company would offer, described
accurately rather than aspirationally.

1. **We acknowledge the report.** A human replies to say we have it.
2. **We reproduce it,** and come back to you with whether we could.
3. **We tell you what we are doing about it** — fixing it, accepting it
   as a known gap, or explaining why we think it is not a vulnerability.
   If we disagree with you, we will say why rather than go quiet.
4. **We tell you when it is fixed,** and agree with you when and how it
   is disclosed.

> **No response-time commitment is made in this document.**
>
> Etyme has no on-call rotation, no security team, and nobody whose job
> this is. Promising a 24-hour acknowledgment or a 90-day fix window
> would be inventing a commitment nobody has made, and a missed promise
> is worse than no promise. If a service-level commitment matters to
> your organization, ask for one in the contract, where the founder can
> actually make it.
>
> What is true today: reports go to one small team and will be read by a
> person, not a queue.

---

## Coordinated disclosure

We ask for coordinated disclosure and we will work with you on it rather
than against you.

- Tell us privately first, and give us a reasonable chance to fix it
  before you publish.
- We will agree a disclosure date with you rather than impose one, and we
  will not ask you to sit on a finding indefinitely.
- We will credit you by name or handle if you want it, and leave you out
  if you do not.
- We will not ask you to sign an NDA as a condition of reporting.

**On legal safe harbor.** Our intent is that good-faith security research
conducted within the scope below, which respects the data of real people
and stops at proof, is welcome and will not be met with a legal
complaint from us.

> **⚠ For counsel.** The paragraph above states an intent, not a
> warranty. A binding safe-harbor clause — its exact wording, whether it
> can bind our customers as well as us, and how it interacts with the
> computer-misuse statutes of the reporter's own country — is a lawyer's
> to write. It is on the same list as the open questions at `/dpa`.

---

## Scope

### In scope

- The deployed application and its API routes.
- The application source in this repository: everything under `src/`,
  `prisma/`, `scripts/` and the configuration files at the root.
- Authentication and session handling, and anything that lets one
  company's seat reach another company's records.
- Anything that lets a bearer-token link — a supplier application, a
  document packet, a reply link — be guessed, reused after it should have
  expired, or widened beyond what it was issued for.
- Anything that lets a scheduled-job route run without the shared secret.
- Anything that causes personal data to be sent somewhere the privacy
  notice at `/privacy` does not say it goes. That is not only a bug, it
  makes a published document untrue, and we would rather hear about it
  than have a customer find it.

### Out of scope

- **Third-party providers.** Vercel, the managed Postgres host, Resend,
  SendGrid, Anthropic, Microsoft Entra and Google. Report those to them;
  we will help you route it if you are not sure where it goes.
- **The demo world.** `/demo` and the seeded companies — Nike, Corning,
  Terumo BCT, CloudEPA and the rest — contain no real people and no real
  money. Please test there rather than against a real tenant.
- **Everything already listed in `docs/security-posture.md` §14.** No
  SOC 2, no penetration test, no rate limiting, no security headers, no
  retention schedule, MFA not enforced by us, access logging that covers
  some routes and not all. These are known, published, and unfixed. A
  report restating one is a welcome nudge but is not a new finding.
- Social engineering of Etyme's people or its customers'.
- Denial of service, volumetric testing, or anything that degrades
  service for a real user.
- Automated scanner output with no demonstrated impact.
- Missing hardening headers reported on their own — see the known list
  above.
- Anything requiring physical access, a rooted device, or a
  man-in-the-middle position on the reporter's own machine.

### Never, under any circumstances

Do not access, alter or exfiltrate the data of a real person or a real
company. Contingent workers' records here include immigration status,
onboarding paperwork and pay. Prove the flaw on the demo world, or stop
at the first record that proves your point and tell us.

---

## Supported versions

There are no versions. Etyme is a single deployment on a rolling release
from `main`, with no supported branches behind it and no back-porting.
A fix ships to the one deployment.

*(The version table that used to sit here was GitHub's template and never
described anything real.)*

---

## Rewards

**There is no bug bounty and no payment.** We are pre-revenue and no
budget exists. We are saying so plainly so that nobody spends time here
expecting one. What we can offer is credit, a straight answer, and a fix.

---

## What we already know about ourselves

`docs/security-posture.md` is the document we send to a client's security
review. It states what exists, with a file reference for each claim, and
it states what does not exist with the same specificity — no
certification we do not hold, no control we have not built, and no
roadmap item nobody has committed to.

Read §14, "Not there", before you spend time on a finding. It is the
honest list, and it is longer than most companies would publish.

---

*Last reviewed 2026-09-15. The placeholder banner at the top of this file
comes out when the founder sets the real address — and not before.*
