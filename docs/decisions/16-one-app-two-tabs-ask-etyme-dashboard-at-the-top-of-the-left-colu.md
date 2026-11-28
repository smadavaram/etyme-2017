## One app, two tabs: Ask Etyme | Dashboard at the top of the left column — the founder, 2026-11-08

"Build it", on the second drawing (https://claude.ai/artifact/M8bP6g59S351VDsdg5FMum), after he sent Copilot's
screen (a Chat | Cowork switch over a left rail) and asked for it with the
dashboard in Cowork's place and "don't lose our branding". This replaces the
header flip of 2026-11-04 and keeps everything else in "One app, two views".
- **One switch, top of the left column, in both views**: "Ask Etyme" with the
  seat's number, and "Dashboard". The header is the logo, the company and
  role, and the account menu (the hats). No flip in the header.
- **The left column stays.** In Ask Etyme: New conversation, search, Pinned
  (the person's saved questions, three per role to start), then the
  conversations. In Dashboard: the role's menu. On a phone the switch is
  the first row under the header.
- **Dashboard's Today is the queue**: each decision a row with Yes and Not
  now, "Yes to all N" for a batch, all through the one approval route, so a
  card in the chat and a row here are one decision and the number cannot
  disagree. This is the path for the principle "100 transactions a day".
- **The menu follows the founder's sketch**: Network (Candidates, Companies)
  · Jobs · Submissions · HR (Contracts, Timesheets, Expenses) · Money
  (Bills, Invoice receipts, Payroll) · Profitability · Settings, each link
  drawn only where the role's permissions do that work. Profitability is a
  page (margin before admin cost and commission, cut by consultant,
  recruiter, office or client) and a question to Ask Etyme.
- **Three coordinator's calls, each reversible in a sentence** (the founder
  has not answered them): Money keeps the trade's words Bills and Invoice
  receipts, not Receivables and Payables; the group is called HR as he drew
  it, though at a client HR is also a role; the first tab is Dashboard for
  roles that clear queues all day (AP, coordinators) and Ask Etyme for the
  rest, each person's last choice remembered on the device.
- **Money is Accounting, decided by the founder, 2026-11-08** ("Instead of
  money, call it Accounting: Receivables, Payables, Payroll, Reports").
  This replaces the coordinator's call above: the group is **Accounting**
  and its links are **Receivables** (what the firm bills upward: the
  Bills page), **Payables** (what it receives from below: the Invoice
  receipts page), **Payroll** and **Reports**. The words inside those
  pages keep the trade's rule (a bill issued, an invoice receipt
  received); only the menu names the accountant's two ledgers. A client
  reads Accounting with Payables and Reports only. Reports leaves Today
  for here. Profitability stays its own link until he says otherwise.
  **Held back, the coordinator's call the same day:** a client is not
  shown Reports until `/dashboard/reports`, written for a firm that sells,
  has been read as a client; until then a client reads Accounting with
  Payables only.
- **Reports is cash flow and profitability, nothing else. The founder,
  2026-11-08:** *"Reports is nothing but cashflow and profitability
  margin analysis tools."* So Reports, under Accounting, is two tabs:
  **Cash flow** (what the firm has billed and been paid, what it owes
  suppliers and payroll and when, what is overdue, net by week and
  month, every figure the Bills, Invoice receipts and Payroll pages
  already compute and never a second computation) and **Profitability**
  (the cut by consultant, office or client, built 2026-11-08).
  Profitability leaves the menu as a link of its own and lives under
  Reports; its address does not move. The old Reports page's other
  views (the pipeline, the bench) leave Reports: what a page already
  shows elsewhere is reached there. A client's Reports stays held back
  until its cash flow tab reads a client's own book (what it owes its
  suppliers, paid and due) and shows no margin, ever. Built: the cash
  flow reader and the two tabs (money); the menu's one link (architect).
- **Cash flow has a forecast, by week or month, for the next 90 days.
  The founder, 2026-11-08:** *"Also add cash flow forecast by week or
  month for next 90 days."* So the Cash flow tab has two halves: what
  happened (above) and **Forecast**, the next 90 days by week or by
  month: money expected in (bills sent, at their due date on the
  agreement's terms; weeks signed and not yet billed, on the day the
  agreement's rhythm would bill them; running lines at their rate and
  expected hours on the cycle dates already generated) and money
  expected out (invoice receipts due; payroll on each line's pay
  period dates; a sub-vendor's expected invoice on its line's dates),
  and the net per period. Every date is the cycle generator's and every
  rate the line's own, never a second computation; a forecast is
  labelled as expected, per currency, with the assumptions said once on
  the tab (expected hours per week, no overtime, every bill paid on its
  due day); nothing in it is ever added into the actuals above. A
  client's forecast is what it will owe suppliers, no margin. Money
  builds it on the cash flow reader.
- **Left out of Copilot on purpose**: Library, Agents, Notebooks, the model
  picker, the grid and task icons.
- **Not changed**: routes, rules, the approval route, the ledger, every read
  logged, the hats, the words, every page's address.
- **Built in this order**: the switch, the left column and the menu's groups
  (architect, `lib/nav-table`, the shell); Pinned questions and the chat's
  rail and Today's decision rows (conversation, with demand and money for
  the rows); Profitability's page (money). Then a release pass and a walk.
- **Built, piece 1, 2026-11-08 (architect).** The switch at the top of the
  rail and, on a phone, as the first row under the header; the header's
  Ask Etyme link gone. In Ask Etyme the column draws three slots the Ask
  Etyme page fills (`RailSlot` in `components/shell/rail-slots`: `top` for
  New conversation and search, `pinned`, `conversations`), each heading
  shown only while filled; until conversation fills them the column under
  the switch is empty and the page's own list stays where it is. In
  Dashboard the column is `menuFor` in `lib/nav-table`, cut from the same
  sections, so tabs, eyebrows and addresses did not move: Expenses and
  Profitability are links of their own and still tabs of Timesheets and
  Today. The last tab is kept per person on the device; the first time a
  browser opens the app for a person, an AP clerk, AP & Payroll or a
  coordinator who landed in Ask Etyme is taken to Dashboard, once.
