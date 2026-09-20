// The competitive landscape, rewritten against the positioning as it stands
// on 2026-09-19, drawn with the same renderer as the party documents.
import { writeFileSync } from 'node:fs'
import { clientFlow, svg, esc, parties, streams, viewFor } from './streams.mjs'

const OUT = new URL('./out/etyme-against-the-field.html', import.meta.url)

const CSS = `
:root{--canvas:#F0EEE6;--surface:#FBFAF7;--raised:#FFFFFF;--ink:#1F1E1D;--muted:#6B6862;--faint:#9C9891;--rule:#E3DFD5;--action:#2B47E5;--attention:#C0622E;--verified:#4F6F52;--mark:#2B47E5;--serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;--sans:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--canvas:#1C1B19;--surface:#23221F;--raised:#2A2926;--ink:#EDEAE3;--muted:#A9A49B;--faint:#7E7A72;--rule:#3A3834;--action:#8A9BFF;--attention:#D98356;--verified:#8FB394;--mark:#6F84F2}}
:root[data-theme="dark"]{--canvas:#1C1B19;--surface:#23221F;--raised:#2A2926;--ink:#EDEAE3;--muted:#A9A49B;--faint:#7E7A72;--rule:#3A3834;--action:#8A9BFF;--attention:#D98356;--verified:#8FB394;--mark:#6F84F2}
*{box-sizing:border-box}
body{margin:0;background:var(--canvas);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.55}
main{max-width:1160px;margin:0 auto;padding:44px 16px 96px}
h1,h2,h3{font-family:var(--serif);font-weight:400;letter-spacing:-0.02em;text-wrap:balance;margin:0}
h1{font-size:clamp(34px,4.6vw,54px);line-height:1.06;max-width:22ch}
h2{font-size:30px;line-height:1.12;margin-bottom:8px}
h3{font-size:20px;margin:0 0 6px}
.eyebrow{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:0 0 10px}
p{margin:10px 0}.prose{max-width:72ch}.lede{font-size:19px;line-height:1.45;color:var(--ink)}
.muted{color:var(--muted)}.mono{font-family:var(--mono);font-size:.86em}
a{color:var(--action)}:focus-visible{outline:2px solid var(--action);outline-offset:2px}
header{padding-bottom:28px;border-bottom:1px solid var(--rule)}
.meta{font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:18px}
section{margin-top:64px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media (max-width:760px){.two{grid-template-columns:1fr}}
.qs{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:18px}
.q{background:var(--surface);border:1px solid var(--rule);border-radius:6px;padding:18px 18px 16px}
.q h3{font-size:22px;line-height:1.2}
.q .today{color:var(--muted);font-size:14px;margin-top:10px}
.q .with{font-size:14px;margin-top:8px;border-top:1px solid var(--rule);padding-top:8px}
.q .with b{color:var(--verified);font-weight:600}
.callout{background:var(--surface);border-left:3px solid var(--action);padding:14px 18px;border-radius:0 6px 6px 0;margin:22px 0;font-size:15px;max-width:76ch}
.callout.clay{border-left-color:var(--attention)}
figure{margin:16px 0 0}
.fig{background:var(--surface);border:1px solid var(--rule);border-radius:6px;padding:12px 10px 8px;overflow-x:auto}
.lane-svg{display:block;width:100%;height:auto;max-width:100%;color:var(--ink);font-family:var(--sans)}
.lane-svg .lbl{paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round}
figcaption{font-size:14px;color:var(--muted);margin:10px 2px 0;max-width:80ch}
.panelhead{display:flex;align-items:baseline;gap:14px;margin-top:26px}.panelhead .n{font-family:var(--serif);font-size:34px;color:var(--faint);line-height:1}
.map svg{width:100%;height:auto;display:block;font-family:var(--sans);color:var(--ink)}
.tbl{overflow-x:auto;background:var(--surface);border:1px solid var(--rule);border-radius:6px}
table{border-collapse:collapse;width:100%;min-width:980px;font-size:13.5px;font-variant-numeric:tabular-nums}
th{text-align:left;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600;padding:12px 12px;border-bottom:1px solid var(--rule);background:var(--surface);position:sticky;top:0}
td{padding:11px 12px;vertical-align:top;border-bottom:1px solid var(--rule)}tr:last-child td{border-bottom:0}
th.et,td.et{background:color-mix(in oklab,var(--action) 7%,var(--surface))}
td.cap{font-weight:600;width:24%}td.cap small{display:block;font-weight:400;color:var(--muted);font-size:12.5px;margin-top:2px}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;white-space:nowrap}
.pill i{display:inline-block;width:10px;height:10px;border-radius:50%;border:1.5px solid currentColor;flex:none}
.y{color:var(--verified)}.y i{background:currentColor}
.p{color:var(--attention)}.p i{background:linear-gradient(90deg,currentColor 50%,transparent 50%)}
.n{color:var(--muted)}.n i{background:transparent}
.note{display:block;color:var(--muted);font-size:12.5px;margin-top:3px;font-weight:400}
.legend{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin:0 0 12px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.card{background:var(--surface);border:1px solid var(--rule);border-radius:6px;padding:18px 20px}
.card .tag{font-family:var(--mono);font-size:11.5px;color:var(--muted);margin-bottom:6px}
.card p{font-size:14.5px;margin:8px 0 0}
.card dl{margin:12px 0 0;display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13.5px}.card dt{color:var(--muted)}.card dd{margin:0}
.list{background:var(--surface);border:1px solid var(--rule);border-radius:6px;padding:18px 22px}
.list.win{border-top:3px solid var(--verified)}.list.gap{border-top:3px solid var(--attention)}
.list ul{margin:8px 0 0;padding-left:18px;font-size:15px}.list li{margin:7px 0}
.stat{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:18px}
.stat div{background:var(--surface);border:1px solid var(--rule);border-radius:6px;padding:14px 16px}
.stat .v{font-family:var(--serif);font-size:38px;line-height:1;margin:6px 0 4px}.stat .l{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600}.stat .s{font-size:13px;color:var(--muted)}
.sources{font-size:13.5px;color:var(--muted)}.sources li{margin:4px 0}
`

