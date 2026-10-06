# Multi-tier chain: fix specification (outside audit, 2026-10-05)

Received from the founder on 2026-10-06 as a PDF; text extracted verbatim below.
Status: proposed. Every root cause is inferred from the demo screens, not the code;
each claim is verified against the code before it is built, and the six decisions
in section 11 are the founder's. Terminology: the spec says "desk" and
"Monday to Sunday" in places where CLAUDE.md has since decided otherwise
(a week runs Sunday to Saturday).

---



Etyme multi-tier chain
Fix specification
From the audit of etyme2040.vercel.app on 5 October 2026. Status: proposed, for the developer thread.
1. Summary
The audit walked one chain end to end: candidate, bench company, sub-vendor, prime, client, and 
the money back down. It found 14 defects. Three are structural and share one cause; the other 
eleven are local. Fix the shared cause first, because two more defects disappear with it.
What this is based on. I tested behaviour in the demo and did not read the code. Every root cause 
below is inferred from what the screens and server replies showed, and the developer must confirm 
it in the code before building. Each fix states what was observed, the likely cause, the rule to 
implement, and how to prove it works.
What was not tested. Payment runs and payroll runs were not executed in the audit. The 
settlement rules in section 5 are designed from the seeded data, not from a tested run. The four-tier 
cascade (prime to sub to bench) was not exercised live either, because supplier onboarding blocked 
it.
Where it sits against the BRD. BRD v3.7 is a frozen baseline, so this enters as an addendum 
through the change log, not as a rewrite. Six decisions in section 11 need ratifying before the related 
work starts.
The defects, grouped
#Defect observedTypeFixed in
1Sub-vendor profit uses the prime's client rate 
(Techpeple shows $145 for a $118 sale)
StructuralSections 3, 4
2Prime profit omits bought-in consultants (CSI shows 
2 of 4 placements)
StructuralSections 3, 4
3Two sides of one invoice disagree on paid statusStructuralSections 3, 5
4Upstream rate leaks to the tier belowFollows from 1Section 3
5Bought consultants listed twice in the buyer's sell 
contracts
Follows from 1Section 3
6Award writes W2 employment at $0/hr without the 
person agreeing
LocalSection 6
7Placement status contradicts itself; start date before 
award
LocalSection 6
8Candidate cannot ask to join a benchLocalSection 7
Etyme multi-tier chain: fix specification · page 1

#Defect observedTypeFixed in
9One-person firm cannot approve a supplierLocalSection 7
10Forwarding a job creates a duplicate on every clickLocalSection 7
11Dates shift by a day between screens and 
companies
Local, wideSection 8
12Bill generation fails silently; one-week bill stamped as 
a full month
LocalSection 8
13Notification emails fail (Resend 403); 376 reminders, 
362 already past
LocalSection 9
14Unknown demo desk name seats the caller as 
Owner
LocalSection 9
2. Root cause
One placement is seen by up to five companies. The app holds the money facts for that placement 
(rate, billed value, paid status) in records that more than one company reads, and it reads them 
without first asking whose agreement the number belongs to.
Evidence
•Techpeple sells Helena Marsh to Computer Systems Inc (CSI) at $118/hr. Its profit screen 
shows $29,000 billed, split $11,600 and $17,400 by month: exactly 80 and 120 hours at $145, 
the rate CSI charges Northbend. Margin shows 54.6%; its own payroll screen shows 24%.
•Sahasra Infotech sells Tomasz Nowak to Vertex Global at $103/hr. Its profit screen shows 
$20,480 billed. That fits 160 hours at $128 and does not fit $103. I did not see Vertex's rate to 
the client, so $128 is inferred. Same pattern on a second chain.
•CSI's profit screen lists only its two employees. Helena and Priya, both bought from Techpeple 
and both billed by CSI, are absent. CSI shows minus 6.2% on Profitability and 22.5% on 
Reports.
•Sundara Systems' sell-contract list shows each bought consultant twice: its own sell line and its 
supplier's sell line marked "via Sundara Systems". Active contracts reads 8 where 4 are real.
•Techpeple shows two invoices to CSI as paid. CSI's chain view says CSI has not yet paid 
Techpeple.
Likely cause (to confirm in code)
The order or master contract that revenue posts to appears to be created once per placement and 
owned by the company at the bottom of the chain, the employer. Accepted hours are valued at the 
top rate, the one the client signed. So client-rate revenue lands in the bottom company's books, and 
the companies in the middle have nothing posted to them.
Etyme multi-tier chain: fix specification · page 2

