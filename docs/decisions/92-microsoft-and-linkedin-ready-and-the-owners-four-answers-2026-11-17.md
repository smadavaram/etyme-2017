## Microsoft and LinkedIn are ready, and the Owner's four answers — 2026-11-17

**What came in.** An update from Sharath, through Pax, with his approved
answers to the four owner questions. Sharath is the Owner of Tapin.

**Part 1: the sign-in providers.**
- *Microsoft.* The directory tenant is provisioned and verified. The
  company's own web address is verified as a custom domain in it, with one
  text record added at the host. The mail records are unchanged, and the
  domain is neither primary nor federated. Nothing on the Microsoft side
  blocks Layer 7. The app registration waits on the endpoints below.
- *LinkedIn.* An app is created with "Sign In with LinkedIn". Its
  redirect addresses are empty until the callback below is registered.
- *The identifiers.* The tenant id, the client ids and every secret stay
  in the hosting project's settings and in the founder's hands. None is
  written in this repository.

**What Etyme asks of each registration** (read from the code, 2026-11-17).
- *Microsoft, the ordinary sign-in door.*
  - Redirect address: `https://<the production address>/api/auth/callback/azure-ad`.
  - Scopes: `openid profile email`.
  - Environment: `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`,
    `AZURE_AD_TENANT_ID`.
- *A company's own directory* (Entra or any OIDC provider). One redirect
  address serves every company:
  `https://<the production address>/api/sso/callback`.
  - Scopes: `openid email profile`, with PKCE (S256), state and nonce.
  - Claims read: `sub` (the identity, with the issuer), `email` (else
    `preferred_username` or `upn`), `name`, and `groups` for the
    group-to-role map. The claim names are settable per company.
  - Groups in a token need the app registration's "groups" claim turned
    on.
  - SCIM base: `/api/scim/v2` (Users and Groups), with a token per company.
- *LinkedIn* (candidates only):
  - Redirect address: `https://<the production address>/api/auth/callback/linkedin`.
  - Scopes: `openid profile email`.
  - Environment: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.
- *Google* keeps `/api/auth/callback/google`.

**Part 2: the Owner's four answers** (approved by Sharath).
1. *The first pay-period Sunday is Dec 27* (2026). This settles one of the
   two decisions that waited on the Owner.
2. *A holiday added later does not move pay days already written.*
   Holidays affect only periods not yet written.
3. *A public company page prints the firm, never a person's name.* The
   default is off. An Owner may opt in later.
4. *A W-2 week worked outside the US is paid under the local overtime
   rules of the country where the work was done* (short-term
   employment). The hold applies only where that country's rule is not
   known or not yet configured: then the week over 40 hours is held and
   flagged where a person sees it, until the rule is set. This settles the
   other decision that waited on the Owner. Sharath corrected the first
   wording of this answer the same day. A country rule is enforced only
   after regulatory confirms it with its source (CLAUDE.md, Papers).
   Sharath added: a person on a business visa is usually not paid in that
   country at all. Pay stays with the home employment, and the home rules
   apply, unless the location of work is moved there. Local pay and local
   rules attach when the work location is moved, never because of a
   business-visa trip.

**The bill question** (Sharath's answer: yes). For a client that is not on
Etyme, the bill shows the supplier's chosen account, with the line:
"Confirm these details with [supplier] by phone before your first
payment." This is the one case where a bill prints an account that no
payer on Etyme has confirmed.

**Still coming.** The numbers from the live bank-check report. Sharath
will send them. The per-customer payment switch stays off until then.
