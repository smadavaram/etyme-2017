## Enterprise identity: the client's own directory is the only door, and small teams stay invite-only — the founder, 2026-11-11

The founder's build brief, given whole. Two kinds of people, never mixed,
and the order matters: **Track 1 first, the client and larger
companies**, whose people may never work outside their own directory (no
enterprise IT approves a personal Gmail, a magic link or a password
Etyme invented); **Track 2 second, Etyme's own people and small
suppliers**, invite-only with their existing Google or Microsoft
account. Built as one identity model. Tested against the five
questions: core problem strong ("remove them in your directory and they
are out here" is the test an enterprise IT department runs); trust
strong (it is the access-control evidence the assurance gate asks for);
simple strong. **Verdict: build now**, ahead of Google Chat.

What is decided, and what the scout found (read-only, 2026-11-11):
- **A tenant is a company, and its sign-in policy is one row per
  company** (`SSO_ONLY`, `INVITE_ONLY`, `HYBRID`), applying on every
  verified domain it owns. `SSO_ONLY` is for clients and larger
  companies, no exceptions: the password door, the email link, Google
  and Microsoft social sign-in, a claim link and the staff bootstrap
  all refuse for it, at the API and not only on the screen, and each
  refusal is ledgered.
- **The client's directory authenticates; Etyme inherits its MFA and
  password rules and re-implements none.** Microsoft Entra ID by OIDC
  first (the same binding serves the web and Teams); generic SAML 2.0
  and generic OIDC by configuration, never a build per vendor brand.
  Secrets live in the platform secret store, never in the database in
  plain text, never in a log.
- **Identity is the IdP's issuer and subject, never the email.** Today
  a person is their lowercased email and `Credential.providerId` is
  stored and never trusted; there is no issuer column. The subject is
  the key, the email a display name.
- **Provisioning is SCIM 2.0 first** (`/scim/v2/Users`, `/Groups`),
  just-in-time on a first sign-in only where the Owner or Admin enabled
  it; a directory group maps to an Etyme role by tenant setting.
  **Deprovisioning is the sale:** a person removed or disabled in the
  directory loses the seat at once, live sessions die and a ledger entry
  is written. Today a session is a 30-day JWT with no revocation list;
  a revoked seat stops working per request (`getCallerContext` rereads
  the Context) but the token stays valid. The kill is a per-request
  check of a session-version on the person against the directory's
  status, so enforcement sits in two places: the sign-in callback for
  new sign-ins and `getCallerContext` for live ones.
- **Words and the ladder do not change.** Owner and Admin, never "Tenant
  Admin" or "super-owner"; Superadmin stays platform-only and never
  reads a company's data. An Admin never acts on an Owner, so a
  directory deprovision of an Owner follows the Owner rules (another
  Owner's yes, never the last Owner).
- **No break-glass.** Not for support, not for admins, not for
  Superadmin: the staff bootstrap and claim links refuse an `SSO_ONLY`
  company like every other door. A break-glass, if ever proposed, is a
  separate, ledgered, time-boxed decision for the founder.
- **A supplier's people belong to the supplier's own company**, scoped
  into the client's program by a grant the client revokes; they are
  never put in the client's directory, and a small supplier's Track 2
  sign-in never reaches the client's interior.
- **Track 2 keeps the password door and an invitation beats the
  consumer-domain rule.** The 2026-10-08 password door stays for
  `INVITE_ONLY` and `HYBRID` companies, because a small firm with no
  Google or Microsoft needs some way in; the brief's "no Etyme password
  for anyone" is applied to `SSO_ONLY` companies only (the founder may
  tighten it in a sentence). An invited Gmail address is seated through
  its invitation: an existing invited seat beats the consumer-domain
  candidate rule. Required 2-step verification on an invited account is
  shown as a warning where it cannot be confirmed, never claimed.
- **Ledger events**, all mandatory, each with time, company, actor,
  subject, the policy cited and the surface: SSO configured, domain
  verified, user provisioned, user deprovisioned, group mapped to a role,
  login succeeded, login refused because SSO only, invite sent, invite
  accepted, membership revoked, auth policy changed. They go to the
  existing logs (`AccessLog`, `AutomationLog`) with named actions, not a
  third ledger.
- **A mock identity provider** (OIDC routes inside this app, signed with
  `node:crypto`, gated to reserved demo addresses) stands in for a
  client's directory in the demo. It is a mock and `KNOWN-LIMITS.md`
  says so; the configuration screen is real. No second runtime.
- **Two passes, never blended.** Pass 1 is the demo path end to end:
  SSO-only sign-in through the mock, disabled at the directory and the
  next request refused, every other door refused for that company, an
  invited Gmail Owner in and then removed, a supplier scoped to its own
  records, the ledger readable. Pass 2 (real SAML certification,
  directory conformance suites, penetration-test preparation) only when
  the founder asks. **Testing budget:** unit tests only for the
  SSO-only refusal at every door, deprovisioning ending the session,
  isolation and supplier scoping, and ledger integrity of the identity
  events; no other new test file without asking.
- **Not built:** any language model in identity or access, an Etyme
  password system for an `SSO_ONLY` company, an `@etyme.com` mailbox
  forced on a partner. The brief's "wedge" sentence is not adopted: the
  wedge is still undecided (see "Tenure is the moat, not the wedge").
  No enterprise vendor is named on any page or file.
- **Public words, when built:** *"Your team signs in through your
  company's directory. No separate Etyme password."* for a client;
  *"Invited by email, sign in with Google or Microsoft."* for a small
  team. No company-size range anywhere.
- **Decided by the founder, 2026-11-11: the three partners join Tapin as
  Admins.** Sidhu (sidhu871@gmail.com), Vineel Kumar Sriramaneni
  (vsrirama147@gmail.com) and Vikash Kumar Ippili
  (vikashippili@gmail.com) are invited to Tapin, the founder's business
  that runs on Etyme, in the Admin role: below the Owners (sharath and,
  when invited, smadavaram), never able to act on an Owner. They sign in
  with the Gmail address they were invited on; no @etyme.com mailbox is
  made for them (the brief's `sidhu@etyme.com` does not exist and
  bounces). The brief's "Owner" for the three is superseded by this.

- **Built in this order:** the schema (a company's policy, an IdP
  configuration with a secret reference, SCIM tokens, a group-to-role
  map, an issuer on the credential, a session version), queued through
  the architect after the Superadmin limits table; then the policy at
  the sign-in callback and `getCallerContext`; the OIDC door and the
  mock provider; SCIM; the Auth settings screen with its plain
  sentence; then the demo walk.

### Who may sign in with what, and governments — the founder, 2026-11-11, later the same day

*"Only the workers and solopreneurs can have Gmail or LinkedIn login. Rest
would be Microsoft, Google enterprise or Okta login. We need to create
[a] mechanism for governments globally."* Decided:
- **Consumer sign-in is for people, never for a company's seat.** Gmail
  and LinkedIn are doors for a **worker** and a **solopreneur** (a
  one-person firm). A company with more than one person, a client, an
  integrator, an MSP and a government body sign in only through a
  **company directory**: Microsoft (Entra ID), Google Workspace, Okta or
  any other identity provider by standard configuration. A Gmail address
  never holds a seat at a company that has colleagues.
- **LinkedIn becomes a sign-in door, for workers and solopreneurs only.**
  This reverses "LinkedIn is a profile field, not an auth provider"
  (User populations table). It is LinkedIn's standard OpenID Connect
  sign-in; the profile URL stays a field. No other use of LinkedIn data.
- **Governments are a configuration, not a build per country.** The one
  mechanism is the standards every national and agency identity system
  already speaks: OpenID Connect and SAML 2.0, configured per company with
  its issuer, keys, the claims that name the person and the role, the
  assurance level the government requires, and the region the data stays
  in. Smart-card and national-ID sign-in reach Etyme through the
  government's own identity provider, never by Etyme reading a card. A
  new country is a configuration row and a verified domain, never code.
  What Etyme does not claim: any government certification or
  authorization it does not hold. The honest security page says what is
  done and what is not.
- **Conflicts with earlier decisions, said once:** the password door
  (2026-10-08) and the invited-Gmail seats (the three partners at Tapin,
  2026-11-11) are now for a one-person firm only. Tapin has more than one
  person, so it needs its own domain on a company directory (Google
  Workspace); until then its Gmail partners are a recorded, ledgered
  exception for Tapin alone, ending the day its domain is verified, or
  the founder removes it in a sentence.

### Hybrid is the Owner's choice — the founder, 2026-11-11, "B allow hybrid"

This replaces the strict line above ("a Gmail address never holds a seat
at a company that has colleagues") and the Tapin-only exception with it.
- **A company's Owner may choose hybrid**: its own people sign in through
  its directory where it has one, and the Owner may also invite people on
  public addresses (Gmail, LinkedIn). The choice is recorded with who and
  when. A company with a directory defaults to directory-only until its
  Owner chooses otherwise.
- **An invited public-address seat is limited**: invitation only, never
  join by domain; no money or signing acts (paying, sending bills, bank
  checks, agreements, awards, payroll); a client reads a plain note that
  the supplier has seats outside its directory; and a client may require
  directory-only suppliers, which is then checked when it approves one.
- **Directory-only is never hybrid by the back door.** A client, a larger
  company or a government body set to directory-only refuses every other
  door, as decided above; only its own Owner changes the mode, ledgered.
- **Tapin's three partners sit under this rule**: Tapin's Owner chooses
  hybrid and invites them; no special exception is kept.
- Still open for the founder: whether the password door stays for
  one-person firms or goes entirely, with the emailed link as fallback.

### The first person is an Admin; Owner is earned by proof — the founder, 2026-11-11

*"The first user is an admin and not owner. They need to prove domain
ownership and personal verification"*, the way business software that
moves money checks a company before it trusts it. Decided, not built:
- **Whoever signs a company up is seated as Admin**, never Owner. This
  reverses the sign-up rule (the first person was the Owner since
  2026-10-07). The company works at once for setup, invitations, jobs
  and people.
- **Owner is earned by two proofs, both recorded with who and when:**
  the company's **domain** (the DNS proof that exists, or sign-in
  through the company's own directory as its administrator), and the
  **person** (their identity checked by an identity-verification
  provider; Etyme renders no verdict, by the rule in "Who renders the
  verdict": the provider's result is recorded verbatim with its name,
  reference and date, and Etyme keeps no copy of an identity document).
- **Until a company has a verified Owner, the Owner-only acts wait**, each
  refused in a sentence that names the step: paying and bank details,
  signing an agreement, the company type, the sign-in mode, giving
  access by team or company, and passing ownership. Everything else
  works on the defaults (coordinator's call, reversible: the list of
  acts that wait is the founder's to shorten).
- **A one-person firm has no domain to prove**, so its person is verified
  alone and is its Owner on that proof.
- **Existing Owners stay Owners** and are asked to complete the two
  proofs; nothing is taken from a company already trading. Tapin's Owner
  was seated by the staff tool and Tapin has no domain of its own yet,
  so it is the first company to walk this.
- **Open for the founder:** which provider checks a person, and who pays
  for each check (a cost per person, so it touches pricing); whether a
  company's legal identity (its tax number against its legal name) is a
  third proof; and how long an unverified company may run before the
  reminder becomes a hold.
- Built after identity stage A and B, as its own piece: the sign-up
  seat, the two proofs and their screen in the setup checklist, the
  refusals that name the step, and the claim for a second Owner.