const Y = (note) => `<span class="pill y"><i></i>Yes</span>${note ? `<span class="note">${esc(note)}</span>` : ''}`
const P = (note) => `<span class="pill p"><i></i>Partial</span>${note ? `<span class="note">${esc(note)}</span>` : ''}`
const N = (note) => `<span class="pill n"><i></i>No</span>${note ? `<span class="note">${esc(note)}</span>` : ''}`
const X = (label, note) => `<span class="pill n"><i></i>${esc(label)}</span>${note ? `<span class="note">${esc(note)}</span>` : ''}`

const rows = [
  ['The whole span on one record', 'requisition → suppliers → submissions → screening → interviews → onboarding → timesheets → invoices → compliance',
    Y('Ten stations, walked from every client desk and refused at each to whoever has no business there'), Y(), Y(), Y(), Y(), Y()],
  ['Every contractor on every site, across suppliers', 'the client dashboard: on site, suppliers, spend this month, ending soon, tenure, roles waiting',
    Y('One desk reads all of it; a chain is counted at the rung the client pays'), Y('inside its program'), Y('inside its program'), Y(), Y(), Y()],
  ['Tenure to the person, across every supplier', 'counted once per day on site, however many firms billed it',
    Y('Blocks at the cap; inside a break shows the eligibility date instead of a button; every read logged'), P('tenure rules inside one program'), P('per program'), P(), P(), N()],
  ['The chain below the prime', 'every rung on the record, and what each rung may see',
    Y('Every rung recorded. The client sees the rung it pays and the standing of whoever employs the person; a sub’s name only where the client’s agreement demands it'), N(), N(), N(), N(), P('one tier of suppliers, as a marketplace')],
  ['The worker’s consent to be represented', 'who may put a person forward, and who decided that',
    Y('A bench listing the person grants and can revoke. A firm’s own W2 is told, not asked — the employment is the consent'), N(), N(), N(), N(), Y('digital right-to-represent')],
  ['Requisitions that clear themselves', 'approval that is faster than the workaround',
    Y('Within plan every desk clears by rule. A miss goes to the desk that owns it — HR, Procurement, or the lead who owns the cost center — and nobody signs their own'), Y('release strategies'), Y(), Y(), Y(), Y()],
  ['Timesheet receipt, three-way match, pay what matched', 'order ↔ timesheet receipt ↔ supplier invoice',
    Y('A bill that did not match is a decision on the AP desk, with a reason. A client never pays a bill with no signed week behind it'), Y(), Y(), Y(), Y(), Y()],
  ['Statement of work and milestones', 'fixed price, retainer, milestone',
    P('A milestone the client accepts bills on the next invoice with the acceptance as its receipt; fixed-price and retainer orders exist. No separate SOW product'), Y('separate SOW product'), Y(), Y(), Y('AI-assisted SOW'), P()],
  ['The supplier’s own desk, in the same product', 'bench, payroll, receivables, payables, rolloff — roles in the trade’s words',
    Y('Account Manager, Recruiter, Contract Manager, HR, Accounts Receivable, AP & Payroll, Compliance — one sign-in, their client is there'), P('supplier portal'), P('Beeline Professional'), P(), P(), P()],
  ['The worker’s own page', 'travels between suppliers; nothing public until they turn it on',
    Y('Files their own week; sees their own pay and never the bill rate; told what is held about them'), P('worker record inside the client’s database'), P(), P(), P('redeployment marketplace'), Y()],
  ['Paperwork by purpose', 'compliance blocks or warns; agreements are signed; proof is attached',
    Y('An I-9 or lapsed insurance blocks; a missing background check warns and records the reason. The insurance start date is a floor. Any company adds a document type without a release'), Y('document tracking with expiry'), Y(), Y(), Y(), P()],
  ['Multi-country tax, currency, language', '',
    N('One deployment, US dollars; holidays per site. Horizontal by design — a travel nurse and a validation engineer run on the same core'), Y('190 countries, 21 languages'), Y('120+ countries'), Y(), Y(), N('US and Canada')],
  ['ERP and HR integrations', '',
    P('Every bill, invoice receipt and payroll run posts to a journal; an account map states our words in their accounts. QuickBooks and Xero mapped at the boundary; nothing live-connected'), Y('native SAP'), Y(), Y('native Workday HCM'), Y(), P()],
  ['Matching that shows its reasons', 'a score carries factors, basis, confidence and what it could not see',
    Y('A bare number is a bug. Roughly half is plain rules, and that is a feature. Never the lead'), P(), P('agentic AI, human in the loop'), P(), P('“Maggi” assistant'), P()],
  ['Security certifications', 'SOC 2, ISO 27001, penetration test',
    N('Stated openly on the data processing page'), Y(), Y(), Y(), Y(), P()],
  ['Price', '',
    X('Free while testing', 'A price is set after five real vendors are using it. Founding firms keep the terms agreed with them'), X('Premium', 'among the highest in the market'), X('Quote'), X('Quote'), X('Quote'), X('Quote')],
]