3. Target model
3.1 The placement chain
A placement is one person working at one end client. It carries an ordered list of hops. A hop is one 
commercial agreement between one seller and one buyer. Helena's placement has three:
HopSellerBuyerRatePaper
0Helena MarshTechpeple$90 payEmployment, W2, paid by payroll
1TechpepleCSI$118Techpeple's sell contract and CSI's 
purchase order: one record
2CSINorthbend Athletic$145CSI's sell contract and Northbend's 
purchase order: one record
•A hop is stored once. The seller sees it as a sell contract, the buyer as a buy contract. They 
are two views of one record and cannot drift apart.
•Hop 0 is always the person and the first company. It carries the engagement type: W2 
employee, 1099 independent, the person's own company, or employed by another firm.
•A company's position is the two hops it touches. It is buyer on one (its cost) and seller on 
the next (its revenue). The client touches only the top hop. The person touches only hop 0.
•Chains have any length. A prime placing its own employee has two hops. Client, prime, sub, 
bench and person has four.
3.2 The hop ledger
Every money event posts to exactly one hop: accepted hours valued at that hop's rate, a bill raised, 
a payment, an expense, a commission. Nothing posts to the placement as a whole. A company's 
books are the sum of postings on the hops it is party to.
3.3 The visibility rule
One rule, enforced where data is read, not screen by screen: a company may read a hop only if it 
is the seller or the buyer on it.
•A company may know that hops exist above or below it, and how many. It never reads their 
rates, values, bills or payments.
•Whether it learns the names of firms further along is a setting on the hop (decision 2 in section 
11).
•Exceptions are explicit, logged grants: a client's compliance view of who the employer is, or a 
program office desk the client has granted.
•Every query that returns a rate, a value, a bill or a payment takes the viewing company as an 
input and returns only that company's hops. A query without it must fail.
Etyme multi-tier chain: fix specification · page 3

3.4 One timesheet, valued per hop
Hours are filed once by the person and signed down the chain, client first, then each seller in turn. 
That part works today and stays. The change: value is never stored on the timesheet. It is always 
hours multiplied by the rate of the hop being viewed.
ViewerSees for Helena's 40-hour weekSource
Northbend$5,800 costHop 2 at $145
CSI$5,800 revenue, $4,720 costHops 2 and 1
Techpeple$4,720 revenue, $3,600 costHops 1 and 0
Helena$3,600 owedHop 0 at $90
4. Fix 1: profitability per tier
Observed
Company and personScreen showsShould showWhy it is wrong
Techpeple, Helena$29,000 billed, 54.6%$23,600 on 200 hours, 
about 24%
Valued at CSI's $145
Sahasra, Tomasz$20,480 billed, 42.8%$16,480 if 160 hoursValued above its own 
$103
CSI, Helena and PriyaNot listedListed, spread $27 and 
$26/hr
No postings to the 
middle tier
CSI, Daniel OseiMinus 22% here, 27% 
on Payroll
One numberCost works out near 
$140/hr on an $84 pay 
rate
Rule
•Revenue for a company on a placement is accepted hours multiplied by the rate on the hop 
where it is the seller.
•Cost is accepted hours multiplied by the rate on the hop where it is the buyer. On hop 0, cost is 
pay plus employer burden. Expenses and commission posted to that company are added.
•One margin service. Profitability, Reports, the Payroll margin column and the placement page 
all call the same calculation. No screen computes margin on its own.
•Every placement where the company is a seller appears, whether the person is its own 
employee or bought in.
•Two numbers, two names. "Agreed spread" is the difference in rates. "Earned margin" is from 
accepted hours. Never show either under the bare word margin.
Etyme multi-tier chain: fix specification · page 4

