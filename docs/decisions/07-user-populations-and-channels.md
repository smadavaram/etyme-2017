## User populations and channels

Two distinct populations, two auth paths, two notification channels.

| Population | Sign-in | Domain | Notifications |
|---|---|---|---|
| **Business users** (vendors, clients, MSPs, GSIs) | Microsoft (Azure AD / Entra), Google Workspace | Verified from OAuth tenant — corporate domain | **Microsoft Teams** webhook per company channel; email fallback |
| **Candidates** (consultants as individuals) | Google (Gmail), Email magic link, Yahoo | Consumer email — no company domain | **Email only** (transactional via SendGrid / Resend) |

**Domain detection rule:** if the OAuth domain is `gmail.com`, `yahoo.com`,
`outlook.com`, `hotmail.com`, or any known consumer provider → candidate, not
company admin. The OAuth tenant is the authority — replaces the 2017
`EXCLUDED_DOMAINS` check.

**LinkedIn** is a sign-in door for candidates only, since 2026-11-12 (see "The
sign-in page leads with the account buttons"). The button says "Candidates
only". A seat at a company never signs in with it. The profile URL stays a
field. No other LinkedIn data is used.
