## After a pass, the new Owner may move the old one to Admin; Etyme handles a change of ownership by hand on papers — the founder, 2026-11-12

*"Once owner is decided admin should never be able to remove him, but
owner should be able to remove an admin."* Then: *"A new proven and
agreed owner transitioned from old can reduce the status of old owner
to admin. Etyme can manually handle this in case of change of ownership
after they submit agreements and tax forms."* Decided:
- **An Admin never pauses, ends, demotes or removes an Owner; an Owner
  may pause or end an Admin.** Built on both screens (c4449e7c4,
  6924de295), not deployed yet.
- **The Owner who took over by a pass may move the previous Owner to
  Admin alone.** This is the one exception to "removing or demoting an
  Owner needs another Owner's yes": the previous Owner agreed to the
  pass, and the new Owner has proven the domain and their identity.
  It applies only to the person they took over from, is recorded with
  who and when, and the previous Owner is told.
- **Etyme may change a company's Owner by hand where ownership of the
  business itself changed** (a sale, a death, a founder who left and
  cannot be reached). The claimant sends the agreement that shows the
  change and the company's tax form; a Superadmin records what was
  received (which papers, their dates, who checked them), seats the new
  Owner and moves the old one to Admin or ends the seat. Every current
  Owner is told first where an address exists, and the act is logged as
  the emergency seat already is. This sits beside recovery by domain
  proof, for a company with no domain or where the domain did not
  change hands. Etyme checks that the papers were supplied and by whom;
  it gives no legal opinion on them (regulatory and counsel confirm the
  wording and what is kept).
- Built after Owner by proof: the exception in `lib/owner-rules`, the
  Superadmin act and its record (architect), the wording and retention
  (regulatory).