•"Billed" means invoices raised. What the screen calls "Billed, hours signed on both sides" 
becomes three figures: accepted and not yet billed, billed, collected.
Daniel Osei
This one is not a chain problem: he is CSI's own employee on a two-hop placement. Bill $115, pay 
$84, yet cost posts at about $140/hr ($22,448 against $18,400 billed). Trace what is being added. 
The candidates are burden applied twice, or hours counted from two pay periods against one period 
of revenue. The single margin service must reproduce the 27% the Payroll screen shows, or explain 
the difference line by line.
Migration
If value is derived from hours and hop rates, nothing stored needs converting: recompute. If totals 
are stored on orders, rebuild them from accepted timesheets and delete the stored totals so they 
cannot disagree again.
5. Fix 2: one invoice, two views
Observed
•Techpeple shows invoices IN-8Z5A45 for August and September as paid. CSI's chain view 
says CSI has not yet paid Techpeple.
•CSI's headline reads "we owe $41,520" and the aging buckets under it total $4,720. The note 
says the headline includes two receipts keyed in by hand.
•CSI holds a receipt for Helena's earlier weeks. Techpeple's own bill list has no bill for them.
•The chain view pairs a supplier invoice with a client bill by taking "the largest overlapping bill", 
and says the pairing is inferred.
Rule
•A bill between two companies on the platform is one record on one hop. The seller's bill 
and the buyer's invoice receipt are two views. Status has one value, read by both: issued, 
submitted, approved, part paid, paid.
•Payment is recorded once, by the payer. The payee confirms receipt. Until then both sides 
show the same words: "paid, not confirmed". (Decision 3: confirm by hand, or automatically 
after a set number of days.)
•Keyed-in receipts are linked or flagged. A receipt typed in by hand exists for suppliers who 
are not on the platform. When a platform bill exists for the same hop and period, the keyed-in 
one is marked a possible duplicate and left out of totals until a person resolves it.
•A headline equals its breakdown. Totals and aging on one screen come from one query. A 
test fails the build if they differ.
•Chains link through timesheets, not guesses. Every bill line carries the timesheet it bills. 
Two bills on adjacent hops that share a timesheet are linked. Inference is used only when a 
keyed-in receipt has no lines.
Etyme multi-tier chain: fix specification · page 5

•Pay-when-paid is a term on the hop. Where set, the hop's due date starts when the hop 
above it is paid. The screen for this exists; it needs the timesheet link to work.
Paying down
Payroll is hop 0. It reads accepted hours and the pay rate and does not wait for upstream payment 
unless the engagement terms say so. A person paid through their own company is a seller on a hop 
like any other firm, and is paid by invoice.
6. Fix 3: hire terms and the award cascade
Observed
•Marisol Quintero granted Brightmoor a bench listing, which is permission to market her. On 
award the system wrote "Brightmoor Staffing employs Marisol directly", W2, at $0/hr. She was 
never asked.
•The placement started on 28 September, a week before the 5 October award. Reminders for 
hours, bills and pay days were generated in the past.
•Northbend's contractor list says "on site, nothing needs you". Its program page says she 
cannot start without proof of right to work.
•She was placed one minute after round 1 was booked, and the round was cancelled.
•"Record a placement" has no field for engagement type and none for the supplier a person is 
bought from.
•Both sides label how she arrived as "through a partner firm". There is no partner.
Rule: terms before start
•A listing is not employment. It may carry agreed terms (engagement type, pay rate or split). 
Terms are optional when listing and required before a placement can start.
•Award opens a gate. The client's award creates the placement in the state "awarded, terms 
pending". Each hop must be confirmed by both of its parties. Upper hops take their rate from 
the submission. Hop 0 is confirmed by the first company and by the person, on the person's 
own page.
•No zero defaults. An empty rate blocks the hop. The placement page already has the right 
words: "a missing rate, not a free placement".
•Four engagement types on hop 0. W2 employee. 1099 independent. The person's own 
company, which adds a hop where that company is the seller. Employed by another firm, which 
adds that employer as a hop and needs its consent.
•"Record a placement" gets two fields: engagement type, and bought from. That covers a 
vendor placing an independent, its own employee, or a person from another firm's bench.
Rule: one status, real dates
•One status field, read by every screen: awarded and terms pending, papers pending, ready, 
on site, ended.
Etyme multi-tier chain: fix specification · page 6

•Start date cannot precede the award unless a person marks it as work already under way.
•Reminders generate from activation, never for dates already past.
•"How they came" is derived from the chain: own employee, own bench, or through a named 
supplier.
Rule: the cascade
On award, notice travels one hop at a time: client to prime, prime to sub, sub to bench, bench to 
person. Each company is told its candidate was selected for the job as that company knows it, at its 
own rate. Interview requests and rejections travel the same way. The audit saw this work across two 
tiers. Build the test for four.
Placing without an interview should ask for confirmation and record that it happened (decision 4).
7. Fix 4: how parties enter the network
7.1 Candidate asks to join a bench
Observed: only a firm can start a listing. The person can answer yes or no.
Rule: add "Ask a firm to market me" to the person's "Who has you" page. The person searches firms 
that have chosen to be findable and sends a request with a link to their page. The firm's resource 
manager accepts or declines. Acceptance creates the same listing record an invitation creates, with 
consent already given and a field recording who asked first.
7.2 Supplier approval at a small firm
Observed: Vertex Global has one user. He recommended Brightmoor as a supplier. The approval 
needs a second person because nobody signs their own recommendation, and there is no second 
person. The screen says so and stops.
Rule: approval steps scale with seats. With several seats, the full route stays. With two, the 
recommender cannot be the final approver and the other desks collapse into one. With one, either 
the firm is walked through inviting a second person, or it may approve alone with the reason logged.
This conflicts with Addendum E, which lists segregation of duties as a block. That was written for 
clients with several hiring managers. Applied to a one-person vendor it means the firm can never 
add a supplier, and the chain cannot form. Decision 1.
7.3 Forwarding a job
Observed: "Send to your own suppliers" creates a new copy of the job on every click, with no 
confirmation. Vertex now holds three copies of one Cavanaugh job. Each copy says "How it came in: 
typed in here" and "Rate: not specified", though the client stated $95 to $115.
•One child per company per job. A second click opens the existing child.
•The child records its parent. The forwarding company sees "came from Cavanaugh 
Glassworks". Skills, dates and location are inherited.
Etyme multi-tier chain: fix specification · page 7

