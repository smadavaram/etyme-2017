// The seven streams, once, and the vantage points they are drawn from.
//
// No SAP transaction codes anywhere. SAP is an inspiration for the shape —
// a header and its lines, a receipt, a match — and appears only in words a
// person would say. The founder: "be motivated and inspired by SAP and not
// emulate SAP."

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ── Base lanes: the supplier's own desks and its three counterparties ─────
export const L = {
  customer: { key: 'customer', label: 'Customer', sub: 'the client, or layer above', ext: true },
  supply: { key: 'supply', label: 'Supply', sub: 'sub-vendor, the layer below', ext: true },
  candidate: { key: 'candidate', label: 'Candidate', sub: 'the person the work is about', ext: true },
  am: { key: 'am', label: 'Account Manager', sub: 'sells upward' },
  rec: { key: 'rec', label: 'Recruiter', sub: 'procures profiles' },
  cm: { key: 'cm', label: 'Contract Manager', sub: 'papers it' },
  hr: { key: 'hr', label: 'HR', sub: 'candidate & supplier standing' },
  ar: { key: 'ar', label: 'Accounts Receivable', sub: 'bills the customer' },
  ap: { key: 'ap', label: 'AP & Payroll', sub: 'pays people and suppliers' },
  fin: { key: 'fin', label: 'Finance / Owner', sub: 'reads margin and P&L' },
  comp: { key: 'comp', label: 'Compliance Officer', sub: 'reads; writes nothing' },
  sys: { key: 'sys', label: 'Etyme, unprompted', sub: 'what it does on its own', ext: true },
  erp: { key: 'erp', label: 'ERP', sub: 'the books', ext: true },
}

