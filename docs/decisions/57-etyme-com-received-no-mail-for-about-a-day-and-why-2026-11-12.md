## etyme.com received no mail for about a day, and why — 2026-11-12

What happened, said once so it is not repeated. The nameservers for
etyme.com moved to Vercel between November 9 and 11. The mail records
were not carried over: no MX, no SPF, no DMARC, no Google verification.
From then on nothing sent to an @etyme.com address arrived. The founder
reported it on November 12 (*"Our business Gmail stopped working"*) and
added the five Google MX records and the SPF record in Vercel DNS; they
were live on two public resolvers at 17:37 UTC the same day, with the
email service's three records untouched.

The cause was the coordinator's: it recommended moving the whole zone
where only the site's records needed to point at Vercel (founder: *"you
asked me to move everything to vercel instead of just domain"*), and
then listed "etyme.com has no MX records" among the open items of a
deploy note, as a chore, when it was an outage. Three rules follow:

- **A DNS change is checked against an export of the old zone, record
  by record, before the nameservers move and again after.** Mail first:
  MX, SPF, DKIM, DMARC. `docs/dns/etyme.com.mail-restore.zone` holds
  every record the old zone had.
- **A domain with mailboxes and no MX is an outage.** It is said to the
  founder first and alone, the minute it is seen, never as a line in a
  list.
- **The smoke after any domain or DNS change reads MX and SPF on public
  DNS**, beside the pages it already reads.

Still to add in Vercel DNS, none of them urgent: the DMARC record
(reports only), Google's own DKIM record from the Workspace admin
console, the three Google verification records, and the short Google
addresses (calendar, docs, mail). Mail, Calendar invitations and Meet
links work without them.

**And one lesson about the agents the same day.** Two workflows were
run at once, the usage limit ran out mid-afternoon, and the first-day
faults' three reviews died with it while less urgent work had used the
allowance. The work the founder is waiting on runs alone and first; the
rest starts when its reviews are in.