•The child has its own rate band, set by the forwarding company. If the client shared a band, 
the company sees it beside its own and is warned if it offers more than it was offered. If not, the 
screen says "rate not shared by client".
•The supplier below sees the forwarding company as its customer. Whether it also sees 
the end client follows the disclosure setting.
•Submissions against a child appear on the parent for the forwarding company to pass up or 
hold.
•Clean up the duplicates already in the demo data.
8. Fix 5: dates, periods and billing
Observed
ItemOne screenAnother screen
CSI invoice to Northbend, periodJul 31 to Aug 30 (CSI)Aug 1 to Aug 31 (Northbend)
Same invoice, due dateOct 14Oct 15
Helena's latest weekSep 28 to Oct 4 (decisions)Sep 27 to Oct 3 (timesheets)
Helena's earlier weekSep 18 to Sep 22Sep 17 to Sep 21
Cavanaugh job startNov 13 (client)11/12 (prime)
Marisol joined benchDone Oct 5, Denver timeShown as Oct 6
Her interview timeShown to her in UTCn/a
Helena's week picker"Wed Sep 23 to Sun Sep 27""Mon Oct 5 to Tue Oct 6"
Rule: two kinds of date
•Calendar dates are period start and end, due date, start date and work week. Store them as 
plain dates with no time and no time zone. Everyone sees the same day.
•Moments are signed at, submitted at and interview time. Store them in UTC and show them in 
the viewer's zone, with the zone named.
•One shared formatter for each kind. Screens may not format dates directly; add a check that 
fails the build if they do.
•One work week per placement, set from the client's week, default Monday to Sunday. Every 
screen shows the same seven days. The picker offers whole weeks only.
Rule: billing
Observed: asking for a bill covering 1 August to 4 October returned "Nothing signed and unbilled 
belongs to August 2026". The server read only the starting month, and the screen showed nothing at 
all. Without dates, a bill for one week was stamped 1 to 31 October and due 15 December, with 
October still running.
Etyme multi-tier chain: fix specification · page 8

•A date range selects accepted weeks whose last day falls inside it, across months.
•The bill period is the first to the last day of the weeks on it. A month is stamped only when 
the contract bills monthly and the month has closed.
•Due date is issue date plus terms, unless the contract states end-of-month terms.
•Every refusal from the server is shown in the form. No form may sit silent on a failed reply. 
One test covers every form.
•One bill number format. Generated bills read IN_1AJA4X_001; seeded ones read IN-
8Z5A45-20260801.
•The engagement picker names who is billed. The server already returns "Techpeple bills 
Computer Systems Inc"; the form shows only the end client.
9. Fix 6: status, notifications and smaller defects
ObservedLikely causeFix
4 of 5 notices to Marisol: "Not sent, 
Resend returned 403"
Sending domain or key not 
authorised here, or demo 
addresses refused
In demo, label as "not sent, demo 
address". In production, alert on any 
403
"1 person told about 376 dates 
inside seven days, 362 already 
past"
Reminders generated for past 
dates
Never generate a reminder dated 
before now; none before activation
Unknown demo desk name seats 
the caller as Owner
Missing desk falls back to the 
highest role
Reject unknown desks. Check real 
role assignment for the same 
fallback
HR partner's menu links to Team; 
the page returns 403
Menu and server use different 
permission lists
Build the menu from the server's list
Decisions tab count stays at 1 after 
the item clears
Count not refreshedRefresh counts with the list
Payroll shows pay "overdue from 
Dec 2025" in fresh demo data
Seed dataSeed should not ship overdue pay
AP text: "the textbook ratio reads 
365 days"
Explanatory copy with a 
nonsense figure
Remove
My seat changed once mid-
session, from Cavanaugh HR to 
CSI owner
Probably another session in 
the same browser
Confirm; make a seat change in one 
tab visible in the others
Techpeple's contracts name 
Northbend and Harlow as end 
clients; the demo says the sub 
never learns the hospital
No disclosure settingPer-hop setting, decision 2
Etyme multi-tier chain: fix specification · page 9