const map = () => {
  // Reviewer's judgment, not a measurement. One highlight (Etyme) and one
  // neutral for everybody else, every dot labeled, so nothing rests on color.
  const pts = [
    ['SAP Fieldglass', 150, 62, 'Deepest enterprise suite; one company’s program'],
    ['Beeline', 205, 96, 'Broadest incumbent feature set; one program at a time'],
    ['Workday VNDLY', 170, 132, 'One record for employees and contractors, inside Workday'],
    ['Magnit VMS', 300, 110, 'Software plus the people who run the program'],
    ['SimplifyVMS · Conexis · VectorVMS', 265, 200, 'Lighter, cheaper; a single-program view'],
    ['Prosperix', 470, 168, 'A marketplace of suppliers and the worker’s consent; one tier'],
  ]
  let g = `<svg viewBox="0 0 900 330" role="img" aria-label="Positioning map: how much of the supply chain each system puts on one record, against enterprise depth. Etyme sits far right and low: it records the prime, the sub-vendor and the worker as parties, and has no certifications, no global tax engine and no paying customers yet.">`
  g += `<defs><marker id="mah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><polygon points="0,0 8,4 0,8" fill="currentColor" fill-opacity=".55"/></marker></defs>`
  for (const y of [90, 150, 210]) g += `<line x1="72" y1="${y}" x2="858" y2="${y}" stroke="currentColor" stroke-opacity=".08"/>`
  for (const x of [335, 600]) g += `<line x1="${x}" y1="30" x2="${x}" y2="268" stroke="currentColor" stroke-opacity=".08"/>`
  g += `<line x1="72" y1="268" x2="866" y2="268" stroke="currentColor" stroke-opacity=".55" stroke-width="1.2" marker-end="url(#mah)"/>`
  g += `<line x1="72" y1="268" x2="72" y2="22" stroke="currentColor" stroke-opacity=".55" stroke-width="1.2" marker-end="url(#mah)"/>`
  g += `<text x="200" y="292" text-anchor="middle" font-size="12" fill="currentColor" fill-opacity=".7">the client’s own program</text>`
  g += `<text x="468" y="292" text-anchor="middle" font-size="12" fill="currentColor" fill-opacity=".7">the client and its suppliers</text>`
  g += `<text x="735" y="292" text-anchor="middle" font-size="12" fill="currentColor" fill-opacity=".7">every rung, down to the worker</text>`
  g += `<text x="468" y="316" text-anchor="middle" font-size="12.5" font-weight="600" fill="currentColor" fill-opacity=".8">How much of the chain is on one record →</text>`
  g += `<text x="26" y="145" transform="rotate(-90 26 145)" text-anchor="middle" font-size="12.5" font-weight="600" fill="currentColor" fill-opacity=".8">Enterprise depth →</text>`
  for (const [name, x, y, tip] of pts) g += `<g><title>${esc(name)} — ${esc(tip)}</title><circle cx="${x}" cy="${y}" r="7" fill="var(--surface)" stroke="currentColor" stroke-width="2"/><text x="${x + 14}" y="${y + 4.5}" font-size="13" fill="currentColor">${esc(name)}</text></g>`
  g += `<g><title>Etyme — records the prime, the sub-vendor and the worker as parties; pre-launch, one deployment, no certifications</title><circle cx="770" cy="225" r="9" fill="var(--mark)" stroke="var(--surface)" stroke-width="2"/><text x="700" y="254" font-size="13.5" font-weight="600" fill="currentColor">Etyme, pre-launch</text></g>`
  return g + `</svg>`
}

