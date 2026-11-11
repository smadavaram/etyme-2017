# Draft — a company's directory read, in the Privacy Notice and the DPA

**Status: a draft for the founder. Not live.** Nothing here is merged into
`privacy-text.ts` or `dpa-text.ts`, and neither page's "Last updated" date
moves. The legal pages change only on the founder's word (CLAUDE.md, "Team
structure is one tree the Owner draws, and it can come from the
directory", 2026-11-09: "the privacy notice and DPA line for a directory
read, for the founder's yes before any connection"). When he says yes,
each block below goes into its page as written, and both dates move to
the day it goes in.

Every line states what the code does today
(`src/lib/team-structure/directory/google.ts`, `sealed.ts`, and
`src/app/api/settings/team-structure/directory/route.ts`): one read-only
scope, refused if Google grants anything else; the refresh token sealed
before it is stored and never returned or logged; disconnect deletes the
stored row and asks Google to forget the grant; the verified domain only;
a preview the Owner or an Admin ticks, nothing written until then; nothing
written back to the directory.

One thing to fix before it goes live, so the last sentence stays true in
the way an auditor reads it: the directory route files its reads under
`CONTRACT_VIEW` today. `DIRECTORY_READ` is now a name in `AccessAction`
(`lib/access-log`), and the route is etyme-architect's to move onto it.

---

## Privacy Notice

### Section 3, Information we collect — one new row

| Category | Examples | Source |
|---|---|---|
| Your company directory (only if your administrator connects it) | If your company's Google Workspace administrator connects it, Etyme reads, read only, each person's name, work email, department, job title, office, country and manager, for your company's verified domain only. It uses them to propose changes to your team structure, which the Owner or an Admin approves one by one. Etyme never writes to your directory and reads no mail, files or calendars. The access is stored encrypted and is deleted when your company disconnects. Every read is logged. | Your company's Google Workspace administrator, who connects it |

---

## Data Processing Addendum

### Annex — one new processing line

**Directory read (optional).** Subject matter: the controller's staff
directory entries on its verified domain. Categories: name, work email,
department, job title, office location, country, manager. Purpose:
proposing the controller's team structure for its own approval. Access:
read only, one scope, granted and revocable by the controller's Workspace
administrator. Retention: the stored access is deleted on disconnect;
entries read are not kept beyond the changes the controller approves.