10. Acceptance test
One scripted run with five parties and four hops. It is the release gate: every step has an expected 
result, and the numbers must match on every screen that shows them.
HopSellerBuyerRate
3PrimeClient$150
2SubPrime$130
1BenchSub$115
0Candidate (W2)Bench$90
1.Candidate asks the bench company to market her. Bench accepts. One listing exists.
2.Client raises a job and approves it. It goes to the prime. Prime forwards to the sub; sub 
forwards to the bench. Clicking forward twice creates one child, not two.
3.Bench submits the candidate to the sub at $115. Sub passes her to the prime at $130. Prime 
submits to the client at $150. Each company sees only its own rates.
4.Client interviews and awards. Notice reaches prime, sub, bench and candidate, in that order. 
The placement reads "awarded, terms pending" for all five.
5.All four hops are confirmed. The candidate accepts W2 at $90 on her own page. Status moves 
to ready, then to on site on the start date.
6.Candidate files 40 hours. Client signs. Prime, sub and bench accept in order.
7.Each party sees the week valued at its own hops, as in the table below.
8.Bench bills sub $4,600. Sub bills prime $5,200. Prime bills client $6,000. Each bill exists once, 
with the same number, period and due date on both sides.
9.Client pays prime, prime pays sub, sub pays bench, bench payroll pays the candidate. After 
each payment both sides show the same status.
10.Each company's profit screen matches the table. The client's budget shows $6,000 spent.
11.Negative test: signed in as each company in turn, request every other hop's rate, bill and 
payment by its identifier. Every request is refused.
PartyRevenueCostSpreadPer cent
Clientn/a$6,000n/an/a
Prime$6,000$5,200$80013.3%
Sub$5,200$4,600$60011.5%
Bench$4,600$3,600 plus burden$1,000 before burden21.7% before 
burden
Candidate$3,600 owedn/an/an/a
Etyme multi-tier chain: fix specification · page 10

Variants to run after the main script passes
•Candidate works through her own company: one more hop, and her company bills the bench.
•Candidate is employed by another firm: that firm is a hop and must consent.
•Prime places its own employee: two hops, no bench.
•A vendor records a 1099 independent through "Record a placement".
•A one-person vendor adds a supplier.
11. Build order and decisions
Build order
1.Hop model, visibility rule and margin service (sections 3 and 4). Largest piece. Defects 1, 2, 
4 and 5 close here.
2.Dates (section 8, first half). Mechanical and wide. Do it early so later testing is not full of one-
day mismatches.
3.Single invoice record and settlement (section 5).
4.Hire terms, status and cascade (section 6).
5.Billing rules (section 8, second half).
6.Entry points (section 7).
7.Smaller defects (section 9).
Each step ships with the acceptance-test steps it makes possible. Step 11 of the test, the negative 
test, gates any release that touches rates.
If a client demo comes before a vendor demo, this order is wrong for it. The client side passed 
the audit. What a client would see are the status contradiction on Marisol, the one-day date 
mismatches against its suppliers, and the failed emails. Those are sections 6, 8 and 9. Pull them 
ahead of the hop model for that demo, and keep vendor profit screens out of it until step 1 is done, 
because they show another firm's rate.
Decisions needed
#DecisionWhy it is needed
1May a one-person vendor approve a supplier 
alone, with the reason logged? Or must it invite a 
second person?
Addendum E lists segregation of duties as a 
block. Without a ruling, small vendors cannot 
build a chain
2Do tiers below the prime learn the end client's 
name, and when?
The demo copy says no; the screens say yes. 
The person works on site, so hiding it after award 
may be pointless
3Does the payee confirm a payment by hand, or 
does it confirm itself after a set number of days?
Decides whether "paid" can ever differ between 
two sides
Etyme multi-tier chain: fix specification · page 11

#DecisionWhy it is needed
4Is placing a person without a held interview 
allowed with a record, or blocked?
It happened in the audit with no prompt
5Does a client's rate band pass to the prime 
automatically?
Addendum D makes rate visibility a per-
requirement vendor setting. Confirm it applies 
from client to prime too
6Is "billed" renamed across the product as section 
4 proposes?
It changes a headline number every vendor will 
look at first
Etyme multi-tier chain: fix specification · page 12