// `desk` on a customer-lane step says which of the CLIENT's or the MSP's
// desks does it; on a supply-lane step, which of the SUB's. Everything
// else lands on the party's fallback lane.
export const streams = [
  {
    id: 'l11', code: 'L1.1', name: 'Source to contract',
    aria: 'The customer raises a requisition; HR reads the role and Procurement audits the suppliers alongside, the cost-center lead signs the money after both, and within plan it publishes itself by rule; Procurement releases it to the suppliers it cleared; the account manager passes it down; the recruiter sources with the candidate’s consent and submits; the account manager shortlists and negotiates upward; the customer interviews and awards.',
    lanes: [L.customer, L.am, L.rec, L.supply, L.candidate],
    steps: [
      { id: 'req', lane: 'customer', col: 0, label: 'Raise requisition', note: 'the role, the months, the rate', desk: { client: 'hiring', msp: 'client' } },
      // Three desks clear it — HR reads the role, Procurement audits the
      // suppliers, alongside at one rank; the lead who owns the cost
      // center signs the money after both. Within plan every desk clears
      // by rule and it publishes itself. Drawn as one box from outside
      // the client; split into the three desks from the client's own view.
      { id: 'apr', lane: 'customer', col: 1, label: 'Three desks clear it', note: 'HR · Procurement · the lead', refuse: 'nobody signs their own', desk: { client: 'hrp', msp: 'client' },
        split: [
          { id: 'aphr', lane: 'customer', col: 1, label: 'HR reads the role', note: 'a contingent role? in the plan?', refuse: 'names nobody’s suppliers', desk: { client: 'hrp' } },
          { id: 'appr', lane: 'customer', col: 1, label: 'Procurement audits', note: 'who may supply, at what band', desk: { client: 'procurement' } },
          { id: 'aplead', lane: 'customer', col: 2, label: 'The lead signs the money', note: 'after both · else program office', refuse: 'nobody signs their own — the raiser least of all', desk: { client: 'lead' } },
          { id: 'byrule', lane: 'customer', col: 2, label: 'Within plan: by rule', note: 'every desk clears; no human', hollow: true, desk: { client: 'programme' } },
        ],
        splitArrows: [
          { from: 'req', to: 'aphr', label: 'the role' },
          { from: 'req', to: 'appr' },
          { from: 'aphr', to: 'aplead' },
          { from: 'appr', to: 'aplead' },
          { from: 'req', to: 'byrule', dashed: true },
          { from: 'aplead', to: 'rel', label: 'approved' },
          { from: 'byrule', to: 'rel', label: 'within plan, publishes itself', dashed: true },
        ] },
      { id: 'rel', lane: 'customer', col: 3, label: 'Release to suppliers', note: 'the ones Procurement cleared', refuse: 'a hiring manager cannot choose who sees it', desk: { client: 'procurement', msp: 'supmgr' } },
      { id: 'acc', lane: 'am', col: 4, label: 'Accept · pass down', note: 'a band of its own' },
      { id: 'sub', lane: 'supply', col: 5, label: 'Sub records the role', note: 'its own record of it', desk: { sub: 'am' } },
      { id: 'src', lane: 'rec', col: 5, label: 'Source & match', note: 'a score says why' },
      { id: 'con', lane: 'candidate', col: 6, label: 'Consent to represent', note: 'the listing — yours to give' },
      { id: 'smt', lane: 'rec', col: 7, label: 'Submit', note: 'a rate, at this rung', refuse: 'no listing, no submission — unless own W2' },
      { id: 'neg', lane: 'am', col: 8, label: 'Shortlist · negotiate', note: 'right-to-work first' },
      { id: 'int', lane: 'customer', col: 9, label: 'Interview', note: 'rounds in turn', desk: { client: 'hiring', msp: 'coord' } },
      { id: 'awd', lane: 'customer', col: 10, label: 'Award', note: 'the order and its first line', refuse: 'a supplier cannot award its own', desk: { client: 'hiring', msp: 'client' } },
    ],
    arrows: [
      { from: 'req', to: 'apr', label: 'a miss goes to the desk that owns it' },
      { from: 'apr', to: 'rel', label: 'approved — or self-published within plan' },
      { from: 'rel', to: 'acc', label: 'invitation + band' },
      { from: 'acc', to: 'sub', label: 'requirement, band of its own' },
      { from: 'acc', to: 'src', label: 'own bench' },
      { from: 'src', to: 'con', label: 'ask' },
      { from: 'con', to: 'smt', label: 'listing granted' },
      { from: 'smt', to: 'neg', label: 'submission @ rate' },
      { from: 'neg', to: 'int', label: 'shortlist, screened' },
      { from: 'int', to: 'awd', label: 'rounds in turn' },
    ],
    caption: 'One requisition becomes one award. It clears three desks first — HR reads the role, Procurement audits the suppliers, the lead who owns the cost center signs the money — and nobody signs their own; within plan every desk clears by rule and it publishes itself. Every arrow that crosses into a shaded lane is a document a counterparty reads — and the rate band travels on the invitation, never on the requisition, so no supplier reads another’s.',
    table: [
      ['Requisition', 'a purchase requisition · a job posting', 'Same object. Etyme clears it through three desks — HR reads the role, Procurement audits the suppliers, the cost-center lead signs the money; SAP puts a release strategy on it.'],
      ['Rate band', 'a rate guideline · a price on the vendor record', 'Both keep the price per supplier where no other supplier can read it. Etyme puts it on the invitation.'],
      ['Supplier release', 'a request for quotation to the source list', '“These vendors may quote.” The program office decides, never the hiring manager.'],
      ['Bench listing — consent to be marketed', '—', 'No SAP word. Fieldglass has a worker profile; nobody in SAP consents to be sold. The invariant with no counterpart.'],
      ['Submission', 'a quotation · a job-seeker submittal', 'A quotation at a rate, one per rung of the chain — two rows, one chain.'],
      ['Interview', 'an interview', 'Only whoever is hiring may set up or decide a round.'],
      ['Award', 'creating the purchase order · creating the work order', 'In SAP the award *is* the order. Etyme’s award now raises the order and writes the contract as its first line.'],
      ['Requirement going down a chain', 'a tiered supplier · subcontracting', 'The prime retypes the role for its sub under a band of its own; the sub never learns the end client unless the agreement requires disclosure.'],
    ],
  },
  {
    id: 'l12', code: 'L1.2', name: 'Contract to onboard',
    aria: 'The customer and account manager execute an agreement; the customer raises an order the supplier reads as its sales order; the contract manager writes the sell and buy lines on it; HR clears the candidate and the supplier; activation blocks without an I-9 or with lapsed cover; the start is announced.',
    lanes: [L.customer, L.am, L.cm, L.hr, L.supply, L.candidate],
    steps: [
      { id: 'msa', lane: 'customer', col: 0, label: 'Agreement, if new', note: 'both sign · optional', desk: { client: 'programme', msp: 'client' } },
      { id: 'msa2', lane: 'am', col: 1, label: 'Countersign', note: 'the later date counts' },
      { id: 'wo', lane: 'customer', col: 2, label: 'Purchase order', note: 'the header · a ceiling', desk: { client: 'procurement', msp: 'supmgr' } },
      { id: 'sell', lane: 'cm', col: 3, label: 'Sell line', note: 'this person, this rate' },
      { id: 'buy', lane: 'cm', col: 4, label: 'Buy line', note: 'pays the sub, or payroll' },
      { id: 'sub', lane: 'supply', col: 4, label: 'Our order to the sub', note: 'a ceiling of its own', desk: { sub: 'cm' } },
      { id: 'w2', lane: 'candidate', col: 4, label: 'Own W2 — no order', note: 'employment is the paper', hollow: true },
      { id: 'cg', lane: 'hr', col: 5, label: 'Candidate green', note: 'I-9 · check · license' },
      { id: 'pap', lane: 'candidate', col: 5, label: 'Papers', note: 'a link · no sign-in' },
      { id: 'sg', lane: 'hr', col: 6, label: 'Company green', note: 'insurance · terms' },
      { id: 'coi', lane: 'supply', col: 6, label: 'Insurance certificate', note: 'the start date is a floor', desk: { sub: 'hr' } },
      { id: 'act', lane: 'cm', col: 7, label: 'Activate', note: 'both lines move', refuse: 'no I-9, no start · lapsed cover blocks' },
      { id: 'st', lane: 'customer', col: 8, label: 'Start date announced', note: 'not yet a moment', hollow: true, desk: { client: 'hiring', msp: 'coord' } },
    ],
    arrows: [
      { from: 'msa', to: 'msa2', label: 'later of two signatures' },
      { from: 'msa2', to: 'wo', label: 'executed' },
      { from: 'wo', to: 'sell', label: 'PO · sales order · work order — one document' },
      { from: 'sell', to: 'buy', label: 'ceiling → rate' },
      { from: 'buy', to: 'sub', label: 'order' },
      { from: 'buy', to: 'w2', dashed: true },
      { from: 'buy', to: 'cg', label: 'HR’s turn' },
      { from: 'cg', to: 'pap', label: 'ask' },
      { from: 'cg', to: 'sg' },
      { from: 'sg', to: 'coi', label: 'ask the sub for theirs' },
      { from: 'sg', to: 'act', label: 'two greens' },
      { from: 'act', to: 'st', label: 'both lines running', dashed: true },
    ],
    caption: 'Two gates, not one: the candidate is green and the company is green. The buy line forks — an order to a sub-vendor carries a ceiling; an employment to your own W2 carries no order at all, because you do not raise a purchase order to your own employee.',
    table: [
      ['Agreement · MSA', 'an outline agreement · a sales contract', 'Optional since 2026-09-18. Both signatures, and the date that matters is the later one. SAP has no countersignature of its own; that lives in a contracts tool. Never “master agreement” on a screen — “master contract” is the profitability roll-up, a different thing.'],
      ['Purchase order · sales order · work order', 'one order, mirrored: a PO on the buyer, a sales order on the seller', 'One row, three names. The header: counterparty, ceiling, dates, terms, the four partner roles.'],
      ['Sell line — bills the customer', 'a sales-order item, one per worker', 'A line on the order: this person, this rate, this site. What the firm bills from.'],
      ['Buy line to a sub-vendor — pays by invoice receipt', 'a service item on our order to the vendor', 'Draws down our order to the sub. Rhythm and terms read from the document; the dates are the line’s own, because a line is a person.'],
      ['Buy line to own W2 — pays by payroll', 'a hiring action, not a vendor record', 'No order to your own employee. SAP files the person under HR, never under purchasing.'],
      ['Supplier onboarding — four desks', 'supplier registration and qualification', 'Etyme walks department lead, Procurement, HR and Finance in order, each verifying only its own items.'],
      ['Work authorization · I-9', 'a residence-status record on the person', 'BLOCK. The form has an edition; an I-9 with nothing behind it is not held.'],
      ['Certificate of insurance', 'a supplier certificate with a validity window', 'Etyme reads the start date as a floor — cover beginning next month does not cover somebody starting this week.'],
      ['Compliance · Agreement · Proof', '—', 'Etyme’s three purposes decide behavior. SAP scatters them across HR, procurement and document management.'],
      ['Activate', 'the hire · the release', 'Both lines move together. Payment terms are not yet a gate.'],
    ],
  },
  {
    id: 'l13', code: 'L1.3', name: 'Work to approve',
    aria: 'The candidate files their own week and expenses; the customer signs the timesheet receipt, or the order lets silence approve; every rung between sees the same hours; the employer accepts what it will pay for.',
    lanes: [L.customer, L.ap, L.supply, L.candidate],
    steps: [
      { id: 'file', lane: 'candidate', col: 0, label: 'File the week', note: 'your own hours', refuse: 'nobody else may file it' },
      { id: 'exp', lane: 'candidate', col: 1, label: 'Expense', note: 'receipt attached' },
      { id: 'rcpt', lane: 'customer', col: 2, label: 'Timesheet receipt', note: 'the goods receipt, here', refuse: 'nobody signs their own hours', desk: { client: 'hiring', msp: 'coord' } },
      { id: 'auto', lane: 'customer', col: 3, label: 'Silence counts?', note: 'if the order says so', hollow: true, desk: { client: 'programme', msp: 'supmgr' } },
      { id: 'pass', lane: 'supply', col: 4, label: 'Pass-through', note: 'every rung, same hours', desk: { sub: 'ap' } },
      { id: 'flag', lane: 'ap', col: 4, label: 'Checked vs contract', note: 'over hours · past end' },
      { id: 'acc', lane: 'ap', col: 5, label: 'Employer acceptance', note: 'what we will pay for', refuse: 'AR cannot accept hours for pay' },
      { id: 'ms', lane: 'customer', col: 6, label: 'Milestone accepted', note: 'a receipt of another shape', desk: { client: 'hiring', msp: 'coord' } },
    ],
    arrows: [
      { from: 'file', to: 'exp', label: 'receipt attached' },
      { from: 'exp', to: 'rcpt', label: 'week + expenses' },
      { from: 'rcpt', to: 'auto', label: 'unsigned after N days', dashed: true },
      { from: 'rcpt', to: 'flag', label: 'the client’s signature' },
      { from: 'rcpt', to: 'pass', label: 'distributed to all layers above' },
      { from: 'flag', to: 'acc', label: 'accepted hours' },
      { from: 'acc', to: 'ms', label: 'a receipt of another shape' },
    ],
    caption: 'The goods receipt of a staffing firm is the signed week. SAP calls it a service entry sheet; the founder named it a timesheet receipt, and the screens use his word. Two signatures from two companies, one row of hours, never one per hop.',
    table: [
      ['Timesheet', 'a time sheet', 'The worker files their own week; the agency may enter on their behalf, nobody may sign for them.'],
      ['Timesheet receipt — client approval', 'the service entry sheet — the goods receipt for services', 'Same object. “Our goods receipt equivalent is timesheet receipt or expense receipt.” The trade’s word wins on the screen.'],
      ['Employer acceptance', 'releasing the time sheet for pay', 'SAP has one approval. Etyme has two signatures, because the client says the work happened and the employer says what it will pay for — different statements.'],
      ['Pass-through', 'tiered approval', 'Each rung between the client and the worker sees the same hours it will bill and be billed for.'],
      ['Expense receipt', 'an expense report', 'An approved, client-billable expense rides the next bill as a line of its own.'],
      ['Milestone receipt', 'a milestone on a billing plan', 'Acceptance is the receipt; it bills as a milestone line.'],
      ['Auto-approval', 'an approval rule', 'Read off the order: “silence counts” with a window. It fired for the first time on 2026-09-17, because no order row had ever existed to carry the flag.'],
      ['A week checked against its contract', '—', 'Over the role’s hours or past the last day says so in a sentence before anybody signs; “Approve anyway” takes a reason.'],
    ],
  },
  {
    id: 'l14', code: 'L1.4', name: 'Approve to invoice',
    aria: 'Accounts receivable raises the bill from approved hours, expenses and milestones with the four partner roles; finance sets tax; the customer pays and AR applies cash; AR ages and duns; the account manager settles a dispute with a credit note; finance watches exposure and limit.',
    lanes: [L.customer, L.ar, L.am, L.fin],
    steps: [
      { id: 'bill', lane: 'ar', col: 0, label: 'Raise the bill', note: 'from the sell line', refuse: 'the payroll desk cannot raise a bill' },
      { id: 'pf', lane: 'ar', col: 1, label: 'Four partners', note: 'sold-to · bill-to · ship-to · payer' },
      { id: 'tax', lane: 'fin', col: 1, label: 'Tax', note: 'regime · place of supply' },
      { id: 'recv', lane: 'customer', col: 2, label: 'Receives', note: 'receipt starts the clock', desk: { client: 'apc', msp: 'apc' } },
      { id: 'pay', lane: 'customer', col: 3, label: 'Pays what matched', note: 'never an unmatched bill', desk: { client: 'apc', msp: 'apc' } },
      { id: 'cash', lane: 'ar', col: 4, label: 'Cash application', note: 'a short payment is a question' },
      { id: 'age', lane: 'ar', col: 5, label: 'Age & dun', note: 'from the due date, not period end' },
      { id: 'disp', lane: 'am', col: 6, label: 'Dispute → credit note', note: 'reverses revenue' },
      { id: 'exp', lane: 'fin', col: 7, label: 'Exposure & limit', note: 'unpaid + unbilled + committed' },
      { id: 'col', lane: 'fin', col: 8, label: 'Collections', note: 'stop-work · write-off' },
    ],
    arrows: [
      { from: 'bill', to: 'pf', label: 'hours · expense · milestone lines' },
      { from: 'pf', to: 'tax', label: 'place of supply' },
      { from: 'pf', to: 'recv', label: 'the bill' },
      { from: 'recv', to: 'pay', label: 'net days from receipt' },
      { from: 'pay', to: 'cash', label: 'payment says who paid whom' },
      { from: 'cash', to: 'age', label: 'short-paid is a question' },
      { from: 'age', to: 'disp', label: 'argument' },
      { from: 'age', to: 'exp', label: 'unpaid + unbilled + committed' },
      { from: 'exp', to: 'col', label: 'breach' },
    ],
    caption: 'The firm bills its customer — SAP’s process is literally called billing, and the founder’s word matches it. The due date belongs to the document, counted from the day the client received it; nothing schedules one on the calendar to disagree with it.',
    table: [
      ['Bill', 'billing — a billing document, a customer invoice', 'Aligned by decision: “companies bill (also called invoice) a customer.”'],
      ['Bill line — hours · expense · milestone', 'a billing item', 'Three receipts, three kinds of line, one match.'],
      ['Sold-to · bill-to · ship-to · payer', 'the four partner roles on a sales document', 'Identical concept. The first thing a large enterprise asks for.'],
      ['Tax', 'a tax code with a place of supply', 'Regime, outcome and place of supply as queryable fields — a return cannot be filed from a blob.'],
      ['Cash application', 'an incoming payment · a lockbox', 'A part payment is chased for the balance; a short payment is a question for a person, not arrears.'],
      ['Aging', 'customer open items', 'Aged from the day each bill fell due, so sixty-day terms are not late on day forty-five.'],
      ['Dunning', 'a dunning run', 'The ladder; who owns each step is a desk.'],
      ['Credit note', 'a credit memo', 'A customer document we issue; it reverses revenue. Posted into the bill’s own period.'],
      ['Exposure · limit', 'credit management', 'Exposure is unpaid plus delivered-not-billed plus committed for the rest of every running assignment — which is why a client owing a little can be the riskiest name on the list.'],
    ],
  },
  {
    id: 'l15', code: 'L1.5', name: 'Approve to pay',
    aria: 'The sub-vendor issues its invoice and AP receives it; the three-way match checks it against the order and the timesheet receipt; a payment run pays the supplier; payroll pays the firm’s own employee on accepted hours only; tax data goes to the bureau.',
    lanes: [L.supply, L.ap, L.fin, L.candidate],
    steps: [
      { id: 'inv', lane: 'supply', col: 0, label: 'Issues its invoice', note: 'their number, not ours', desk: { sub: 'ar' } },
      { id: 'ir', lane: 'ap', col: 1, label: 'Invoice receipt', note: 'received, never raised', refuse: 'receiving it never needs the right to issue one' },
      { id: 'match', lane: 'ap', col: 2, label: 'Three-way match', note: 'order ↔ receipt ↔ invoice' },
      { id: 'exc', lane: 'ap', col: 3, label: 'Exception → desk', note: 'a decision, with a reason' },
      { id: 'run', lane: 'ap', col: 4, label: 'Payment run', note: 'approver is not the raiser' },
      { id: 'remit', lane: 'supply', col: 5, label: 'Remittance', note: 'what was paid, for what', desk: { sub: 'ar' } },
      { id: 'py', lane: 'ap', col: 6, label: 'Payroll', note: 'on accepted hours only', refuse: 'AR cannot run payroll' },
      { id: 'paid', lane: 'candidate', col: 7, label: 'Paid', note: 'own pay · never the bill rate' },
      { id: 'stat', lane: 'fin', col: 8, label: 'Tax data → bureau', note: '1099 · W-2 data' },
    ],
    arrows: [
      { from: 'inv', to: 'ir', label: 'supplier invoice' },
      { from: 'ir', to: 'match', label: 'against order and receipt' },
      { from: 'match', to: 'exc', label: 'did not match', dashed: true },
      { from: 'match', to: 'run', label: 'matched' },
      { from: 'run', to: 'remit', label: 'pays the sub' },
      { from: 'run', to: 'py', label: 'accepted hours only' },
      { from: 'py', to: 'paid', label: 'pay day — before the weekend, by default' },
      { from: 'py', to: 'stat', label: 'withholding' },
    ],
    caption: 'Money out in two directions, two words. A supplier’s invoice is received and matched — the invoice-receipt step. An employee is paid by payroll, which Fieldglass never touches because it stops at the supplier. The candidate sees what they are paid and never what a firm above them charges.',
    table: [
      ['Invoice receipt', 'invoice verification — the supplier’s invoice, received and matched', 'The founder’s term is SAP’s term. The supplier issues the document; we receive it. Receiving it cannot need the permission to issue one of ours.'],
      ['Three-way match', 'order ↔ goods receipt ↔ invoice receipt', 'Identical. Work order ↔ timesheet receipt ↔ supplier invoice. A client pays what came through the match.'],
      ['Match exception → the AP desk', 'a blocked invoice, released by a person', 'A bill that did not match is a decision, with a reason recorded.'],
      ['Payment run', 'the automatic payment run', 'An approver who is not the raiser.'],
      ['Remittance', 'a payment advice', ''],
      ['Payroll', 'payroll', 'Fieldglass does not pay workers; it stops at the supplier. Payroll is the supplier’s own system.'],
      ['Pay model', 'wage types', 'Salary, hourly, C2C, commission — applied per line.'],
      ['Bench reserve', '—', 'No SAP word. A firm holding back against bench time between projects.'],
      ['1099 · W-2 data', 'withholding and year-end reporting', 'Data for the bureau, not the filing.'],
      ['Pay day shifts back; bill day shifts forward', 'a factory calendar · payment terms', 'Per company, per category — before, after or neither — decided 2026-09-17 and wired into the dates the same day.'],
    ],
  },
  {
    id: 'expense', code: 'L1.3 → L1.5', name: 'An expense, from receipt to reimbursement',
    aria: 'The candidate files an expense with its receipt; the account manager checks it is billable under the order; the customer approves it or refuses it with a reason; an approved, client-billable expense rides the next bill as a line of its own; the customer matches the line to the approved expense and pays; AP reimburses the person by payroll, or by the sub-vendor’s invoice where a sub is below.',
    lanes: [L.customer, L.am, L.ar, L.ap, L.supply, L.candidate],
    steps: [
      { id: 'file', lane: 'candidate', col: 0, label: 'Files an expense', note: 'amount · category · receipt', refuse: 'nobody else may file it' },
      { id: 'chk', lane: 'am', col: 1, label: 'Billable to the client?', note: 'the order says; within the ceiling' },
      { id: 'appr', lane: 'customer', col: 2, label: 'Approves · or refuses', note: 'a reason travels with a refusal', refuse: 'nobody approves their own', desk: { client: 'hiring', msp: 'coord' } },
      { id: 'told', lane: 'candidate', col: 3, label: 'Told the outcome', note: 'on their own channel' },
      { id: 'pass', lane: 'supply', col: 3, label: 'Pass-through', note: 'a sub’s person: same expense, every rung', desk: { sub: 'ap' } },
      { id: 'line', lane: 'ar', col: 4, label: 'Rides the next bill', note: 'an expense line of its own', refuse: 'an unapproved expense never bills' },
      { id: 'recv', lane: 'customer', col: 5, label: 'Receives · matches', note: 'the approved expense is the receipt', desk: { client: 'apc', msp: 'apc' } },
      { id: 'pay', lane: 'customer', col: 6, label: 'Pays what matched', note: 'PAID with the bill', desk: { client: 'apc', msp: 'apc' } },
      { id: 'reimb', lane: 'ap', col: 7, label: 'Reimburses the person', note: 'payroll, or the sub’s invoice', refuse: 'AR cannot pay people' },
      { id: 'subinv', lane: 'supply', col: 7, label: 'Its invoice carries it', note: 'received and matched, one rung down', desk: { sub: 'ar' } },
      { id: 'paid', lane: 'candidate', col: 8, label: 'Reimbursed', note: 'their own money back' },
    ],
    arrows: [
      { from: 'file', to: 'chk', label: 'receipt attached' },
      { from: 'chk', to: 'appr', label: 'billable, in ceiling' },
      { from: 'appr', to: 'told', label: 'approved · or refused, with the reason' },
      { from: 'appr', to: 'pass', dashed: true },
      { from: 'appr', to: 'line', label: 'approved, client-billable' },
      { from: 'line', to: 'recv', label: 'the bill, hours and expense lines' },
      { from: 'recv', to: 'pay', label: 'matched' },
      { from: 'pay', to: 'reimb', label: 'remittance' },
      { from: 'reimb', to: 'subinv', label: 'where a sub is below', dashed: true },
      { from: 'reimb', to: 'paid', label: 'payroll' },
      { from: 'subinv', to: 'paid', label: 'the sub pays its person', dashed: true },
    ],
    caption: 'An expense is the second kind of receipt. The person files it with the paper behind it; the customer approves it or refuses it with a reason that travels with the record; an approved, client-billable expense rides the next bill as a line of its own, and the three-way match takes the approved expense as the receipt — an expense nobody approved never reaches a bill. It is paid with the bill, and reimbursed by whoever pays the person: payroll for an employee, the sub-vendor’s own invoice where a sub is below.',
    table: [
      ['Expense', 'an expense report · a trip', 'Filed by the person against the placement, with the receipt attached. Nobody else may file it.'],
      ['Expense receipt — the customer’s approval', 'an approved expense report', 'The founder’s word: “our goods receipt equivalent is timesheet receipt or expense receipt.” The approval is the receipt.'],
      ['Refusal, with a reason', 'a rejected expense item', 'The reason travels with the record and reaches the person on their own channel.'],
      ['Expense line on the bill', 'a billing item for expenses · re-billing', 'Rides the next bill as a line of its own, beside the hours lines, and is PAID with it.'],
      ['Match: line ↔ approved expense', 'the three-way match, receipt-side', 'Order ↔ approved expense ↔ bill line. An expense nobody approved never bills.'],
      ['Reimbursement', 'payroll or the vendor’s invoice', 'Whoever pays the person reimburses them: payroll for an employee; a sub-vendor’s own invoice carries it one rung down.'],
      ['Client-billable or not', 'a cost assignment on the item', 'Read off the order the placement is a line on; a non-billable expense stops at the employer and never reaches the customer.'],
    ],
  },
  {
    id: 'l16', code: 'L1.6', name: 'Record to report',
    aria: 'Every bill, invoice receipt and payroll run posts to the journal; the master contract accumulates revenue and cost; finance reads profitability by pair, person and customer, earned against cash; the account map posts outward to the ERP and reconciliation reads back.',
    lanes: [L.ar, L.ap, L.fin, L.erp],
    steps: [
      { id: 'b', lane: 'ar', col: 0, label: 'Bill posted', note: 'receivable · revenue' },
      { id: 'i', lane: 'ap', col: 0, label: 'Receipt posted', note: 'cost · payable' },
      { id: 'p', lane: 'ap', col: 1, label: 'Payroll posted', note: 'pay · burden' },
      { id: 'j', lane: 'fin', col: 2, label: 'Journal', note: 'one balanced entry each' },
      { id: 'po', lane: 'fin', col: 3, label: 'Master contract', note: 'optional tag · the roll-up' },
      { id: 'pa', lane: 'fin', col: 4, label: 'Profitability', note: 'margin, by the deal', refuse: 'the account manager cannot read P&L' },
      { id: 'ec', lane: 'fin', col: 5, label: 'Earned vs cash', note: 'days to get paid, real months' },
      { id: 'map', lane: 'fin', col: 6, label: 'Account map', note: 'our words → their accounts' },
      { id: 'out', lane: 'erp', col: 7, label: 'Outbound posting', note: 'to the books they keep' },
      { id: 'rec', lane: 'erp', col: 8, label: 'Reconciliation', note: 'read back, differences owned' },
    ],
    arrows: [
      { from: 'b', to: 'j', label: 'balanced entry' },
      { from: 'i', to: 'j' },
      { from: 'p', to: 'j', label: 'revenue · pay · burden' },
      { from: 'j', to: 'po', label: 'to the month the work was done' },
      { from: 'po', to: 'pa', label: 'by pair · person · customer · master' },
      { from: 'pa', to: 'ec' },
      { from: 'ec', to: 'map' },
      { from: 'map', to: 'out', label: 'our bill = their invoice · our receipt = their bill' },
      { from: 'rec', to: 'map', label: 'reads back' },
    ],
    caption: 'Etyme posts into the books; it does not replace them. The mapping is stated once at the boundary: QuickBooks and Xero say Invoice for the customer document and Bill for the received one — their Invoice is our bill, their Bill is our invoice receipt.',
    table: [
      ['Journal', 'the general ledger · a universal journal', 'Every posting turns into a balanced entry; the receivable move on every bill and the cash move on every applied receipt.'],
      ['The pair — a sell line and the buy line that funds it', 'a sales item and a purchase item settled to one cost object', 'A placement’s own margin. Always written by the award, because a buy line pays for some sell line.'],
      ['Master contract — the profitability roll-up', 'an internal order · a work-breakdown element', 'The Etyme-2017 word, kept: the container that once held both sides on one row is now an optional tag. A company tags sell and buy lines to one when it wants to see the deal’s margin. Not a commercial document; nobody signs one — same in SAP, where the sales order and the purchase order both settle to it.'],
      ['Profitability by pair, person, customer, master', 'margin analysis', 'Read from real revenue and cost; gated on the right to read P&L, which the account manager deliberately does not hold.'],
      ['Earned against cash', 'revenue recognition', 'Days to get paid counted back through real months rather than divided by an average, so growth does not move it.'],
      ['Currency', 'currency types and exchange rates', 'Money in minor units, always.'],
      ['ERP account map', 'the chart of accounts · an integration', 'Businesses pay for QuickBooks, SAP and NetSuite directly; Etyme posts to them.'],
      ['Reconciliation', 'clearing · a bank statement', 'Reads the books back; a difference is a row somebody owns.'],
    ],
  },
  {
    id: 'l17', code: 'L1.7', name: 'Govern and protect',
    aria: 'Compliance reads tenure across every supplier for the person at the client and classifies workers; owner and admin set approval chains and segregation of duties; the system logs every read of a person and everything it does unprompted; supplier risk and concentration are watched; the do-not-return list is the company’s own; the candidate is told what is held and sees only their own pay.',
    lanes: [L.customer, L.comp, L.fin, L.sys, L.supply, L.candidate],
    steps: [
      { id: 'ten', lane: 'comp', col: 0, label: 'Tenure ledger', note: 'the person, at the client' },
      { id: 'site', lane: 'customer', col: 0, label: 'Days on site', note: 'counted once per day', hollow: true, desk: { client: 'compl', msp: 'compl' } },
      { id: 'cls', lane: 'comp', col: 1, label: 'Classification', note: 'W2 · 1099 · C2C' },
      { id: 'chain', lane: 'fin', col: 2, label: 'Approval chains', note: 'by rule and by name' },
      { id: 'sod', lane: 'fin', col: 3, label: 'Segregation', note: 'nobody decides two desks', refuse: 'nobody signs their own — BLOCK, in a sentence' },
      { id: 'risk', lane: 'comp', col: 4, label: 'Supplier standing', note: 'probation · approved · preferred' },
      { id: 'sup', lane: 'supply', col: 4, label: 'Insured · authorized', note: 'the client always sees this', hollow: true, desk: { sub: 'comp' } },
      { id: 'conc', lane: 'fin', col: 5, label: 'Concentration', note: 'one client, one person' },
      { id: 'acc', lane: 'sys', col: 5, label: 'Access log', note: 'every read · refusals too' },
      { id: 'auto', lane: 'sys', col: 6, label: 'Automation log', note: 'why · and can it be undone' },
      { id: 'dnr', lane: 'comp', col: 7, label: 'Do-not-return list', note: 'the company’s own', refuse: 'never read across companies' },
      { id: 'told', lane: 'candidate', col: 8, label: 'Told what is held', note: 'own pay only' },
    ],
    arrows: [
      { from: 'site', to: 'ten', label: 'aggregated across vendors' },
      { from: 'ten', to: 'cls' },
      { from: 'cls', to: 'chain', label: 'rules by unit' },
      { from: 'chain', to: 'sod' },
      { from: 'sod', to: 'risk', label: 'who may decide what' },
      { from: 'sup', to: 'risk', label: 'insurance · sanctions' },
      { from: 'risk', to: 'conc', label: 'exposure' },
      { from: 'conc', to: 'acc', label: 'every read leaves a trail' },
      { from: 'acc', to: 'auto' },
      { from: 'auto', to: 'dnr', label: 'unprompted, with a reason' },
      { from: 'dnr', to: 'told', label: 'what we tell people about their data' },
    ],
    caption: 'The moat, not the wedge: tenure accrues to the person at the client across every supplier, counted once per day on site. SAP records what changed; Etyme also records why, and whether it can be undone — and every read of another person’s data leaves a row, including the refusals.',
    table: [
      ['Tenure — the person at the client, across suppliers', 'a tenure policy · contract elements on the person', 'Fieldglass tracks tenure per worker at the buyer within its own walls. Etyme’s claim is across suppliers who are not all on one system — which is every buyer who cannot afford one.'],
      ['Worker classification', 'employee group and subgroup', 'BLOCK where legally grounded.'],
      ['Approval chain', 'a release strategy · a workflow', 'Most requisitions must clear without a human. A desk nobody named falls back; it never refuses.'],
      ['Segregation of duties', 'an access-control ruleset', '“You recommended this firm, so the desks decide it without you.” A sentence, never a disabled button.'],
      ['Supplier standing', 'supplier risk', 'Probation · approved · preferred, read by the tier rule.'],
      ['Concentration', 'margin analysis by customer', 'Revenue share riding on one client, one supplier, one person, with a named risk owner.'],
      ['Access log — every read of a person', 'an audit log · read-access logging', 'The nearest thing logs reads of sensitive fields. Etyme logs the refusals too.'],
      ['Company walls', 'authorization objects · company codes', 'A caller with no company is refused, never handed every company’s list.'],
      ['Automation log — what the system did on its own', 'change documents', 'SAP records what changed. Etyme records the plain-English reason and an honest reversible flag, and every action name is declared on a ladder.'],
      ['Do-not-return list', 'a vendor block · a rehire flag', 'Read by every desk that puts people forward; written by the desk that owns who goes forward. Never read across companies.'],
      ['Whose rate is on the row', 'rate visibility', 'The person named on a sell line is the subject of it, not a party to it.'],
      ['What we tell people about their data', 'information lifecycle · data privacy', 'A page of their own, off until they turn it on.'],
    ],
  },
]