const panels = () => {
  const f = clientFlow
  let h = ''
  for (const p of f.panels) {
    const id = `field-${p.id}`
    h += `<div class="panelhead"><span class="n">${p.n}</span><h3>${esc(p.name)}</h3></div>`
    h += `<figure><div class="fig">${svg({ lanes: f.lanes, steps: p.steps, arrows: p.arrows }, { id, aria: p.aria, laneH: 70 })}</div><figcaption>${esc(p.caption)}</figcaption></figure>`
  }
  return h
}

const client = parties.find((p) => p.key === 'client')
const l17 = streams.find((s) => s.id === 'l17')
const govern = svg(viewFor(client, l17), { id: 'field-l17', aria: `From the client's desks: ${l17.aria}`, laneH: 88 })

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Etyme Against the Field</title>
<meta name="description" content="Where Etyme, the system of record for contingent workers, stands beside the vendor management systems a buyer will name in the same conversation — what is different, what is behind, and who buys first.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${CSS}</style></head><body><main>

<header>
  <p class="eyebrow">Etyme · the field · September 2026</p>
  <h1>The system of record for contingent workers, beside the systems it will be measured against</h1>
  <p class="lede prose">Etyme is the layer between a company and every staffing supplier it uses: requisition, suppliers, submissions, screening, interviews, onboarding, timesheets, invoices, compliance — one record, from the desk of whoever does that job. The firms below are the ones a buyer names in the same conversation. This page says where Etyme is different, where it is behind, and who buys first.</p>
  <p class="meta">As of 19 Sep 2026 · Etyme facts from the seeded demo, the test scripts and its own readiness page · competitor facts from their public materials and the analyst reports cited at the end</p>
