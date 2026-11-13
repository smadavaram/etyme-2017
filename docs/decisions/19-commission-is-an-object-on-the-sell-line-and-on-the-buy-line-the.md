## Commission is an object on the sell line and on the buy line — the founder, 2026-11-08

*"Commission is object on sell and buy contracts. Commissions are made
when account management team sells and when recruiter teams actually
recruit."* So a commission is not a kind of buy contract (today's
`commissionType` on `BuyContract`, the "commission umbrella" of one
agent's line over ten sell lines) but a **row on the line it is earned
on**: a **sales commission** on the sell line, earned by the account
manager who sold the deal, and a **recruiting commission** on the buy
line, earned by the recruiter who recruited the person. One placement
may carry both, and a line may carry none.
- **The row** (`ContractCommission`, one table for both sides: sell or
  buy line, the person who earns it, kind SALES · RECRUITING, basis
  (a share of margin, a share of what is billed, a fixed amount per
  hour or per period), rate, cap, from and to, who set it, when, and
  the reason). The award writes the default rows: the recruiter is who
  put the person forward (the submission's submitter), the account
  manager is who owns the job or the client relationship; the Owner or
  Contract Manager edits them on the line; the firm's default rates
  are a setting with a sane shipped default of none.
- **It is earned when the money is real.** A commission accrues per
  pay period from weeks the firm above accepted (the same hours the
  bill is priced on), never on a submission, an interview or an award;
  a firm may choose to accrue on cash received instead, recorded with
  who chose it. It pays through Payroll → Commissions, the page that
  exists, once per period, under the cap. Nothing is paid that the
  bill's own figures do not support.
- **It closes the Profitability gap.** The recruiter and the account
  manager on a line are the names the cut by recruiter and by account
  manager read, so "which recruiter made the most this quarter" has an
  answer; and the commission term in "margin before admin cost and
  commission" (2026-10-08) becomes a figure, so the page can show
  margin after commission where rows exist.
- **Who reads it:** the person reads their own commissions on their
  own page; Finance, the Owner and anyone the Owner grants read the
  firm's; a recruiter still reads no other recruiter's and no margin.
  A client never sees a supplier's commissions.
- **The old umbrella stays readable**, not written anew: existing
  commission-type buy lines keep paying as they do until the Owner
  moves them, and `lib/commission` keeps its arithmetic.
- **Built in this order:** the schema (architect, after the permission
  grants); the award's default rows and the setting (demand for who
  sold and who recruited, money for the rows and the rates); accrual
  per period, Payroll → Commissions reading the rows, the Profitability
  cuts by recruiter and account manager and margin after commission
  (money); the line's commission panel and the person's own page
  (money, supply); Ask Etyme's answers (conversation).