// ── Vantage points ────────────────────────────────────────────────────────
// A party is: which base lanes are its own (drawn solid), how the others
// collapse (drawn faded, still there — the stream does not change, only who
// is looking), and, where the party's own lane is one of the base
// counterparty lanes, how it splits into desks.
const ext = (key, label, sub) => ({ key, label, sub, ext: true })
const own = (key, label, sub) => ({ key, label, sub, ext: false, own: true })

export const parties = [
  {
    key: 'client', n: 1, name: 'Client', file: '1-client',
    tagline: 'The enterprise that buys, and never sells.',
    kind: 'CLIENT', doors: ['world-nike', 'world-corning', 'world-terumo-bct'],
    desks: ['Program Manager', 'Hiring Manager', 'Approver', 'HR Partner', 'Procurement Lead', 'AP Clerk', 'Compliance Officer', 'Viewer'],
    position: 'Buys from everyone below — a prime, an integrator, a program office, a bench vendor, a consultant’s own corporation. Sells to nobody. The customer of the product, and the only party with no Customer lane: it is the customer.',
    about: 'A client pays for the one thing none of its suppliers can give it: every contractor on its sites, across every supplier, with tenure added up, paperwork on file, hours signed and bills matched — from the desk of whoever does that job. In these drawings the client’s own desks are solid and every supplier collapses into one shaded lane: the client sees the rung it pays and nothing below it, unless its agreement demands disclosure.',
    view: {
      customer: 'desks',
      supplier: ext('supplier', 'Your supplier', 'the firm you pay'),
      collapse: ['am', 'rec', 'cm', 'hr', 'ar', 'ap', 'fin', 'comp', 'supply'],
      candidate: ext('candidate', 'Contractor', 'on your site, via a supplier'),
      sys: 'keep', erp: ext('erp', 'Your books', 'where the program’s costs land'),
      fallback: 'programme',
      desks: [own('hiring', 'Hiring Manager', 'raises · interviews · signs'), own('hrp', 'HR Partner', 'reads the role · the plan'), own('procurement', 'Procurement Lead', 'suppliers · band · release'), own('lead', 'Approver — the lead', 'cost center · signs the money'), own('programme', 'Program office', 'the rules · the plan'), own('apc', 'AP Clerk', 'matches and pays bills'), own('compl', 'Compliance Officer', 'tenure · authorization')],
    },
    notYours: { l16: 'Record to report is your supplier’s books. What is yours here is what the program costs — spend this month, ending soon, tenure — read from the client dashboard, and the cost center the roll-up settles to in your own ERP.' },
  },
  {
    key: 'gsi', n: 2, name: 'GSI — systems integrator', file: '2-gsi-systems-integrator',
    tagline: 'Sells to the client. Buys from a sub-vendor by order, or brings its own W2 with none.',
    kind: 'GSI', doors: ['world-teleworld', 'world-sundara', 'karthik-menon'],
    desks: ['Owner', 'Admin', 'Delivery Manager', 'Resource Manager', 'Account Manager', 'Supplier Manager', 'Contractor Desk', 'Team Lead', 'HR', 'Contract Manager', 'Accounts Receivable', 'AP & Payroll', 'Finance', 'Compliance Officer'],
    position: 'Sells to the client. Buys from a sub-vendor by purchase order, or staffs its own W2 employee with no order at all — and the two can sit on the same requirement, one submitted as INTERNAL beside another as NETWORK.',
    about: 'What an integrator needs that a staffing vendor does not, in the founder’s words: its own bench — employees between projects, visible to the delivery managers and HR who allocate them; internal mobility — one delivery manager pulling a person from another’s project as it winds down, with no submission and no marketplace between two desks of the same firm; and submitting its own employee to a client requisition without a bench listing, because the employment contract is the consent. Karthik Menon is this party seen from the inside.',
    view: {
      customer: ext('customer', 'The client', 'the enterprise you deliver to'),
      relabel: { rec: own('rec', 'Delivery Manager', 'allocates the firm’s roster') },
      supply: ext('supply', 'Your sub-vendors', 'behind your name'),
      candidate: ext('candidate', 'Your people', 'own W2s and a sub’s people'),
      sys: 'keep', erp: 'keep',
      extraSteps: { l11: [{ id: 'mob', lane: 'rec', col: 6, label: 'Internal mobility', note: 'no submission between two desks' }] },
      extraArrows: { l11: [{ from: 'src', to: 'mob', label: 'from another project, as it winds down' }] },
    },
  },
  {
    key: 'msp', n: 3, name: 'MSP — program office', file: '3-msp-program-office',
    tagline: 'Runs the client’s program from a seat the client grants. Places nobody.',
    kind: 'MSP', doors: ['world-aptiva'],
    desks: ['Owner', 'Program Manager', 'Supplier Manager', 'Coordinator', 'AP Clerk', 'Compliance Officer'],
    position: 'Sits between the client and every supplier, in a seat the client grants it — the way the client grants one to its own people — and acts there under the client’s rules with every read logged. It cannot raise a requisition of its own, because nothing ties it to a client the way a placement ties a supplier. It buys nothing from a person: there is no payroll leg.',
    about: 'Decided 2026-09-14: a program office that is not the client is a seat, not a firm claiming a counterparty. Letting an MSP’s own record of a client stand in would let any firm claim any client. So in these drawings the client’s own acts — raising, awarding, signing the week — stay in the client’s lane, faded, and the MSP’s desks are solid where the MSP acts: releasing to the panel, coordinating rounds, chasing signatures, matching and paying on the client’s behalf, watching tenure and supplier standing.',
    view: {
      customer: 'desks',
      supplier: ext('supplier', 'The suppliers', 'the panel you qualify'),
      collapse: ['am', 'rec', 'cm', 'hr', 'ar', 'ap', 'fin', 'comp', 'supply'],
      candidate: ext('candidate', 'Contractor', 'on the client’s site'),
      sys: 'keep', erp: ext('erp', 'The client’s books', 'the program’s costs'),
      fallback: 'pm',
      desks: [ext('client', 'The client', 'whose program you run'), own('pm', 'Program Manager', 'runs the program'), own('supmgr', 'Supplier Manager', 'the panel, at what band'), own('coord', 'Coordinator', 'rounds, signatures, starts'), own('apc', 'AP Clerk', 'pays on the client’s behalf'), own('compl', 'Compliance Officer', 'tenure · standing')],
    },
    notYours: { l15: 'Approve to pay is here because the client may hand you its AP desk. There is no payroll leg: an MSP employs nobody it places.', l16: 'Record to report is the client’s books and the suppliers’ books. Yours is the program’s picture — spend, suppliers, tenure — read from the seat.' },
  },
  {
    key: 'prime', n: 4, name: 'Prime vendor', file: '4-prime-vendor',
    tagline: 'Sells to the client. Buys from a sub-vendor by order, or its own W2 with none.',
    kind: 'VENDOR', doors: ['world-computer-systems', 'world-vertex-global'],
    desks: ['Owner', 'Admin', 'Recruiter', 'Resource Manager', 'Account Manager', 'HR', 'Contract Manager', 'Accounts Receivable', 'AP & Payroll', 'Finance', 'Compliance Officer'],
    position: 'Sells to the client on a purchase order the client raises and it reads as its sales order. Buys from a sub-vendor on an order of its own, or brings its own W2 with no order. Both sides of a placement are its to administer, and the sub-vendor’s name is its to keep.',
    about: 'The base drawing. A prime is the party that trades with all three counterparties — a customer above, supply below, and the person the work is about — which is why every other party in this set is described as this drawing with lanes removed or a leg missing. The founder’s operating model was stated from this desk: recruiters procure and submit, account managers sell upward, contract manager and HR make both sides compliant, the client signs the week, the firm bills its customer, pays its people and its suppliers, and ownership reads the margin.',
    view: {
      customer: ext('customer', 'The client', 'the end customer you bill'),
      supply: ext('supply', 'Your sub-vendor', 'its name is yours to keep'),
      candidate: ext('candidate', 'Candidate', 'a sub’s person, or your own W2'),
      sys: 'keep', erp: 'keep',
    },
  },
  {
    key: 'sub', n: 5, name: 'Sub-vendor', file: '5-sub-vendor',
    tagline: 'Sells to the prime. Buys from its own people. Knows the site, never the client’s name.',
    kind: 'VENDOR', doors: ['world-cloudepa'],
    desks: ['Owner', 'Admin', 'Recruiter', 'Account Manager', 'HR', 'Contract Manager', 'Accounts Receivable', 'AP & Payroll', 'Finance', 'Compliance Officer'],
    position: 'A position on a deal, not a kind of firm: the rung below a prime. Sells to the prime at a rate of its own; the prime sells on at another. Knows the site it works at — it must, for tenure and compliance — and the platform carries no thread from it to a client it has no deal with, which is the other half of the NDA between it and the prime.',
    about: 'The same drawing as the prime, shifted one rung down: the sub’s customer is the prime, the end client is behind the prime’s name, and the sub’s own desks do the same jobs. What the sub never sees is the rate above it. What the client always sees, name or no name, is the sub’s standing — insured or not, authorized or not — because that is the client’s own exposure and no NDA changes it.',
    view: {
      customer: ext('customer', 'The prime — your customer', 'the end client behind it'),
      supply: ext('supply', 'A further sub, if any', 'the rung below you'),
      candidate: ext('candidate', 'Your consultants', 'on your bench, or your own W2'),
      sys: 'keep', erp: 'keep',
    },
  },
  {
    key: 'bench', n: 6, name: 'Bench vendor', file: '6-bench-vendor',
    tagline: 'Owns a bench of people who consented to be sold. Sells them up, keeps them warm between.',
    kind: 'VENDOR', doors: ['world-cloudepa'],
    desks: ['Owner', 'Admin', 'Recruiter', 'Resource Manager', 'Account Manager', 'HR', 'Contract Manager', 'Accounts Receivable', 'AP & Payroll', 'Finance', 'Compliance Officer'],
    position: 'A business model more than a position: the firm whose asset is its bench. It attracts people nobody else can find in a niche skill, keeps them warm between assignments, and sells them on evidence rather than a forwarded CV — to a prime, or straight to a client. Every person on it granted a listing, and can take it back.',
    about: 'The supplier drawing without a rung below it: a bench vendor buys from its own people. What is heaviest here is the bottom lane — consent to be represented, the check-ins, releasing-soon and rolloff, the person’s own page — and the rule that bench burn is the vendor’s risk to watch. Etyme itself runs no bench and places nobody; the moment it competed with its own suppliers the network would stop growing.',
    view: {
      customer: ext('customer', 'Who you sell to', 'a prime, or the client'),
      drop: ['supply'],
      candidate: ext('candidate', 'Your bench', 'the listing is theirs'),
      sys: 'keep', erp: 'keep',
    },
  },
  {
    key: 'corp', n: 7, name: 'Self-employed — a consultant’s own corporation', file: '7-self-employed',
    tagline: 'One person, two lanes: the firm that sells and insures, and the worker who files and is paid.',
    kind: 'CONSULTANT_CORP', doors: ['colleen-byrne'],
    desks: ['Owner — and the person the work is about'],
    position: 'A one-person sub-vendor. The corporation sells to a prime or a bench vendor on a sell line, holds its own liability cover and good standing, issues its own invoice, and pays its owner. The owner files the week, is told the start date, and sees only their own pay. The same person appears in the supply lane and the candidate lane, and the two must not be confused: the firm’s insurance can lapse while the person is perfectly authorized.',
    about: 'Colleen Byrne owns Byrne Critical Care LLC. It carries the liability cover her assignment depends on; on 2026-09-17 the seed found she had no seat at her own corporation, so the chase for that cover had no address to go to. That is the shape this party has to get right: a corporation with one seat, a seat with one corporation, and the paperwork of each kept apart.',
    view: {
      customer: ext('customer', 'Who you sell to', 'prime · bench · client'),
      relabelExt: { supply: own('supply', 'You, as the firm', 'sells · insures · invoices'), candidate: own('candidate', 'You, as the worker', 'files · is cleared · is paid') },
      collapse: ['am', 'rec', 'cm', 'hr', 'ar', 'ap', 'fin', 'comp'],
      supplier: ext('supplier', 'The firm above you', 'its desks, doing the buying'),
      sys: 'keep', erp: 'keep',
    },
    notYours: { l14: 'Approve to invoice is the firm above you billing its own customer. Yours is the invoice you issue to them — in Approve to pay, where they receive it.', l16: 'Record to report is the firm above you. Yours is your own books, wherever you keep them.' },
  },
  {
    key: 'candA', n: '8A', name: 'Candidate — on a bench', file: '8a-candidate-on-a-bench',
    tagline: 'Listed by a firm you chose. It pays you; a prime may sell you on; the site signs your week.',
    kind: 'CONSULTANT', doors: ['helena-marsh', 'chidi-okafor'],
    desks: ['You'],
    position: 'You granted a bench listing to one firm — the consent that lets it put you forward — and can take it back. That firm pays you, by payroll or corp-to-corp. A prime above it may sell you on to a client that thinks the prime employs you. You file your own week and nobody else may; you are told your pay and never what anybody above you charges.',
    about: 'Helena Marsh is on a bench vendor’s books and sold on to a sportswear company by the prime above it, two hundred days on site against an eighteen-month cap. Chidi Okafor is two rungs down a chain on an H1B, with a site-access attestation only he can sign. From here the firm that lists you and every rung above it collapse to two lanes, because that is all you can see — and by design: the sub-vendor’s name is the prime’s to keep, and the rate above you is nobody’s to show you.',
    view: {
      customer: ext('customer', 'The prime that sold you on', 'and the client behind it'),
      relabelExt: { candidate: own('candidate', 'You', 'listed; the listing is yours') },
      collapse: ['am', 'rec', 'cm', 'hr', 'ar', 'ap', 'fin', 'comp'],
      supplier: ext('supplier', 'The firm that lists you', 'your bench vendor; it pays you'),
      drop: ['supply'],
      sys: ext('sys', 'Etyme', 'what it tells you'), erp: 'drop',
    },
    notYours: { l14: 'Approve to invoice is the firm billing whoever is above it. Nothing on it is yours, and nothing on it is shown to you.', l16: 'Record to report is the firm’s books. Nothing here is yours.' },
  },
  {
    key: 'candB', n: '8B', name: 'Candidate — independent', file: '8b-candidate-independent',
    tagline: 'No bench, no employer — yet. A page of your own, and a choice to make.',
    kind: 'CONSULTANT', doors: [],
    noDoor: 'No demo door yet. The seeded world has no independent candidate — every seeded person is on a bench, employed, or owns a corporation. The nearest thing to this party is Helena Marsh the day before she granted her listing. A door is a small seed change and worth making.',
    desks: ['You'],
    position: 'You are the person and nothing else — no firm holds a listing for you, no firm employs you. Etyme places nobody, so from here two things can happen and both are yours to decide: a firm invites you to its bench and you grant it a listing (you become 8A), or you incorporate and sell yourself (you become party 7). Until one of those, the streams below are not yet yours.',
    about: 'This is a state, not a flow, and it is drawn to say so. What is yours here is the page — the one case where turning it on is the point, because it is your shop window — and the invitation that arrives because somebody read it. Everything from the contract onward begins the day you choose who represents you. What Etyme guarantees before that day: nobody markets you without your consent, nothing about you is public until you turn it on, and a firm that has never put you forward cannot open your file.',
    view: {
      customer: ext('customer', 'A site, one day', 'nobody has put you forward yet'),
      relabelExt: { candidate: own('candidate', 'You', 'no bench, no employer — yet') },
      collapse: ['am', 'rec', 'cm', 'hr', 'ar', 'ap', 'fin', 'comp'],
      supplier: ext('supplier', 'A firm that could list you', 'you have not chosen one yet'),
      drop: ['supply'],
      sys: ext('sys', 'Etyme', 'what it tells you'), erp: 'drop',
      dropSteps: ['smt'],
      extraSteps: { l11: [
        { id: 'page', lane: 'candidate', col: 2, label: 'Your own page', note: 'your shop window, turned on' },
        { id: 'inv', lane: 'candidate', col: 4, label: 'Invited to a bench', note: 'a firm asks; you decide' },
      ] },
      extraArrows: { l11: [{ from: 'page', to: 'inv', label: 'a firm found you' }, { from: 'inv', to: 'con', label: 'you accept, or not' }] },
    },
    notYours: {
      l12: 'Not yet yours. It begins the day you grant a listing (8A) or incorporate (party 7).',
      l13: 'Not yet yours — there is no week to file until somebody has placed you.',
      l14: 'Not yours, and never shown to you.', l15: 'Not yet yours. Nobody pays you until a firm you chose does.', l16: 'Not yours.',
    },
  },
  {
    key: 'candC', n: '8C', name: 'Candidate — a firm’s own employee', file: '8c-candidate-employee',
    tagline: 'Your employer staffs you directly. Told, not asked. Paid by payroll. Never shown the bill rate.',
    kind: 'CONSULTANT', doors: ['karthik-menon'],
    desks: ['You'],
    position: 'A full-time W2 of the firm that sells you — an integrator, a prime, or a program office bringing its own people. There is no bench listing, because the employment contract is the consent: nobody asks an employee’s permission to staff them on a project. You are told, not asked. Your employer submits you as INTERNAL beside a sub-vendor’s consultant as NETWORK on the same requirement, moves you between its own projects without a submission, pays you by payroll, and never shows you what it charges the client.',
    about: 'Karthik Menon is Teleworld’s own validation engineer. On 2026-09-17 his page said “you do not have a consultant profile yet — one is made when you join a bench,” which told a GSI employee to do the one thing he must not: consent to be marketed by a firm that is not his employer. That was fixed by reading identity from the work rather than the seat. From here the employer and every desk in it collapse to one lane, the site is the client the employer sells you to, and what is solid is what only you do: the week, the papers, the page.',
    view: {
      customer: ext('customer', 'The site you work at', 'the client it sells you to'),
      relabelExt: { candidate: own('candidate', 'You', 'told, not asked; own W2') },
      collapse: ['am', 'rec', 'cm', 'hr', 'ar', 'ap', 'fin', 'comp'],
      supplier: ext('supplier', 'Your employer', 'staffs you directly; pays you'),
      drop: ['supply'],
      sys: ext('sys', 'Etyme', 'what it tells you'), erp: 'drop',
      dropSteps: ['con', 'w2'],
      extraSteps: { l11: [{ id: 'told', lane: 'candidate', col: 6, label: 'Told, not asked', note: 'employment is the consent' }],
                    l12: [{ id: 'own', lane: 'candidate', col: 4, label: 'Own W2 — no order', note: 'employment is the paper' }] },
      extraArrows: { l11: [{ from: 'src', to: 'told', label: 'from the firm’s own roster' }, { from: 'told', to: 'smt', label: 'INTERNAL' }],
                     l12: [{ from: 'buy', to: 'own', label: 'payroll, not an order' }] },
    },
    notYours: { l14: 'Approve to invoice is your employer billing its client. Nothing on it is shown to you.', l16: 'Record to report is your employer’s books. Nothing here is yours.' },
  },
]