</header>

<section>
  <p class="eyebrow">Why anybody buys</p>
  <h2>Somebody asks a basic question about their own workforce, and nobody can answer it</h2>
  <p class="prose">Not a fine. Not a regulator. A CFO, an auditor or a board member asks one of these, and the answer is “I’ll get back to you,” then three weeks, then a number nobody trusts. That happens monthly. A company with a dozen suppliers has a dozen spreadsheets, and none of them agrees.</p>
  <div class="qs">
    ${[
      ['How many contractors do we have?', 'Each supplier knows its own. Nobody adds them up, and the one who tries gets a different total every time.', 'A count on the client dashboard, through the supplier you pay, counted once per person however many rungs billed them.'],
      ['What are we spending, by supplier?', 'Invoices arrive on different rhythms into different inboxes; the month’s number is assembled after the month.', 'Spend this month against the plan, every bill matched to a signed week before it is paid.'],
      ['Are two suppliers paid differently for one skill?', 'Rates live on invitations and in email. Nobody can put them side by side without asking each supplier.', 'A rate band per skill, set once by the program office, and every submission read against it.'],
      ['Who has been here longest?', 'Twelve months through one supplier and twelve through another read as two one-year contractors.', 'Tenure to the person, across every supplier, counted once per day on site — one panel of six, not the headline.'],
    ].map(([q, t, w]) => `<div class="q"><h3>${esc(q)}</h3><p class="today">Today: ${esc(t)}</p><p class="with"><b>On the record:</b> ${esc(w)}</p></div>`).join('')}
  </div>
  <div class="callout"><p style="margin:0"><strong>Compliance is the justification, not the motivation.</strong> People buy because they cannot answer the question. They justify the purchase to finance with what it costs when somebody finally does — co-employment exposure, a tenure cap nobody was watching, a supplier whose insurance lapsed in March. Two sentences doing two jobs; anything user-facing needs both, and the penalty never leads.</p></div>
</section>

<section>
  <p class="eyebrow">What it is, drawn</p>
  <h2>One hire, from every desk</h2>
  <p class="prose">The same ten lanes on all three panels, so a desk can be followed across them: budget and planning, the hiring manager, HR Partner, Procurement Lead, the lead who owns the cost center, contract and HR, compliance, accounts payable — and the supplier and the contractor in the shaded lanes, because what crosses to them is what the client is paying to see. Every box is a station the test scripts walk; every clay sentence is a refusal the product says in words. A vendor management system runs a program. This is the record the program runs on.</p>
  ${panels()}
  <p class="prose muted" style="margin-top:14px">The same flow is drawn from all ten parties — client, integrator, program office, prime, sub-vendor, bench vendor, a consultant’s own corporation and three kinds of candidate — with the test scripts that prove each, in <a href="https://claude.ai/artifact/EGSzb92ojaNtDAxq4fuehm">Seven streams, three counterparties</a>.</p>
</section>

