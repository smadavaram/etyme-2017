# Turning on the Etyme bot in Microsoft Teams

The bot lets a program owner or an AP desk approve an invoice receipt, or
see a time-limit risk, from a card in Teams. It is a route inside Etyme
(`/api/teams/messages`), not a second service.

Until the three keys below are set, the route refuses every post, and
`/ready` shows the Teams bot as missing.

## What you need

- An Azure account that can create resources.
- Admin rights in Microsoft Entra (to register an app).
- Access to the Etyme project in Vercel.
- A Teams account that may upload custom apps (or a Teams admin who can).

## Steps

| Step | Who | Where | What to do |
|---|---|---|---|
| 1 | Founder | Entra admin center → App registrations | **New registration.** Name: `Etyme bot`. Account type: *this organization only* (single tenant). No redirect address. |
| 2 | Founder | the new app → Overview | Copy **Application (client) ID** and **Directory (tenant) ID**. |
| 3 | Founder | the new app → Certificates & secrets | **New client secret.** Copy the **Value** now; it is shown once. |
| 4 | Founder | Azure portal → Create a resource → **Azure Bot** | Type of app: *Single Tenant*. Creation type: *Use existing app registration*. Paste the client ID and tenant ID from step 2. Pricing: *Free (F0)*. |
| 5 | Founder | the Azure Bot → Configuration | **Messaging endpoint:** `https://<your Etyme address>/api/teams/messages`. Save. |
| 6 | Founder | the Azure Bot → Channels | Add **Microsoft Teams**. Accept the terms. Save. |
| 7 | Founder | Vercel → Project → Settings → Environment Variables | Add the three keys below, for Production (and Preview if you want to try it there). Redeploy. |
| 8 | Founder | a terminal, in this repository | Build the app package (below). |
| 9 | Founder | Teams → Apps → Manage your apps → **Upload an app** | Upload `teams/build/etyme-teams.zip`. Choose *Upload a custom app* (or send it to your Teams admin). |
| 10 | Program owner | Teams → the Etyme app → **Open** | Write anything. The bot answers with your name and company, or says why it cannot. |

## The keys

| Name | Value |
|---|---|
| `MICROSOFT_APP_ID` | Application (client) ID, from step 2 |
| `MICROSOFT_APP_PASSWORD` | the client secret **Value**, from step 3 |
| `MICROSOFT_APP_TENANT_ID` | Directory (tenant) ID, from step 2 |

These are separate from the keys used for "Sign in with Microsoft".
Never paste the secret anywhere but Vercel.

## Build the app package

```
MICROSOFT_APP_ID=<client ID> ETYME_HOST=<your Etyme address, no https://> \
  node scripts/teams-package.mjs
```

It writes `teams/build/etyme-teams.zip`: the manifest with your bot id and
address filled in, and the two icons. It refuses in a sentence if either
value is missing or looks wrong.

## How a person is matched

- The bot reads the person's Microsoft sign-in address from Teams.
- It finds the person at Etyme with that address and a live seat at a
  company. The company whose domain matches wins.
- The bot acts with that seat's permissions and nothing more.
- Nobody at Etyme with that address: the bot says *"Nobody at Etyme has
  this email. Ask your company's owner for a seat."*
- A consultant is never reached in Teams. Etyme writes to consultants by
  email.

## How you know it works

`/ready` has a row **Teams bot**:

| State | Means |
|---|---|
| Missing | one of the three keys is not set |
| Set up, never used | the keys are set; nobody has answered a card from Teams yet |
| Proven | somebody approved or rejected from Teams, or the bot delivered a digest |

To prove it: as the AP desk at a client, open the Etyme app in Teams,
write "what needs me", and approve one invoice receipt from the card.

## What is not done yet

See `KNOWN-LIMITS.md`, section "Teams door — etyme-conversation".
The icons are a simple placeholder of the three rising strokes; replace
`teams/color.png` (192×192) and `teams/outline.png` (32×32, white on
transparent) with the brand kit's mark when it has one at those sizes.