// Apply a party's vantage point to a stream: returns {lanes, steps, arrows}
// in the base renderer's shape, with `faded` on steps that are not the
// party's own and `own` on lanes that are.
export function viewFor(party, stream) {
  const v = party.view
  const laneOrder = []
  const laneByKey = new Map()
  const push = (lane) => { if (!laneByKey.has(lane.key)) { laneByKey.set(lane.key, lane); laneOrder.push(lane) } }
  // where does a base lane go?
  const target = (baseKey) => {
    if (v.drop?.includes(baseKey)) return null
    if (baseKey === 'customer' && v.customer === 'desks') return 'desks'
    if (v.collapse?.includes(baseKey)) return v.supplier?.key ?? 'supplier'
    if (v.relabelExt?.[baseKey]) return v.relabelExt[baseKey].key
    if (v.relabel?.[baseKey]) return v.relabel[baseKey].key
    if (baseKey === 'customer' && v.customer && v.customer !== 'desks') return v.customer.key
    if (baseKey === 'supply' && v.supply) return v.supply.key
    if (baseKey === 'candidate' && v.candidate) return v.candidate.key
    if (baseKey === 'sys') return v.sys === 'drop' ? null : v.sys === 'keep' ? 'sys' : v.sys.key
    if (baseKey === 'erp') return v.erp === 'drop' ? null : v.erp === 'keep' ? 'erp' : v.erp.key
    return baseKey // an own desk of the supplier-shaped party
  }
  const laneDef = (baseKey, targetKey) => {
    if (targetKey === 'supplier') return v.supplier
    if (v.relabelExt?.[baseKey]) return v.relabelExt[baseKey]
    if (v.relabel?.[baseKey]) return v.relabel[baseKey]
    if (baseKey === 'customer' && v.customer && v.customer !== 'desks') return v.customer
    if (baseKey === 'supply' && v.supply) return v.supply
    if (baseKey === 'candidate' && v.candidate) return v.candidate
    if (baseKey === 'sys') return v.sys === 'keep' ? L.sys : v.sys
    if (baseKey === 'erp') return v.erp === 'keep' ? L.erp : v.erp
    // a supplier-shaped party's own desk: the base lane, marked own
    return { ...L[baseKey], own: true, ext: false }
  }
  // lane order follows the base stream's order, with desk lanes inserted where the customer lane was
  for (const base of stream.lanes) {
    const t = target(base.key)
    if (t === null) continue
    if (t === 'desks') { for (const d of v.desks) push(d); continue }
    push(laneDef(base.key, t))
  }
  const extra = v.extraSteps?.[stream.id] ?? []
  const steps = []
  const splitIds = new Set(), splitArrows = []
  const expanded = []
  for (const s of [...stream.steps, ...extra]) {
    if (v.dropSteps?.includes(s.id)) continue
    const t = target(s.lane)
    if (t === 'desks' && s.split && s.split.every((p) => p.desk?.[party.key])) { splitIds.add(s.id); splitArrows.push(...(s.splitArrows ?? [])); expanded.push(...s.split); continue }
    expanded.push(s)
  }
  for (const s of expanded) {
    const t = target(s.lane)
    if (t === null) continue
    let laneKey = t
    if (t === 'desks') laneKey = s.desk?.[party.key] ?? v.fallback
    if (s.lane === 'supply' && party.key === 'sub' && s.desk?.sub) laneKey = s.desk.sub // the sub's own desks are the base supplier desks
    if (!laneByKey.has(laneKey)) { if (L[laneKey]) push({ ...L[laneKey], own: true, ext: false }); else continue }
    const lane = laneByKey.get(laneKey)
    steps.push({ ...s, lane: laneKey, faded: !lane.own })
  }
  // Two of a firm's desks collapsed into one faded lane can land in the
  // same column. Keep the one nearer the work — a recruiter's step over a
  // sub-vendor's — and drop the other; it is context, not the party's own.
  const PRIORITY = { rec: 1, am: 2, cm: 3, hr: 4, ap: 5, ar: 6, fin: 7, comp: 8, customer: 8, candidate: 8, supply: 9, sys: 9, erp: 9 }
  const seen = new Map()
  for (const st of steps) {
    const k = `${st.lane}:${st.col}`
    const prev = seen.get(k)
    if (!prev) { seen.set(k, st); continue }
    const base = expanded.find((x) => x.id === st.id) ?? st, prevBase = expanded.find((x) => x.id === prev.id) ?? prev
    if ((PRIORITY[base.lane] ?? 9) < (PRIORITY[prevBase.lane] ?? 9)) seen.set(k, st)
  }
  const kept = new Set([...seen.values()].map((x) => x.id))
  const placed = steps.filter((x) => kept.has(x.id))
  // A lane with nothing in it this stream is not drawn: the desk exists, it just does not act here.
  const used = new Set(placed.map((x) => x.lane))
  const lanes = laneOrder.filter((l) => used.has(l.key))
  const ids = new Set(placed.map((x) => x.id))
  const arrows = [...stream.arrows.filter((a) => !splitIds.has(a.from) && !splitIds.has(a.to)), ...splitArrows, ...(v.extraArrows?.[stream.id] ?? [])].filter((a) => ids.has(a.from) && ids.has(a.to))
  return { lanes, steps: placed, arrows }
}

