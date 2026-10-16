# Run Etyme on Etyme

The one page to follow on the first day. The founder's bench business
becomes a real company on the record: **Tapin**, a vendor at
`tapin.etyme.com`, with five seats on etyme.com email addresses.

etyme.com is Etyme's own domain, so it is never Tapin's. The command
below makes no domain claim for it, and a Microsoft or Google sign-in
from an etyme.com address never makes or joins a company by its domain.

Production cannot send email yet. So staff make the first seats with one
command, and hand each person their own sign-in link.

## Before you start

You need two things:

| What | Where |
|---|---|
| The production address | today `https://etyme2040.vercel.app`, until etyme.com points at it |
| The `CRON_SECRET` | Vercel → the project → Settings → Environment Variables |

## Step 1. Make the company and its five seats

Run this once, from any terminal. Put your two values in the first two lines.

```bash
ETYME_URL="https://etyme2040.vercel.app"
CRON_SECRET="paste-the-secret-here"

curl -sS -X POST "$ETYME_URL/api/staff/bootstrap-company" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tapin",
    "domain": "etyme.com",
    "kind": "VENDOR",
    "address": "tapin",
    "seats": [
      { "email": "sharath@etyme.com",    "role": "Owner" },
      { "email": "support@etyme.com",    "role": "Admin" },
      { "email": "hradmin@etyme.com",    "role": "HR" },
      { "email": "oliver@etyme.com",     "role": "Account Manager" },
      { "email": "timesheets@etyme.com", "role": "AP & Payroll" }
    ]
  }'
```

## What comes back

A short answer in JSON:

- `company`: Tapin's id, its address `tapin`, and `created: true`.
- `seats`: one entry for each person, with:
  - `email` and `role`;
  - `outcome`: `CREATED` the first time;
  - `link`: their own one-time sign-in link;
  - `says`: one plain sentence about that seat.

No password is ever in the answer. Each link works once, for seven days.

If something is wrong, the answer says what in one sentence. When it
refuses, nothing is made. Fix it and run the same command again.

## Step 2. Give each person their own link

Send each link privately, to that person only. Do not post them in a shared chat.

Each person then:

1. Opens their link.
2. Chooses a password of twelve characters or more.
3. Signs in at the production address with their email and that password.

The Owner, sharath@etyme.com, signs in first. Etyme then asks the Owner five short setup questions.

## If a link is lost or runs out

Run the same command again. It does not make a second company or a second seat.

- A person who has never signed in gets a fresh link. The old link stops working.
- A person who has signed in is left alone. Their entry says so.

## Step 3. The first day

| Do this | Who | Where |
|---|---|---|
| Answer the five setup questions | Owner | shown after the first sign-in |
| Import students from a spreadsheet | Owner or HR | setup step "Your people", or Import under Setup |
| Add a course | HR | Training |
| Put graduates on the bench | HR | Our bench |
| Invite more people | Owner or Admin | Users & permissions, once the email key is set |

Until the email key is set, new seats come from Step 1. Add the person to
`seats` and run the command again.

## What this does not do

- It does not send email. That needs the email key in Vercel.
- It does not change anything for a person who has already signed in.
- It refuses a personal domain such as gmail.com, and the demo world's domains.
- On etyme.com it claims no domain, and it refuses the address `etyme`.

Every row it makes is written to the automation log as `STAFF_BOOTSTRAP`.