<section>
  <p class="eyebrow">Where each system stands</p>
  <h2>Breadth of the chain against depth of the enterprise</h2>
  <p class="prose">A vendor management system puts one company’s program on the record. Etyme’s bet is that the questions above need a record shared across companies — the prime, the sub-vendor below it and the worker — with each rung shown what it may see and nothing more. No incumbent is built that way; Prosperix is the closest in spirit, and stops at one tier.</p>
  <figure><div class="fig map">${map()}</div><figcaption>Placement is the reviewer’s judgment from public materials, not a measured score. Depth means certifications, countries covered and native integrations. Etyme sits far right because it records the prime, the sub-vendor and the worker as parties to a deal; it sits low because it has no certifications, one deployment, one currency, and no paying customers yet.</figcaption></figure>
</section>

<section>
  <p class="eyebrow">Capability by capability</p>
  <h2>What each sells, read against what Etyme actually does today</h2>
  <p class="prose">Yes means shipped and visible. Partial means it exists in a narrower form. No means absent from public materials, or stated as absent. Etyme’s notes are the product’s own sentences — the words a screen or a refusal uses — so a reader can check them against the demo.</p>
  <div class="legend"><span class="pill y"><i></i>Yes</span><span class="pill p"><i></i>Partial</span><span class="pill n"><i></i>No</span></div>
  <div class="tbl"><table>
    <thead><tr><th>Capability</th><th class="et">Etyme</th><th>SAP Fieldglass</th><th>Beeline</th><th>Workday VNDLY</th><th>Magnit VMS</th><th>Prosperix</th></tr></thead>
    <tbody>${rows.map(([cap, sub, ...cells]) => `<tr><td class="cap">${esc(cap)}${sub ? `<small>${esc(sub)}</small>` : ''}</td>${cells.map((c, i) => `<td${i === 0 ? ' class="et"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>
</section>

<section>
  <p class="eyebrow">Who each rival is</p>
  <h2>Six names a buyer will raise</h2>
  <div class="cards">
    <div class="card"><div class="tag">Enterprise suite · owned by SAP</div><h3>SAP Fieldglass</h3><p>The heaviest option. Contingent workforce and services procurement tied to SAP finance, HR and purchasing, with localized tax and employment rules in 190 countries.</p><dl><dt>Strength</dt><dd>Global scale and compliance depth</dd><dt>Weakness</dt><dd>Long, expensive rollouts; a dated interface</dd><dt>Buyer</dt><dd>Multinationals already on SAP</dd></dl></div>
    <div class="card"><div class="tag">Independent platform · Jacksonville, FL</div><h3>Beeline</h3><p>Calls itself an extended workforce platform. Named a global market leader in VMS technology by Ardent Partners in 2025, strong in SOW, direct sourcing and AI, with over 400 enterprise clients.</p><dl><dt>Strength</dt><dd>Broadest feature set; strong partner network</dd><dt>Weakness</dt><dd>Enterprise-sized setup</dd><dt>Buyer</dt><dd>Large programs, often run by an MSP</dd></dl></div>
    <div class="card"><div class="tag">Enterprise suite · owned by Workday</div><h3>Workday VNDLY</h3><p>A VMS paired with Workday HCM so contractors and employees sit in one people system. An Everest Group leader in 2026.</p><dl><dt>Strength</dt><dd>One record for employees and contractors</dd><dt>Weakness</dt><dd>Best value only inside Workday</dd><dt>Buyer</dt><dd>Workday HCM customers</dd></dl></div>
    <div class="card"><div class="tag">VMS plus managed service · Folsom, CA</div><h3>Magnit VMS</h3><p>Sells the software and the people who run the program. An Everest Group leader in every region in 2026, with a generative-AI assistant, direct sourcing and supplier scorecards.</p><dl><dt>Strength</dt><dd>Technology plus a managed program office</dd><dt>Weakness</dt><dd>A bundled model, less neutral toward suppliers</dd><dt>Buyer</dt><dd>Companies that want the program run for them</dd></dl></div>
    <div class="card"><div class="tag">Networked VMS · US and Canada</div><h3>Prosperix</h3><p>The closest in spirit. A VMS with a built-in marketplace of suppliers and a digital right-to-represent so candidates choose who may submit them.</p><dl><dt>Strength</dt><dd>Fast setup, wide supplier reach, worker consent</dd><dt>Weakness</dt><dd>Sees one supplier tier; North America only</dd><dt>Buyer</dt><dd>Mid-market and MSPs</dd></dl></div>
    <div class="card"><div class="tag">Mid-market VMS · several vendors</div><h3>SimplifyVMS, Conexis, VectorVMS</h3><p>Lighter, cheaper systems for one program. SimplifyVMS is an Everest Group leader and star performer in 2026; Conexis and VectorVMS sell on speed and support.</p><dl><dt>Strength</dt><dd>Price and simplicity</dd><dt>Weakness</dt><dd>A single-program view; no chain</dd><dt>Buyer</dt><dd>Mid-sized companies and staffing-led programs</dd></dl></div>
  </div>
</section>

<section>
  <p class="eyebrow">Where Etyme stands</p>
  <h2>What only it does, and what it does not yet do</h2>
  <div class="two">
    <div class="list win"><h3>Only Etyme does this</h3><ul>
      <li>Puts every rung of a placement on one record — the client, the prime, the sub-vendor below it, the worker — and shows each rung exactly what it may see. The sub-vendor’s name is the prime’s to keep unless the client’s agreement says otherwise; the sub’s standing the client always sees.</li>
      <li>Adds up a person’s days on site across every supplier, once per day, blocks at the cap, and shows the eligibility date instead of a button inside a break period. Every read of it leaves a trail.</li>
      <li>Lets the worker grant and revoke each firm’s right to represent them, and tells a firm’s own employee rather than asking — because the employment is the consent.</li>
      <li>Gives the supplier a full desk in the same product, in the trade’s words: Account Manager, Recruiter, Contract Manager, HR, Accounts Receivable, AP &amp; Payroll, Compliance.</li>
      <li>Never runs a bench and never places anybody. The moment it competed with its own suppliers the network would stop growing, so it does not.</li>
      <li>Refuses in sentences. “Priya cannot start without an I-9. Get it on file, then activate.” Never a disabled button, never a code.</li>
    </ul></div>
    <div class="list gap"><h3>Where Etyme is behind</h3><ul>
      <li>No SOC 2, no ISO 27001, no penetration test. Enterprise procurement asks for these first.</li>
      <li>No data retention schedule, no self-service export or deletion, no breach-notification clock.</li>
      <li>One deployment, one currency. No global tax or employment-rule engine.</li>
      <li>Statement of work is milestones on an order, not a product of its own. Every incumbent sells SOW management.</li>
      <li>Integrations are a journal and an account map, not live connections. SAP and Workday own their suites natively.</li>
      <li>No customers and no price. Its own readiness page says one of eight edges with the outside world is proven: nobody outside has yet signed in, imported a file, or heard it on a Teams channel on that deployment.</li>
    </ul></div>
  </div>
  <div class="stat">
    <div><p class="l">Readiness</p><p class="v">1 / 8</p><p class="s">edges with the outside world proven on the deployment, by its own measure</p></div>
    <div><p class="l">Integration walk</p><p class="v">714</p><p class="s">sentences green, from “a supplier cannot award its own” to “a person supplied through a prime and a bench vendor is counted once”</p></div>
    <div><p class="l">Parties drawn</p><p class="v">10</p><p class="s">client, integrator, program office, prime, sub, bench, own corporation, three kinds of candidate</p></div>
    <div><p class="l">Price</p><p class="v">—</p><p class="s">free while testing; set after five real vendors are using it</p></div>
  </div>
</section>

<section>
  <p class="eyebrow">Governance, from the client’s desks</p>
  <h2>The moat is the record, not the feature</h2>
  <p class="prose">Once every supplier’s contracts for a client are in one place, numbers become computable that no VMS and no single supplier can produce — and that gets harder to walk away from every month. Tenure is the clearest example, which is why it is a moat and not the wedge: nobody wakes up worried about it, and “we have never been caught” is true. What a buyer says is sharpest is for a buyer to say. </p>
  <p class="prose">Every read of another person’s data writes a row, refusals included; everything the system does unprompted writes its reason and an honest note on whether it can be undone; nobody decides two desks and nobody signs their own. That is what a client’s compliance officer, auditor and CFO are actually buying — and it is the part no supplier can hand them, because no supplier can see the other suppliers.</p>
</section>

<section>
  <p class="eyebrow">Who buys first</p>
  <h2>The client is the customer</h2>
  <p class="prose">Etyme should not sell against Fieldglass or Beeline on breadth; it loses. The winnable ground is the mid-sized US company with five to fifteen staffing suppliers and no VMS today, where somebody senior has just asked one of the four questions above and been told to wait. It pays for the one thing none of its suppliers can give it. The suppliers come because their client is there.</p>
  <p class="prose">The program office that already runs such a program — an MSP — is a partner, not a rival: it takes a seat the client grants, acts under the client’s rules, and gets a shared record beneath the program it runs. Horizontal, never vertical: nothing in the core assumes IT staffing, and the same product runs a travel nurse and a validation engineer. And never lead with AI — it is in there, it does real work, and it is the least defensible thing in the product.</p>
  <div class="callout clay"><p style="margin:0"><strong>Stated on purpose, not decided here:</strong> which of the four questions is the wedge. Twice an agent has picked confidently and been repeating somebody else’s confidence. The fastest way to find out is one client answering their CFO with this instead of a spreadsheet.</p></div>
</section>

<section class="sources">
  <h2 style="font-size:18px">Sources</h2>
  <ul>
    <li><a href="https://etyme2040.vercel.app/demo">Etyme demo</a> · <a href="https://etyme2040.vercel.app/ready">readiness page</a> · <a href="https://etyme2040.vercel.app/dpa">data processing addendum</a> · <a href="https://claude.ai/artifact/EGSzb92ojaNtDAxq4fuehm">the ten party drawings and their test scripts</a></li>
    <li><a href="https://www.workday.com/en-us/products/vndly-vms/overview.html">Workday VNDLY overview</a></li>
    <li><a href="https://www.businesswire.com/news/home/20260617278095/en/Magnit-Global-Recognized-as-a-Global-Leader-in-Everest-Groups-2026-VMS-PEAK-Matrix-Assessment">Magnit, Everest Group 2026 VMS PEAK Matrix</a></li>
    <li><a href="https://www.beeline.com/news/beeline-named-2025-global-market-leader-in-vms-technology-by-ardent-partners">Beeline, Ardent Partners 2025 VMS Technology Advisor</a></li>
    <li><a href="https://www.sap.com/products/hcm/contingent-workforce-management.html">SAP Fieldglass Contingent Workforce Management</a> · <a href="https://procurementvms.com/vendor-reviews/sap-fieldglass-review.html">SAP Fieldglass review 2026</a></li>
    <li><a href="http://prosperix.com/solutions/vendor-management-system-network">Prosperix VMS Network</a></li>
    <li><a href="https://www.simplifyvms.com/">SimplifyVMS</a> · <a href="https://www.conexisvmssoftware.com/contingent-workforce-vms">Conexis</a> · <a href="https://vectorvms.com/blog/contingent-workforce-program-management/vendor-management-system-vms-your-guide-for-2026/">VectorVMS</a></li>
  </ul>
  <p>Colors on this page: one highlight for Etyme and one neutral for everybody else, every dot labeled; the three verdicts in the table carry a glyph and a word beside the color. Nothing here rests on color alone.</p>
</section>
</main></body></html>`

writeFileSync(OUT, html)
console.log('written', html.length)
