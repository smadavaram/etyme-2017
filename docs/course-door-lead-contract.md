# Course door lead capture: the contract for the /learnai page

The course is paused; the door runs ahead of it. Etyme's own `/learnai` page
is the caller of this route. The page is another builder's; this file is
everything it needs to know.

## The question and the routing

"What are you?" has four answers. The answer is a door label kept on the lead.
The track follows from one table (`TRACK_FOR` in `src/lib/public-site/course-door.ts`,
ruled by Pax 2026-11-28). The page never sends a track; if it does, it is ignored.

| `leadType` | Track |
|---|---|
| `Worker` | Non-IT, or IT — Upgrade when the visible "I work in IT" switch is on |
| `Recruiter` | Entry Level |
| `Fresher` | Entry Level |
| `Kid` | Kids/student |

The switch is `worksInIT: true`. It changes the track for a Worker only; for
every other type it is ignored and kept as off. The switch is stored on the lead.

## Request

`POST /api/market/course-door` with JSON. No sign-in.

| Field | Required | Meaning |
|---|---|---|
| `leadType` | yes | `Worker`, `Recruiter`, `Fresher` or `Kid` |
| `email` | yes | The visitor's address. For `Kid`, a parent's or guardian's |
| `consent` | yes | The boolean `true`, from a tick or a press on the words below. The string `"true"` is not a yes |
| `worksInIT` | no | `true` when the "I work in IT" switch is on |
| `guardianEmail` | `Kid` only | `true` when the visitor confirmed the guardian words below |
| `company_website` | no | A hidden field. Leave it empty; a person never sees it |
| `filledInMs` | no | Milliseconds from the form appearing to sending. Under 1500 is refused |

The words beside the tick, exactly:

- Yes: `Email me when the course opens and about Etyme's free training. I can stop anytime.`
- Guardian (Kid only): `This is the email of a parent or guardian, not a child. We keep no name or age for a child.`

For `Kid` the page must not send a name, age, date of birth or school. If it does, the whole entry is refused.

## Responses

Success, `200`. The same sentence for a new address and one already on file:

```
{ "data": { "says": "..." } }
```

- Where email can leave: `Thank you. If the address is right, one confirmation is on its way, and we write again when the course opens.`
- Where it cannot: `Thank you. You are on the list. No email can be sent from here yet, so nothing will arrive until it can.`

Refusal, `400`: `{ "error": { "code": "...", "message": "..." } }`. Show `message` as is. Nothing is saved on any refusal.

| `code` | When | Sentence starts |
|---|---|---|
| `BAD_BODY` | Not JSON | Nothing readable arrived. |
| `SCRIPTED` | Hidden field filled, or sent too fast | That form has a field people never see... / That arrived faster than anybody types an address... |
| `CONSENT_NEEDED` | `consent` is not `true` | Tick the box that says "Email me when the course opens..." and send again. Nothing was saved and nothing will be emailed. |
| `TYPE_NOT_KNOWN` | `leadType` is not one of the four | "What are you?" has four answers: Worker, Recruiter, Fresher, Kid. |
| `NO_CHILD_DETAILS` | `Kid` with a name, age, birth date or school | We take no name, age or school for a child. |
| `GUARDIAN_NEEDED` | `Kid` without `guardianEmail: true` | For a child we write only to a parent or guardian. |
| `EMAIL_NOT_USABLE` | No @, no domain, too long, or an obvious throwaway | "..." is not an address we can write to. |

A missing yes is checked before anything but a script, so a visitor who forgot the tick is told about the tick.

## What is stored

- A lead row with source `COURSE_DOOR`, and `asked` reading `Free course · <type> · <track> · works in IT: yes|no`, with `· parent or guardian address` for a Kid. The row's consent time is the time of the yes.
- An address already on file from another door keeps its row as it was; the course yes is recorded on the ledger only.
- A ledger row (`COURSE_DOOR_LEAD`) with type, track, the IT switch, the time and the exact words of the yes. It holds the lead's id, never the address.
- Never a child's name or age. There is no field for either.

## Email

- One confirmation per address, ever, sent only where email can leave (`mailLeaves`). It carries a link that ends everything.
- Asking again records the new yes and sends no second confirmation. An address that has unsubscribed is never sent a confirmation that had not yet gone.
- If the send fails it is not tried again; staff get an incident and the lead is kept.
- The page must not say an email will arrive except by the `says` sentence the route returns.

## Unsubscribe

`GET /api/market/course-door/unsubscribe?email=...&token=...` (the link in the email; returns a one-line page) or `POST` the same two fields as JSON. The token is signed for that address only. Opening it twice changes nothing the second time. The reply is the same whether or not the address is on file.

- `200`: `You are unsubscribed. We will not write to this address about the course again.`
- `400` `LINK_NOT_VALID`: `That link does not match an address, so nothing was changed. Use the link in the latest email we sent you.`

## Junk

No IP counting, for the reason `/api/market/leads` gives: an office shares one address. The guard is the hidden field, the clock, the address check and one row per address.

## Not built, on purpose

- The page. Another builder's.
- Any email after the one confirmation. The course is paused.
- A column for the type, track and unsubscribe. They live in `asked` and on the ledger until the architect adds columns if wanted.
- The staff list at `/api/market/leads` does not yet hide an unsubscribed course lead from its "waiting" queue.