// ── The renderer ──────────────────────────────────────────────────────────
// Orthogonal routing, the way a process engineer draws a swim lane: an
// arrow leaves a box on its right edge, turns once in the gap between
// columns, runs vertically to the target's lane, turns again and enters
// the target on its left edge. Nothing crosses a box; a route that would
// takes the other elbow. A label sits on the longest straight segment.
// Every box carries its number in reading order so a desk can be followed
// across lanes and across pages.
const LABEL_W = 176, COL0 = 196, PITCH = 200, BOX_W = 156, BOX_H = 50, LANE_H_DEFAULT = 108, TOP = 14
const GAP = PITCH - BOX_W // 44px between columns, room for four vertical runs

export function svg(d, { id, aria, laneH }) {
  const LANE_H = laneH ?? LANE_H_DEFAULT
  for (const l of d.lanes) if ((l.sub ?? '').length > 30) throw new Error(`lane sub-label too long for the label column (${l.sub.length} > 30): "${l.sub}"`)
  const cols = Math.max(...d.steps.map((s) => s.col)) + 1
  const refuseExtent = Math.max(0, ...d.steps.filter((s) => s.refuse && !s.faded).map((s) => COL0 + s.col * PITCH + 12 + s.refuse.length * 5.1))
  const W = Math.max(COL0 + cols * PITCH - GAP + 12, refuseExtent + 8)
  const H = TOP + d.lanes.length * LANE_H + 8
  const laneY = (k) => TOP + d.lanes.findIndex((l) => l.key === k) * LANE_H
  const box = (s) => { const y = laneY(s.lane) + (LANE_H - BOX_H) / 2, x = COL0 + s.col * PITCH; return { x, y, cx: x + BOX_W / 2, cy: y + BOX_H / 2, r: x + BOX_W, b: y + BOX_H } }
  const byId = Object.fromEntries(d.steps.map((s) => [s.id, s]))
  const occupied = new Set(d.steps.map((s) => `${s.lane}:${s.col}`))
  const laneIdx = (k) => d.lanes.findIndex((l) => l.key === k)
  // does a horizontal run in lane `lane` from column a to column b (exclusive) cross a box?
  const rowClear = (lane, a, b) => { const [lo, hi] = a < b ? [a, b] : [b, a]; for (let c = lo + 1; c < hi; c++) if (occupied.has(`${lane}:${c}`)) return false; return true }
  // does a vertical run in the gap after column `col` between two lanes cross a box? (boxes never sit in a gap, so it cannot)
  let out = `<svg class="lane-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}" xmlns="http://www.w3.org/2000/svg">`
  out += `<defs><marker id="arr-${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><polygon points="0,0 8,4 0,8" fill="currentColor"/></marker></defs>`
  d.lanes.forEach((l, i) => {
    const y = TOP + i * LANE_H
    if (l.ext) out += `<rect x="0" y="${y}" width="${W}" height="${LANE_H}" fill="currentColor" fill-opacity="0.045"/>`
    if (l.own) out += `<rect x="0" y="${y}" width="${LABEL_W}" height="${LANE_H}" fill="#2B47E5" fill-opacity="0.07"/>`
    out += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="currentColor" stroke-opacity="0.18"/>`
    out += `<text x="14" y="${y + LANE_H / 2 - 2}" font-size="12" font-weight="600" fill="currentColor">${esc(l.label)}</text>`
    if (l.sub) out += `<text x="14" y="${y + LANE_H / 2 + 13}" font-size="10.5" fill="currentColor" fill-opacity="0.62">${esc(l.sub)}</text>`
  })
  out += `<line x1="0" y1="${H - 8}" x2="${W}" y2="${H - 8}" stroke="currentColor" stroke-opacity="0.18"/>`
  out += `<line x1="${LABEL_W}" y1="${TOP}" x2="${LABEL_W}" y2="${H - 8}" stroke="currentColor" stroke-opacity="0.18"/>`
  // column gaps are shared: each vertical run in a gap takes its own slot so two runs never overlap
  const slots = new Map()
  const slotX = (gapCol, dir) => { const k = `${gapCol}`; const n = slots.get(k) ?? 0; slots.set(k, n + 1); const x0 = COL0 + gapCol * PITCH + BOX_W; return x0 + 10 + (n % 4) * 8 }
  // several arrows into one box's left edge: fan the entry points so heads do not pile up
  const entries = new Map()
  const entryY = (t, B) => { const n = entries.get(t) ?? 0; entries.set(t, n + 1); return B.cy + (n === 0 ? 0 : n % 2 ? -12 * Math.ceil(n / 2) : 12 * Math.ceil(n / 2)) }
  const exits = new Map()
  const exitY = (f, A) => { const n = exits.get(f) ?? 0; exits.set(f, n + 1); return A.cy + (n === 0 ? 0 : n % 2 ? -12 * Math.ceil(n / 2) : 12 * Math.ceil(n / 2)) }
  const arrows = []
  for (const a of d.arrows) {
    const F = byId[a.from], T = byId[a.to], A = box(F), B = box(T)
    const faded = F.faded && T.faded
    let pts, labelAt
    if (F.col === T.col) {
      // same column: straight vertical between the boxes
      const down = B.y > A.y
      pts = [[A.cx, down ? A.b : A.y], [B.cx, down ? B.y : B.b]]
      labelAt = { x: A.cx + 7, y: (pts[0][1] + pts[1][1]) / 2 + 4, anchor: 'start' }
    } else if (T.col > F.col) {
      const ey = exitY(a.from, A), ty = entryY(a.to, B)
      if (F.lane === T.lane && rowClear(F.lane, F.col, T.col)) {
        pts = [[A.r, ey], [B.x, ty]]
        labelAt = { x: (A.r + B.x) / 2, y: A.y - 5, anchor: 'middle' }
      } else {
        // elbow in the gap right after the source (vertical first), unless the run into the
        // target along its lane would cross a box — then elbow in the gap right before the target
        const afterSource = rowClear(T.lane, F.col, T.col)
        const beforeTarget = rowClear(F.lane, F.col, T.col)
        if (!afterSource && !beforeTarget) {
          // both straight elbows cross a box: go up into the source lane's top margin, along it, and down into the target
          const g1 = slotX(F.col), g2 = slotX(T.col - 1), yTop = laneY(F.lane) + 7
          pts = [[A.r, ey], [g1, ey], [g1, yTop], [g2, yTop], [g2, ty], [B.x, ty]]
          labelAt = { x: (g1 + g2) / 2, y: yTop - 4, anchor: 'middle' }
        } else {
          const gapCol = afterSource ? F.col : T.col - 1
          const gx = slotX(gapCol)
          pts = [[A.r, ey], [gx, ey], [gx, ty], [B.x, ty]]
          const hLen = afterSource ? B.x - gx : gx - A.r
          if (hLen >= 120) {
            labelAt = afterSource ? { x: (gx + B.x) / 2, y: ty - 7, anchor: 'middle' } : { x: (A.r + gx) / 2, y: ey - 7, anchor: 'middle' }
          } else {
            // beside the vertical run; text goes toward whichever side has no box at that height
            const my = (ey + ty) / 2
            const li = Math.min(d.lanes.length - 1, Math.max(0, Math.floor((my - TOP) / LANE_H)))
            const laneAt = d.lanes[li].key
            const rightBusy = occupied.has(`${laneAt}:${gapCol + 1}`), leftBusy = occupied.has(`${laneAt}:${gapCol}`)
            const toRight = !rightBusy || leftBusy
            labelAt = { x: toRight ? gx + 6 : gx - 6, y: my + 4, anchor: toRight ? 'start' : 'end' }
          }
        }
      }
    } else {
      // backward: leave on the left, elbow in the gap before the source, enter the target on its right
      const gx = slotX(T.col) + 20
      pts = [[A.x, A.cy], [gx, A.cy], [gx, B.cy], [B.r, B.cy]]
      labelAt = { x: gx + 6, y: (A.cy + B.cy) / 2 + 4, anchor: 'start' }
      if (Math.abs(A.cy - B.cy) < 2) { pts = [[A.x, A.cy], [B.r, B.cy]]; labelAt = { x: (A.x + B.r) / 2, y: A.cy - 7, anchor: 'middle' } }
    }
    arrows.push({ a, pts, labelAt, faded })
  }
  for (const { a, pts, labelAt, faded } of arrows) {
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
    out += `<path d="${path}" fill="none" stroke="currentColor" stroke-opacity="${faded ? 0.35 : 1}" stroke-width="1.4"${a.dashed ? ' stroke-dasharray="5 4"' : ''} stroke-linejoin="round" marker-end="url(#arr-${id})"/>`
    if (a.label) out += `<text class="lbl" x="${labelAt.x}" y="${labelAt.y}" font-size="10.5" text-anchor="${labelAt.anchor}" fill="currentColor" fill-opacity="${faded ? 0.5 : 1}">${esc(a.label)}</text>`
  }
  d.steps.forEach((s, i) => {
    const b = box(s), op = s.faded ? 0.42 : 1
    const dash = s.hollow ? ' stroke-dasharray="4 3"' : ''
    out += `<g opacity="${op}"><rect x="${b.x}" y="${b.y}" width="${BOX_W}" height="${BOX_H}" rx="4" fill="currentColor" fill-opacity="${s.hollow ? 0 : 0.06}" stroke="currentColor" stroke-width="1.1"${dash}${s.hollow ? ' stroke-opacity="0.6"' : ''}/>`
    // reading-order number, top-left, on the surface so it does not fight the label
    out += `<circle cx="${b.x}" cy="${b.y}" r="8.5" style="fill:var(--surface, #FBFAF7)" stroke="currentColor" stroke-width="1"/><text x="${b.x}" y="${b.y + 3.4}" font-size="9.5" font-weight="600" text-anchor="middle" fill="currentColor">${i + 1}</text>`
    out += `<text x="${b.cx}" y="${b.y + 19}" font-size="11.5" font-weight="600" text-anchor="middle" fill="currentColor">${esc(s.label)}</text>`
    if (s.note) out += `<text x="${b.cx}" y="${b.y + 36}" font-size="9.6" text-anchor="middle" fill="currentColor" fill-opacity="0.72">${esc(s.note)}</text>`
    if (s.refuse && !s.faded) { out += `<circle cx="${b.x + 5}" cy="${b.b + 14}" r="3.2" fill="#C0622E"/><text class="lbl" x="${b.x + 12}" y="${b.b + 17.5}" font-size="9.8" fill="#C0622E">${esc(s.refuse)}</text>` }
    out += `</g>`
  })
  return out + `</svg>`
}

// ── The client, end to end: one hire, from every desk ─────────────────────
// Asked for on 2026-09-19: one large flow for the client company that
// includes budget & planning, the contract/HR manager and accounts payable
// along with the candidate and the supplier. Ten lanes, the same on every
// panel, so a desk can be followed across pages; three panels, because a
// twenty-column drawing scaled to a page is not readable. Nothing here is
// faded: the supplier and the contractor are shaded because they are
// outside the client, and drawn solid because the founder asked to see
// what they do.
const cl = (key, label, sub, ext = false) => ({ key, label, sub, ext, own: !ext })
export const clientFlow = {
  id: 'client-flow', name: 'One hire, from every desk',
  lanes: [
    cl('plan', 'Budget & planning', 'program office · the plan'),
    cl('hiring', 'Hiring Manager', 'raises · interviews · signs'),
    cl('hrp', 'HR Partner', 'reads the role · the plan'),
    cl('proc', 'Procurement Lead', 'suppliers · band · release'),
    cl('lead', 'Approver — the lead', 'cost center · signs the money'),
    cl('chm', 'Contract / HR manager', 'the order · the paperwork'),
    cl('comp', 'Compliance Officer', 'tenure · authorization · cover'),
    cl('apc', 'AP Clerk', 'receives · matches · pays'),
    cl('supplier', 'Supplier', 'the firm you pay', true),
    cl('candidate', 'Contractor', 'on your site, via a supplier', true),
  ],
  panels: [
    {
      id: 'plan', n: 1, name: 'Plan to publish',
      aria: 'The program office sets the headcount plan and a rate band per skill; the hiring manager raises a requisition against them; HR reads the role and Procurement audits the suppliers alongside; the lead who owns the cost center signs the money; within plan every desk clears by rule and it publishes itself; Procurement releases it to the suppliers it cleared, each with its own band.',
      steps: [
        { id: 'hc', lane: 'plan', col: 0, label: 'Headcount plan', note: 'heads · budget · per cost center' },
        { id: 'band', lane: 'plan', col: 1, label: 'Rate band per skill', note: 'a band per supplier, never shared' },
        { id: 'req', lane: 'hiring', col: 2, label: 'Raise requisition', note: 'owner · panel · months · rate' },
        { id: 'hr', lane: 'hrp', col: 3, label: 'Reads the role', note: 'a contingent role? in the plan?', refuse: 'names nobody’s suppliers' },
        { id: 'pr', lane: 'proc', col: 3, label: 'Audits the suppliers', note: 'who may supply, at what band' },
        { id: 'ld', lane: 'lead', col: 4, label: 'Signs the money', note: 'after both · else program office', refuse: 'nobody signs their own — the raiser least of all' },
        { id: 'rule', lane: 'plan', col: 4, label: 'Within plan: by rule', note: 'every desk clears · no human', hollow: true },
        { id: 'rel', lane: 'proc', col: 5, label: 'Release to suppliers', note: 'the ones it cleared', refuse: 'a hiring manager cannot choose who sees it' },
        { id: 'inv', lane: 'supplier', col: 6, label: 'Receives the invitation', note: 'its band; nobody else’s' },
      ],
      arrows: [
        { from: 'hc', to: 'band', label: 'read against' },
        { from: 'band', to: 'req', label: 'plan · band' },
        { from: 'req', to: 'hr', label: 'the role' },
        { from: 'req', to: 'pr' },
        { from: 'hr', to: 'ld' },
        { from: 'pr', to: 'ld' },
        { from: 'req', to: 'rule', dashed: true },
        { from: 'ld', to: 'rel', label: 'approved' },
        { from: 'rule', to: 'rel', label: 'a hit clears by rule · publishes itself', dashed: true },
        { from: 'rel', to: 'inv', label: 'invitation + band' },
      ],
      caption: 'Budget and planning is a desk, not a form: the headcount plan and the rate band exist before any role does, and every requisition is read against them. A miss goes to the desk that owns the miss — over the plan to HR, above the band to Procurement, over budget to the lead — and a hit clears by rule, because governance slower than the workaround produces the workaround.',
    },
    {
      id: 'start', n: 2, name: 'Submit to start',
      aria: 'The supplier submits a candidate with their consent, or its own W2 who is told; the hiring manager shortlists, interviews and awards, and cannot award a supplier’s own; the contract manager sees the purchase order raised with its first line, which the supplier reads as its sales order; compliance checks tenure across every supplier before the start is offered; the paperwork required on the line is asked of the candidate and the supplier; the supplier activates when both are green.',
      steps: [
        { id: 'con', lane: 'candidate', col: 0, label: 'Consents · or is told', note: 'a listing, or the employment' },
        { id: 'smt', lane: 'supplier', col: 0, label: 'Submits a candidate', note: 'one per requirement, first wins' },
        { id: 'int', lane: 'hiring', col: 1, label: 'Shortlist · interview', note: 'rounds in turn; notes stay here' },
        { id: 'ans', lane: 'candidate', col: 1, label: 'Answers from own page', note: 'told on their own channel' },
        { id: 'awd', lane: 'hiring', col: 2, label: 'Award', note: 'writes the order and its line', refuse: 'a supplier cannot award its own' },
        { id: 'po', lane: 'chm', col: 3, label: 'Purchase order · line', note: 'ceiling on the header, rate on the line' },
        { id: 'so', lane: 'supplier', col: 3, label: 'Reads it as its sales order', note: 'one document, two names' },
        { id: 'ten', lane: 'comp', col: 4, label: 'Tenure checked first', note: 'across every supplier · the cap', refuse: 'inside a break: a date, not a button' },
        { id: 'reqd', lane: 'chm', col: 4, label: 'Paperwork required', note: 'I-9 · check · the supplier’s cover' },
        { id: 'pap', lane: 'candidate', col: 5, label: 'Papers, via a link', note: 'no sign-in · edition recorded' },
        { id: 'coi', lane: 'supplier', col: 5, label: 'Insurance certificate', note: 'the start date is a floor' },
        { id: 'verd', lane: 'comp', col: 6, label: 'Two greens', note: 'the person and the firm', refuse: 'no I-9, no start · lapsed cover blocks' },
        { id: 'act', lane: 'supplier', col: 6, label: 'Activates', note: 'both lines move; the start announced' },
      ],
      arrows: [
        { from: 'con', to: 'smt', label: 'consent · or told' },
        { from: 'smt', to: 'int', label: 'submission @ rate' },
        { from: 'int', to: 'ans', label: 'a round proposed' },
        { from: 'int', to: 'awd', label: 'rounds in turn' },
        { from: 'awd', to: 'po', label: 'the header and its first line' },
        { from: 'po', to: 'so', label: 'the same document' },
        { from: 'po', to: 'ten', label: 'before the start is offered' },
        { from: 'po', to: 'reqd', label: 'the required set, off the header' },
        { from: 'reqd', to: 'pap', label: 'ask the person' },
        { from: 'reqd', to: 'coi', label: 'ask the firm' },
        { from: 'pap', to: 'verd' },
        { from: 'coi', to: 'verd', label: 'in force on day one?' },
        { from: 'verd', to: 'act', label: 'green · green' },
      ],
      caption: 'The award raises one document — a purchase order here, the supplier’s sales order there — and its first line is the person. Compliance reads tenure before anything is offered, and the paperwork the line requires is asked of whoever owes it: the person for their I-9, the firm for its cover. A missing background check warns and records the reason; a missing I-9 or lapsed cover blocks, in a sentence.',
    },
    {
      id: 'pay', n: 3, name: 'Work to paid, and the ledger',
      aria: 'The contractor files their own week; the hiring manager signs the timesheet receipt, or the order lets silence approve; the supplier accepts what it will pay and bills from its sell line; accounts payable receives the bill, matches it against the order and the receipt, decides an exception with a reason and pays what matched; the supplier is remitted and pays its person; compliance counts the day on site once; the program office reads spend against the plan.',
      steps: [
        { id: 'file', lane: 'candidate', col: 0, label: 'Files the week', note: 'own hours · a receipt per expense', refuse: 'nobody else may file it' },
        { id: 'rcpt', lane: 'hiring', col: 1, label: 'Timesheet receipt', note: 'signs the work · checked first', refuse: 'nobody signs their own hours' },
        { id: 'auto', lane: 'chm', col: 2, label: 'Silence counts?', note: 'if the order says so', hollow: true },
        { id: 'bill', lane: 'supplier', col: 2, label: 'Accepts · bills', note: 'from its sell line, the signed week' },
        { id: 'recv', lane: 'apc', col: 3, label: 'Receives the bill', note: 'receipt starts the clock' },
        { id: 'match', lane: 'apc', col: 4, label: 'Three-way match', note: 'order ↔ receipt ↔ bill' },
        { id: 'exc', lane: 'apc', col: 5, label: 'Did not match → decide', note: 'a reason, on the record', hollow: false },
        { id: 'pay', lane: 'apc', col: 6, label: 'Pays what matched', note: 'the payment says who paid whom', refuse: 'never a bill with no receipt behind it' },
        { id: 'rem', lane: 'supplier', col: 6, label: 'Remitted', note: 'pays its person by payroll or invoice' },
        { id: 'paid', lane: 'candidate', col: 7, label: 'Paid by their employer', note: 'own pay · never your rate' },
        { id: 'ledger', lane: 'comp', col: 7, label: 'Tenure ledger', note: 'a day on site, counted once' },
        { id: 'spend', lane: 'plan', col: 7, label: 'Spend against the plan', note: 'this month · ending soon' },
      ],
      arrows: [
        { from: 'file', to: 'rcpt', label: 'week + expenses' },
        { from: 'rcpt', to: 'auto', label: 'unsigned after N days', dashed: true },
        { from: 'rcpt', to: 'bill' },
        { from: 'auto', to: 'bill', dashed: true },
        { from: 'bill', to: 'recv', label: 'the bill' },
        { from: 'recv', to: 'match', label: 'net days from receipt' },
        { from: 'match', to: 'exc', label: 'did not match', dashed: true },
        { from: 'match', to: 'pay', label: 'matched' },
        { from: 'exc', to: 'pay', label: 'decided, with a reason' },
        { from: 'pay', to: 'rem' },
        { from: 'rem', to: 'paid', label: 'payroll · or its own supplier' },
        { from: 'rcpt', to: 'ledger', label: 'days served, once' },
        { from: 'pay', to: 'spend', label: 'what the program cost' },
      ],
      caption: 'A client pays what came through the match — never a bill the supplier has not submitted, never one with no signed week behind it — and the payment says who paid whom. The same signed week feeds the tenure ledger, where a day on site is counted once however many firms billed it, and the program office reads what the month cost against the plan it wrote in panel one. Every read of a person along the way leaves a row in the access log, refusals included.',
    },
    {
      id: 'expense', n: 4, name: 'An expense, from receipt to reimbursement',
      aria: 'The contractor files an expense with its receipt against the placement; the hiring manager approves it or refuses it with a reason; an approved, client-billable expense rides the supplier’s next bill as a line of its own; accounts payable matches the line to the approved expense as its receipt and pays; the supplier reimburses its person; the program office reads it against the plan.',
      steps: [
        { id: 'file', lane: 'candidate', col: 0, label: 'Files an expense', note: 'amount · category · receipt attached', refuse: 'nobody else may file it' },
        { id: 'pol', lane: 'chm', col: 1, label: 'Checked vs the order', note: 'billable? within the ceiling?', hollow: false },
        { id: 'appr', lane: 'hiring', col: 2, label: 'Approves · or refuses', note: 'a reason travels with a refusal', refuse: 'nobody approves their own' },
        { id: 'told', lane: 'candidate', col: 3, label: 'Told the outcome', note: 'on their own channel' },
        { id: 'bill', lane: 'supplier', col: 3, label: 'Rides the next bill', note: 'an expense line of its own' },
        { id: 'recv', lane: 'apc', col: 4, label: 'Receives the bill', note: 'hours lines and expense lines' },
        { id: 'match', lane: 'apc', col: 5, label: 'Match: line ↔ expense', note: 'the approved expense is the receipt', refuse: 'an unapproved expense never bills' },
        { id: 'pay', lane: 'apc', col: 6, label: 'Pays what matched', note: 'the expense is PAID with the bill' },
        { id: 'reimb', lane: 'supplier', col: 7, label: 'Reimburses its person', note: 'payroll or supplier payment' },
        { id: 'paid', lane: 'candidate', col: 8, label: 'Reimbursed', note: 'their own money back' },
        { id: 'spend', lane: 'plan', col: 8, label: 'Expenses vs the plan', note: 'this month · by cost center' },
        { id: 'trail', lane: 'comp', col: 8, label: 'The trail', note: 'who approved, who paid, why' },
      ],
      arrows: [
        { from: 'file', to: 'pol', label: 'receipt attached' },
        { from: 'pol', to: 'appr', label: 'billable, in ceiling' },
        { from: 'appr', to: 'told', label: 'approved · or refused, with the reason' },
        { from: 'appr', to: 'bill', label: 'approved, client-billable' },
        { from: 'bill', to: 'recv', label: 'the bill' },
        { from: 'recv', to: 'match' },
        { from: 'match', to: 'pay', label: 'matched' },
        { from: 'pay', to: 'reimb', label: 'remittance' },
        { from: 'reimb', to: 'paid', label: 'payroll · or its own supplier' },
        { from: 'pay', to: 'spend', label: 'what it cost' },
        { from: 'pay', to: 'trail', label: 'approved by · paid by' },
      ],
      caption: 'An expense is the second kind of receipt. The contractor files it with the paper behind it; the hiring manager approves it or refuses it with a reason that travels with the record; an approved, client-billable expense rides the supplier’s next bill as a line of its own, and the three-way match takes the approved expense as the receipt — an expense nobody approved never reaches a bill. It is paid with the bill and reimbursed by whoever pays the person, and the program office reads the month’s expenses against the plan by cost center.',
    },
  ],
  // On the seeded client (Northbend Athletic, Cavanaugh Glassworks,
  // Talvern Medical) these lanes are held by these roles — said plainly,
  // because two of the lanes the founder named are not yet roles of their
  // own.
  held: [
    ['Budget & planning', 'Program Manager', 'Owns the cost centers, the headcount plan and the rate bands (`/api/program/units`, the approval rules). No separate planning role exists yet; it is the program office’s desk.'],
    ['Hiring Manager', 'Hiring Manager', 'Raises, interviews, awards, signs the week. Deliberately cannot release to suppliers.'],
    ['HR Partner', 'HR Partner', 'Named per business unit. Decides the ROLE stage; names nobody’s suppliers.'],
    ['Procurement Lead', 'Procurement Lead', 'Decides the SOURCING stage and releases to the suppliers it cleared.'],
    ['Approver — the lead', 'Approver', 'Whoever owns the cost center. Where nobody is named, the program office stands in and the screen says so.'],
    ['Contract / HR manager', 'Procurement Lead · Compliance Officer', 'Not yet one role on the client. The order is Procurement’s; the paperwork verdict is Compliance’s and shows on the dashboard a week before the start. A Contract Manager role exists on the supplier side only.'],
    ['Compliance Officer', 'Compliance Officer', 'Tenure across every supplier, work authorization, supplier cover. Reads; every read logged.'],
    ['AP Clerk', 'AP Clerk', 'Receives, matches, decides an exception with a reason, pays. Cannot change a rate, start anybody or sign hours.'],
  ],
}
