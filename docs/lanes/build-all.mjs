// Builds: the single artifact page (every stream, the supplier's view) and
// one document per party — seven streams from that party's lanes, with the
// test scripts that prove them — then renders each party document to PDF.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { streams, parties, viewFor, svg, esc, L, clientFlow } from './streams.mjs'

const OUT = new URL('./out/', import.meta.url)
mkdirSync(OUT, { recursive: true })
import { extractSentences } from './sentences.mjs'
const REPO = new URL('../../', import.meta.url)
const SENTENCES = extractSentences(new URL('__integration__/', REPO))

// ── Test scripts → party × stream ─────────────────────────────────────────
// A file is a walk; a walk has the parties it involves and, usually, one
// stream. Where a walk crosses streams (the spine, the ledger), each step
// is read for the stream it is at and the party it names.
const FILE = {
  'agreement-lifecycle': { p: ['client', 'prime'], s: 'l12' },
  'ask-for-person': { p: ['client', 'bench'], s: 'l11' },
  'award-order': { p: ['client', 'prime'], s: 'l12' },
  'bench-invitation': { p: ['bench', 'candidate'], s: 'l11' },
  'clearance-at-placement': { p: ['prime', 'candidate'], s: 'l12' },
  'client-programme': { p: ['client'], s: 'steps' },
  'contract-activation-gate': { p: ['prime', 'candidate'], s: 'l12' },
  'contractor-invite': { p: ['bench', 'candidate'], s: 'l11' },
  'converted-placement-calendar': { p: ['prime'], s: 'l15' },
  'cover-chase': { p: ['corp', 'bench', 'client'], s: 'l12' },
  'credential-renewal': { p: ['candidate', 'bench'], s: 'l12' },
  'cycle-sides': { p: ['prime'], s: 'l15' },
  'demo-chain': { p: ['x'] }, 'demo-seats': { p: ['x'] }, 'demo-volume': { p: ['x'] },
  'desks-in-tandem': { p: ['client', 'prime'], s: 'steps' },
  'document-floor-demand': { p: ['client'], s: 'l12' },
  'document-floor': { p: ['prime', 'candidate'], s: 'l12' },
  'document-type': { p: ['client', 'prime'], s: 'l12' },
  'every-nightly-job-runs': { p: ['x'] },
  'extend-placement': { p: ['prime', 'client'], s: 'l12' },
  'first-real-transaction': { p: ['corp', 'client', 'candidate'], s: 'steps' },
  'full-spine': { p: ['client', 'msp', 'prime', 'sub', 'candidate'], s: 'steps', byName: true },
  'gsi-payroll': { p: ['gsi', 'candidate'], s: 'l15' },
  'internal-submission': { p: ['gsi', 'prime', 'candidate'], s: 'l11' },
  'interview-rounds': { p: ['client', 'candidate', 'prime'], s: 'l11' },
  'licensed-practice': { p: ['candidate', 'prime', 'client'], s: 'l12' },
  'licensed-start': { p: ['candidate', 'prime'], s: 'l12' },
  'link-window': { p: ['candidate'], s: 'l12' },
  'live-pipeline': { p: ['bench', 'prime'], s: 'l11' },
  'money-moves': { p: ['prime', 'client'], s: 'steps' },
  'network-stress': { p: ['x'] },
  'own-money': { p: ['candidate', 'gsi'], s: 'l15' },
  'own-page': { p: ['candidate', 'gsi'], s: 'l17' },
  'papering-handoff': { p: ['prime'], s: 'l12' },
  'paperwork': { p: ['candidate', 'prime'], s: 'l12' },
  'party-uniform': { p: ['msp', 'client'], s: 'l17' },
  'placement-payload': { p: ['prime', 'client', 'sub'], s: 'l17' },
  'placement-timeline': { p: ['prime'], s: 'l13' },
  'premium-invoice': { p: ['prime', 'client'], s: 'l14' },
  'reseed-across-days': { p: ['x'] }, 'reseed-gate': { p: ['x'] }, 'seed-covers-the-matrix': { p: ['x'] },
  'standing-and-seats': { p: ['bench', 'corp', 'client'], s: 'l17' },
  'status-ledger': { p: ['client', 'prime', 'candidate'], s: 'steps' },
  'supplier-onboarding': { p: ['client', 'prime'], s: 'l12' },
  'supplier-team': { p: ['prime', 'client'], s: 'l12' },
  'supplier-thread': { p: ['client', 'prime'], s: 'l11' },
  'the-wrong-desk-is-refused': { p: ['client', 'prime'], s: 'l17' },
  'training': { p: ['candidate', 'bench'], s: 'other' },
  'two-hop-chain': { p: ['prime', 'sub', 'candidate', 'client'], s: 'steps', byName: true },
  'url-tampering': { p: ['x'] },
  'visa-petition': { p: ['candidate', 'prime'], s: 'l12' },
  'whose-rate': { p: ['client', 'prime', 'sub', 'candidate'], s: 'l17' },
  'work-order': { p: ['client', 'prime'], s: 'l12' },
}
const NAME = {
  client: /\b(auralis|northbend|nike|cavanaugh|corning|talvern|terumo|corveldt|nordway|harlow|meridian|adobe)\b/i,
  msp: /\b(maren|aptiva|kestrel|msp)\b/i,
  prime: /\b(computer (systems|futures)|vertex|brightmoor|pinnacle|halcyon|arcadia)\b/i,
  sub: /\b(cloudepa|consultis|nimbus|sahasra|orchid|bluecrest|sub-?vendor)\b/i,
  candidate: /\b(priya|helena|rosalind|tariq|chidi|marisol|karthik|the person|the worker|the candidate|the consultant)\b/i,
}
const STREAM = [
  ['l16', /\b(journal|ledger|profit|margin|p&l|pnl|project order|master contract|posting|earned|currency|reconcil|erp|quickbooks|the books|made \$|what each firm made|\$[\d,]+ (in|out)|kept at each hop)\b/i],
  ['l15', /\b(payroll|pay ?day|salary|supplier'?s? invoice|vendor bill|invoice receipt|\bap\b|payable|payment run|remittance|three-way|reserve|1099|w-2|\bw2\b|owes (her|him|them|the person)|pays (priya|cloudepa|the sub|her|him|its people)|is paid|paid priya)\b/i],
  ['l14', /\b(bills?\b|billed|billing|invoic|receivable|\bar\b|dunning|credit (note|limit)|ag(e|ing)|cash|due\b|net \d+|money arriving|records? (the )?money|paid,?\b|pays? what)\b/i],
  ['l13', /\b(timesheet|time sheet|hours|week\b|approv|signature|signs?\b|signed|expense|milestone|receipt|silence|auto-approv|files? (the|their|her|his|one) (week|hours)|filed)\b/i],
  ['l12', /\b(contract|agreement|msa|order\b|purchase order|sales order|work order|onboard|activat|start(s|ed)?\b|i-9|insurance|cover\b|certificate|licen[sc]|clearance|paperwork|papers|document|packet|visa|credential|good standing|nda|desk|countersign|extend|both legs|two contract)\b/i],
  ['l11', /\b(requisition|requirement|release|distribut|invit|submit|submission|shortlist|interview|award|match|sourc|bench|listing|consent|represent|lead|opening|forward|rung|chain|role\b|seat|panel|band|puts? (her|him|them) forward)\b/i],
]
const L17 = /\b(tenure|co-?employment|classif|governance|segregat|access log|trail|logged|wall|autonomy|unprompted|automation log|do-not-return|dnr|blacklist|barred|disclos|whose rate|withh(e|o)ld|leak|tamper|cannot see|unable to see|never (sees|learns)|does not let)\b/i
const STREAM_KEYS = ['l11', 'l12', 'l13', 'l14', 'l15', 'expense', 'l16', 'l17', 'other']
const STREAM_NAME = Object.fromEntries(streams.map((s) => [s.id, `${s.code} ${s.name}`]))
STREAM_NAME.other = 'Across the streams'

function classify() {
  const out = {} // party -> stream -> file -> [sentences]
  const platform = {} // file -> [sentences]
  for (const row of SENTENCES) {
    const base = row.file.replace('.test.ts', '')
    const meta = FILE[base]
    if (!meta) continue
    if (meta.p[0] === 'x') { (platform[row.file] ??= []).push(row); continue }
    const text = `${row.describe ?? ''} · ${row.it}`
    let stream = meta.s
    if (/\bexpens/i.test(text)) stream = 'expense'
    else if (stream === 'steps') {
      stream = 'other'
      if (L17.test(text)) stream = 'l17'
      else for (const [k, re] of STREAM) if (re.test(text)) { stream = k; break }
    }
    let ps = meta.p
    if (meta.byName) {
      const hits = meta.p.filter((p) => NAME[p]?.test(text))
      if (hits.length) ps = hits
    }
    const C = /\b(karthik|ruben|own w2|own employee|employs (you|them|him|her)|employer|internal|teleworld|aptiva|sundara|delivery manager|staffs? (you|them) directly|gsi|integrator|w2)\b/i
    const B = /\b(invit|nobody (has|is) (marketing|put)|no (bench|listing|agency)|neither a bench nor|not yet on|somebody nobody|when it turns up|before any placement|what the page is for|claims? an address|turn(s|ed)? it on|a listing is theirs to give)\b/i
    const A = /\b(bench|listing|consent|represent|marketing (you|them)|agency|helena|priya|tariq|rosalind|marisol|chidi|cloudepa|pinnacle|brightmoor|sold on)\b/i
    const inviteFile = /^(bench-invitation|contractor-invite)/.test(base)
    const expanded = []
    for (const p of ps) {
      if (p !== 'candidate') { expanded.push(p); continue }
      if (C.test(text)) expanded.push('candC')
      else if (B.test(text) || inviteFile) { expanded.push('candB'); if (inviteFile || A.test(text)) expanded.push('candA') }
      else if (A.test(text)) expanded.push('candA')
      else expanded.push('candA', 'candC')
    }
    for (const p of new Set(expanded)) (((out[p] ??= {})[stream] ??= {})[row.file] ??= []).push(row)
  }
  return { out, platform }
}
const { out: TESTS, platform: PLATFORM } = classify()

// ── Shared page chrome ────────────────────────────────────────────────────
const CSS = `
  :root {
    --canvas: #F0EEE6; --surface: #FBFAF7; --raised: #FFFFFF;
    --ink: #1F1E1D; --muted: #6B6862; --faint: #9C9891; --rule: #E3DFD5;
    --action: #2B47E5; --attention: #C0622E; --verified: #4F6F52;
    --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Liberation Serif", serif;
    --sans: Inter, "Liberation Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: "IBM Plex Mono", "Liberation Mono", ui-monospace, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --canvas: #1C1B19; --surface: #23221F; --raised: #2A2926; --ink: #EDEAE3; --muted: #A9A49B; --faint: #7E7A72; --rule: #3A3834; --action: #8A9BFF; --attention: #D98356; --verified: #8FB394; } }
  :root[data-theme="dark"] { --canvas: #1C1B19; --surface: #23221F; --raised: #2A2926; --ink: #EDEAE3; --muted: #A9A49B; --faint: #7E7A72; --rule: #3A3834; --action: #8A9BFF; --attention: #D98356; --verified: #8FB394; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--canvas); color: var(--ink); font-family: var(--sans); font-size: 15px; line-height: 1.55; }
  main { max-width: 1180px; margin: 0 auto; padding: 40px 16px 80px; }
  .prose { max-width: 760px; }
  h1, h2, h3 { font-family: var(--serif); font-weight: 400; letter-spacing: -0.02em; text-wrap: balance; margin: 0; }
  h1 { font-size: clamp(30px, 4.4vw, 44px); line-height: 1.08; }
  h2 { font-size: 27px; line-height: 1.15; margin-bottom: 6px; }
  h3 { font-size: 19px; margin: 22px 0 6px; }
  .eyebrow { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 0 0 8px; font-weight: 600; }
  p { margin: 10px 0; } .lede { font-size: 17px; } .muted { color: var(--muted); }
  .mono { font-family: var(--mono); font-size: 0.88em; }
  header { padding-bottom: 22px; border-bottom: 1px solid var(--rule); margin-bottom: 30px; }
  .key { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px 22px; background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 14px 16px; margin: 22px 0 6px; font-size: 13px; }
  .key div { display: flex; gap: 10px; align-items: flex-start; } .key svg { flex: none; margin-top: 2px; }
  .stream { margin-top: 52px; padding-top: 30px; border-top: 1px solid var(--rule); }
  figure { margin: 14px 0 0; }
  .fig-scroll { overflow-x: auto; background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 10px 8px 6px; }
  .lane-svg { display: block; max-width: none; color: var(--ink); font-family: var(--sans); }
  .lane-svg .lbl { paint-order: stroke; stroke: var(--surface); stroke-width: 4px; stroke-linejoin: round; }
  figcaption { font-size: 13.5px; color: var(--muted); margin: 10px 2px 0; max-width: 820px; }
  .tbl-wrap { overflow-x: auto; margin-top: 18px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; background: var(--surface); border: 1px solid var(--rule); }
  th { text-align: left; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 600; padding: 10px 12px; border-bottom: 1px solid var(--rule); }
  td { padding: 9px 12px; vertical-align: top; border-bottom: 1px solid var(--rule); } tr:last-child td { border-bottom: 0; }
  td.w { font-weight: 600; width: 22%; } td.sap { width: 26%; color: var(--ink); } td.note { color: var(--muted); }
  .callout { background: var(--surface); border-left: 3px solid var(--action); padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 18px 0; font-size: 14px; }
  .callout.clay { border-left-color: var(--attention); }
  ul { padding-left: 20px; margin: 8px 0; } li { margin: 5px 0; }
  .scripts { margin-top: 22px; } .scripts h3 { margin-top: 14px; }
  .file { margin: 14px 0 6px; font-size: 12.5px; color: var(--muted); }
  .file .mono { color: var(--ink); }
  .tests { list-style: none; padding: 0; margin: 0 0 6px; columns: 2; column-gap: 28px; }
  .tests li { break-inside: avoid; font-size: 12.5px; padding: 3px 0 3px 14px; position: relative; margin: 0; }
  .tests li::before { content: ""; position: absolute; left: 0; top: 10px; width: 6px; height: 6px; border-radius: 50%; background: var(--verified); }
  .tests li .d { color: var(--muted); }
  .owed li::before { background: var(--attention); }
  .cover { min-height: 60vh; }
  .cover .n { font-family: var(--serif); font-size: 96px; line-height: 1; color: var(--faint); margin: 0; }
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 28px; margin: 20px 0; font-size: 14px; }
  .facts div { background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 12px 14px; }
  .facts .eyebrow { margin-bottom: 4px; }
  :focus-visible { outline: 2px solid var(--action); outline-offset: 2px; }
  @page { size: 17in 11in; margin: 0.45in; }
  @media print {
    body { background: #fff; color: #1F1E1D; font-size: 12.5px; } main { max-width: none; padding: 0; }
    :root { --canvas: #fff; --surface: #FBFAF7; }
    .lane-svg { width: 100%; height: auto; max-width: 100%; }
    .fig-scroll { overflow: visible; }
    .stream { break-before: page; margin-top: 0; padding-top: 0; border-top: 0; }
    .cover { break-after: page; min-height: 0; }
    figure, .tbl-wrap, .callout { break-inside: avoid; }
    .tests { columns: 3; } .tests li { font-size: 11px; } td { font-size: 11.5px; }
    h2 { font-size: 24px; } .key { grid-template-columns: repeat(5, 1fr); }
    a { color: inherit; text-decoration: none; }
  }
`

const KEY = `
  <div class="key" aria-label="How to read the drawings">
    <div><svg width="26" height="14" viewBox="0 0 26 14"><rect x="0" y="0" width="26" height="14" fill="currentColor" fill-opacity="0.045" stroke="currentColor" stroke-opacity="0.3"/></svg><span><strong>Shaded lane</strong> — a party outside the firm. Anything crossing into it is a document a counterparty reads.</span></div>
    <div><svg width="26" height="14" viewBox="0 0 26 14"><rect x="0" y="0" width="26" height="14" fill="#2B47E5" fill-opacity="0.09" stroke="currentColor" stroke-opacity="0.3"/></svg><span><strong>Blue-edged lane</strong> — one of this party’s own desks. Its boxes are solid; everyone else’s are faded but still there, because the stream does not change — only who is looking.</span></div>
    <div><svg width="26" height="14" viewBox="0 0 26 14"><line x1="0" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="1.4"/><polygon points="19,3 26,7 19,11" fill="currentColor"/></svg><span><strong>Labelled arrow</strong> — the artifact that moves: requisition, submission, order, timesheet receipt, bill, invoice.</span></div>
    <div><svg width="26" height="14" viewBox="0 0 26 14"><rect x="1" y="1" width="24" height="12" rx="2" fill="none" stroke="currentColor" stroke-dasharray="3 2" stroke-opacity="0.6"/></svg><span><strong>Dashed box</strong> — a station the operating model names that the build does not yet do as a moment of its own.</span></div>
    <div><svg width="26" height="14" viewBox="0 0 26 14"><circle cx="7" cy="7" r="3.2" fill="#C0622E"/></svg><span style="color:var(--attention)"><strong>Clay mark</strong> — a refusal. Segregation of duties is a BLOCK, said in a sentence, never a disabled button.</span></div>
  </div>`

const table = (rows) => `
<div class="tbl-wrap"><table>
<thead><tr><th>Etyme says</th><th>What SAP calls it — an inspiration, not a template</th><th>Where they meet, and where they part</th></tr></thead>
<tbody>${rows.map((r) => `<tr><td class="w">${esc(r[0])}</td><td class="sap">${esc(r[1])}</td><td class="note">${esc(r[2])}</td></tr>`).join('')}</tbody>
</table></div>`

const head = (title, description) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${CSS}</style></head><body><main>`
const foot = `</main></body></html>`

const DOORS = { 'world-nike': 'Northbend Athletic', 'world-corning': 'Cavanaugh Glassworks', 'world-terumo-bct': 'Talvern Medical', 'world-computer-systems': 'Computer Systems Inc', 'world-vertex-global': 'Vertex Global', 'world-cloudepa': 'CloudEPA', 'world-aptiva': 'Aptiva Workforce', 'world-teleworld': 'Teleworld Solutions', 'world-sundara': 'Sundara Systems', 'karthik-menon': 'Karthik Menon', 'helena-marsh': 'Helena Marsh', 'chidi-okafor': 'Chidi Okafor', 'colleen-byrne': 'Colleen Byrne — Byrne Critical Care LLC' }

function scriptsFor(party, streamId) {
  const files = TESTS[party.key]?.[streamId]
  if (!files) return ''
  const n = Object.values(files).reduce((a, b) => a + b.length, 0)
  let html = `<div class="scripts"><h3>Test scripts — ${n} sentence${n === 1 ? '' : 's'} that walk this party’s stations</h3>`
  for (const [file, rows] of Object.entries(files).sort()) {
    html += `<p class="file"><span class="mono">__integration__/${esc(file)}</span> · run: <span class="mono">ETYME_TEST_DB=etyme_test_walk npx vitest run -c vitest.integration.config.ts __integration__/${esc(file)}</span></p><ul class="tests">`
    let lastD = null
    for (const r of rows) {
      const d = r.describe && r.describe !== lastD ? `<span class="d">${esc(r.describe)} › </span>` : ''
      lastD = r.describe
      html += `<li>${d}${esc(r.it)}</li>`
    }
    html += `</ul>`
  }
  return html + `</div>`
}

function owedFor(view) {
  const owed = view.steps.filter((s) => s.hollow && !s.faded)
  if (!owed.length) return ''
  return `<h3>Named, not yet a moment of its own</h3><ul class="tests owed">${owed.map((s) => `<li><strong>${esc(s.label)}</strong> — ${esc(s.note)}</li>`).join('')}</ul>`
}

// ── One party document ────────────────────────────────────────────────────
// ── The client, end to end ────────────────────────────────────────────────
// One flow in three panels on the same ten lanes, ahead of the seven
// streams: the founder asked for one large drawing that includes budget &
// planning, the contract/HR manager and accounts payable along with the
// candidate and the supplier.
function clientFlowSections(party) {
  const f = clientFlow
  let html = ''
  for (const p of f.panels) {
    const id = `${party.key}-${f.id}-${p.id}`
    html += `<section class="stream" id="${id}"><p class="eyebrow">${esc(f.name)} · panel ${p.n} of ${f.panels.length} · the same ten lanes on every panel</p><h2>${esc(p.name)}</h2>`
    html += `<figure><div class="fig-scroll">${svg({ lanes: f.lanes, steps: p.steps, arrows: p.arrows }, { id, aria: `${party.name}: ${p.aria}`, laneH: 70 })}</div><figcaption>${esc(p.caption)}${p.n === 1 ? ' The dashed box is a station the operating model names that the build does not yet do as a moment of its own.' : ''}</figcaption></figure>`
    html += `</section>`
  }
  // who holds each lane on the seeded client, and the scripts that walk the whole thing
  html += `<section class="stream" id="${party.key}-${f.id}-held"><p class="eyebrow">${esc(f.name)} · who holds each lane</p><h2>The ten lanes, on the seeded client</h2>
  <div class="prose"><p>Two of the lanes the founder named are drawn as desks and are not yet roles of their own on the client — said here rather than hidden in the drawing.</p></div>
  <div class="tbl-wrap"><table><thead><tr><th>Lane in the drawing</th><th>Role on the seeded client</th><th>What it holds, and what it does not</th></tr></thead>
  <tbody>${f.held.map((r) => `<tr><td class="w">${esc(r[0])}</td><td class="sap">${esc(r[1])}</td><td class="note">${esc(r[2]).replace(/`([^`]+)`/g, '<span class="mono">$1</span>')}</td></tr>`).join('')}</tbody></table></div>`
  const walk = ['client-programme.test.ts', 'desks-in-tandem.test.ts', 'supplier-onboarding.test.ts']
  const files = {}
  for (const r of SENTENCES) if (walk.includes(r.file)) (files[r.file] ??= []).push(r)
  // the approval chain itself is proven by a unit file, not an integration walk
  const chainFile = new URL('__tests__/invariants/requisition-approval.test.ts', REPO)
  const chain = []
  let describe = null
  for (const line of readFileSync(chainFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*(describe|it|test)\((['"`])((?:\\.|(?!\2).)*)\2/)
    if (!m) continue
    const text = m[3].replace(/\\'/g, '’')
    if (m[1] === 'describe') describe = text; else chain.push({ describe, it: text })
  }
  files['unit · requisition-approval.test.ts'] = chain
  const n = Object.values(files).reduce((a, b) => a + b.length, 0)
  html += `<div class="scripts"><h3>Test scripts — ${n} sentences that walk the whole flow</h3><div class="prose"><p>The three integration files walk the flow above end to end on the seeded client rather than one stream at a time; each is listed again under the stream it belongs to. The approval chain of panel 1 — HR and Procurement alongside at one rank, the lead after both, nobody signing their own — is proven sentence by sentence in the unit file, run with <span class="mono">npx vitest run __tests__/invariants/requisition-approval.test.ts</span>.</p></div>`
  for (const [file, rows] of Object.entries(files).sort()) {
    const unit = file.startsWith('unit · ')
    html += unit
      ? `<p class="file"><span class="mono">__tests__/invariants/${esc(file.slice(7))}</span> · run: <span class="mono">npx vitest run __tests__/invariants/${esc(file.slice(7))}</span></p><ul class="tests">`
      : `<p class="file"><span class="mono">__integration__/${esc(file)}</span> · run: <span class="mono">ETYME_TEST_DB=etyme_test_walk npx vitest run -c vitest.integration.config.ts __integration__/${esc(file)}</span></p><ul class="tests">`
    let lastD = null
    for (const r of rows) { const d = r.describe && r.describe !== lastD ? `<span class="d">${esc(r.describe)} › </span>` : ''; lastD = r.describe; html += `<li>${d}${esc(r.it)}</li>` }
    html += `</ul>`
  }
  return html + `</div></section>`
}

function partyDoc(party) {
  const title = `${party.name} — seven streams, the expense flow, and the scripts that prove them`
  let html = head(title, `Etyme’s seven value streams and the expense flow, drawn from ${party.name.toLowerCase()}’s own desks, with every counterparty faded but present, and the integration test scripts that walk this party’s flows.`)
  html += `<section class="cover"><p class="eyebrow">Etyme · the operating model, from one desk · ${party.n} of 10</p><p class="n">${party.n}</p><h1>${esc(party.name)}</h1><p class="lede">${esc(party.tagline)}</p>
  <div class="facts">
    <div><p class="eyebrow">Position on a deal</p>${esc(party.position)}</div>
    <div><p class="eyebrow">Desks</p>${party.desks.map(esc).join(' · ')}</div>
    <div><p class="eyebrow">Demo doors</p>${party.doors.length ? party.doors.map((d) => `${esc(DOORS[d] ?? d)} <span class="mono muted">/demo · ${esc(d)}</span>`).join('<br>') : `<span style="color:var(--attention)">${esc(party.noDoor ?? 'None.')}</span>`}</div>
    <div><p class="eyebrow">How to read the drawings</p>${party.key === 'client' ? 'First, one hire walked end to end from every one of the client’s desks, in three panels on the same ten lanes — budget & planning through accounts payable, with the supplier and the contractor drawn solid in their shaded lanes so what crosses to them can be read; a desk can be followed across the pages. Then the seven streams, one at a time. ' : 'The seven value streams, then the expense flow — the second kind of receipt — as this party sees it. '}This party’s own desks are blue-edged and solid. Every other lane is shaded and faded but still drawn, because the stream is the same for everyone — only the vantage point moves. The scripts under each drawing are the integration tests that walk this party’s stations; every one of them is green on the branch this was built from.</div>
  </div>
  <div class="prose"><p>${esc(party.about)}</p></div>${KEY}</section>`
  if (party.key === 'client') html += clientFlowSections(party)
  for (const s of streams) {
    if (s.id === 'expense' && party.key === 'client') continue // panel 4 of the client’s own flow
    const view = viewFor(party, s)
    const id = `${party.key}-${s.id}`
    const ownCount = view.steps.filter((x) => !x.faded).length
    html += `<section class="stream" id="${id}"><p class="eyebrow">${s.code} · ${esc(party.name)}</p><h2>${esc(s.name)}</h2>`
    if (party.notYours?.[s.id]) html += `<div class="callout clay"><p style="margin:0">${esc(party.notYours[s.id])}</p></div>`
    else if (ownCount === 0) html += `<div class="callout clay"><p style="margin:0">Nothing in this stream is this party’s to do. It is drawn so the reader can see where their own work sits relative to it.</p></div>`
    html += `<figure><div class="fig-scroll">${svg(view, { id, aria: `${party.name}: ${s.aria}` })}</div><figcaption>${esc(s.caption)}</figcaption></figure>`
    html += table(s.table)
    html += owedFor(view)
    html += scriptsFor(party, s.id)
    html += `</section>`
  }
  // appendix: what holds for everybody
  const pn = Object.values(PLATFORM).reduce((a, b) => a + b.length, 0)
  html += `<section class="stream" id="${party.key}-held"><p class="eyebrow">Appendix</p><h2>Held for everybody — ${pn} sentences</h2><div class="prose"><p>Scripts that are nobody’s flow and every party’s floor: the seeded world seeds twice without a second copy, every table has something in it, every nightly job runs clean, a tampered URL is refused, every demo door opens. They are listed once here rather than under a stream, because they hold whichever desk is reading.</p></div>`
  for (const [file, rows] of Object.entries(PLATFORM).sort()) {
    html += `<p class="file"><span class="mono">__integration__/${esc(file)}</span></p><ul class="tests">${rows.map((r) => `<li>${r.describe ? `<span class="d">${esc(r.describe)} › </span>` : ''}${esc(r.it)}</li>`).join('')}</ul>`
  }
  html += `<h3>Running any of these</h3><div class="prose"><p>From the repository root, with Postgres running (the harness starts it if it is not): <span class="mono">ETYME_TEST_DB=etyme_test_walk npx vitest run -c vitest.integration.config.ts __integration__/&lt;file&gt;</span>. The database name keeps a run from colliding with another. The whole suite is the same command without a file. Built from branch <span class="mono">claude/extract-rails-business-logic-s1pd8</span>.</p></div></section>`
  return html + foot
}

// ── The single artifact page: every stream from the supplier's view ───────
function artifactPage() {
  const prime = parties.find((p) => p.key === 'prime')
  let html = head('Seven streams, three counterparties', 'Etyme’s seven value streams drawn as swim lanes from the supplier’s desks, with every artifact that crosses to a customer, a sub-vendor or a candidate, and the trade’s word set beside SAP’s — as an inspiration, never a template.')
  html += `<header><p class="eyebrow">Etyme · the operating model, drawn</p><h1>Seven streams, three counterparties, one trade’s words</h1><div class="prose">
  <p class="lede">Each of the seven value streams of the delivery matrix, drawn as the desks inside one firm and the three parties outside it — the customer above, the supply below, and the person the work is about. Beside every station, the word SAP would use for the same thing, because a buyer who knows SAP or Fieldglass should read Etyme’s screens without translation.</p>
  <p>The firm in the lanes is the <strong>supplier</strong> — a staffing vendor, a prime or a systems integrator — because it is the only party that trades with all three. A client has no customer; a program office places nobody; a consultant is the candidate. Each of the ten parties has a document of its own, drawn from its own desks; the table under the key says what each drops or gains.</p>
  <p><strong>SAP is an inspiration here, not a template.</strong> What was taken: a purchase order is a header and its lines; the signed week is the goods receipt; a supplier’s invoice is received and matched, never raised; the sales order and the purchase order both settle to one roll-up. What was not taken: its words on the screen, its codes, its forms. The screens use the trade’s words.</p></div>${KEY}</header>
  <section class="prose"><p class="eyebrow">Which company is in the lanes</p><h2>Ten parties, one set of streams</h2>
  <div class="tbl-wrap"><table><thead><tr><th>Party</th><th>Customer lane</th><th>Supply lane</th><th>Candidate lane</th><th>Payroll</th><th>What changes in its drawings</th></tr></thead><tbody>
  <tr><td><strong>Client</strong></td><td>— it <em>is</em> the customer</td><td>every supplier it pays</td><td>on its sites, through a supplier</td><td>never</td><td class="note">Its own desks split the Customer lane — Hiring Manager, Program office, Procurement Lead, AP Clerk, Compliance. Every supplier collapses to one lane: the client sees the rung it pays.</td></tr>
  <tr><td><strong>GSI · systems integrator</strong></td><td>the client</td><td>sub-vendors</td><td>own W2 as INTERNAL beside a sub’s as NETWORK</td><td>its own W2</td><td class="note">Delivery Manager where the recruiter stands; an internal-mobility arrow between two of its own desks.</td></tr>
  <tr><td><strong>MSP · program office</strong></td><td>the client whose program it runs</td><td>the whole panel</td><td>places nobody</td><td>none</td><td class="note">Acts from a seat the client grants. The client’s own acts stay in the client’s lane; the MSP is solid where it releases, coordinates, matches, watches.</td></tr>
  <tr><td><strong>Prime vendor</strong></td><td>the client</td><td>sub-vendors</td><td>a sub’s person, or its own W2</td><td>its own W2</td><td class="note">As drawn here. Both buy legs live: an order to a sub carries a ceiling; an employment to a W2 carries none.</td></tr>
  <tr><td><strong>Sub-vendor</strong></td><td>the prime</td><td>a further sub, if any</td><td>its own people</td><td>its own W2</td><td class="note">The same drawing one rung down. The end client is behind the prime’s name; the sub’s standing is always visible to it.</td></tr>
  <tr><td><strong>Bench vendor</strong></td><td>a prime, or the client</td><td>—</td><td>its bench, who consented</td><td>its own W2</td><td class="note">No rung below. The bottom lane is heaviest: consent, check-ins, releasing-soon, rolloff.</td></tr>
  <tr><td><strong>Self-employed</strong></td><td>a prime or a bench vendor</td><td>— (is the firm)</td><td>— (is the worker)</td><td>pays itself</td><td class="note">Two own lanes for one person: the firm that sells, insures and invoices; the worker who files and is paid.</td></tr>
  <tr><td><strong>Candidate — on a bench</strong></td><td>the prime that sold you on, and the site</td><td>—</td><td>is the person</td><td>paid by the firm that lists them</td><td class="note">The bottom lane read from inside: consent granted to one firm, papers, the week, the pay, the page. Never the bill rate; never the rungs above by name.</td></tr>
  <tr><td><strong>Candidate — independent</strong></td><td>none yet</td><td>—</td><td>is the person</td><td>nobody yet</td><td class="note">A state, not a flow: a page turned on as a shop window, and an invitation to decide. Everything else begins the day they grant a listing or incorporate. No seeded door exists for this party.</td></tr>
  <tr><td><strong>Candidate — a firm’s own employee</strong></td><td>the site the employer sells them to</td><td>—</td><td>is the person</td><td>payroll</td><td class="note">Told, not asked: the employment is the consent. Submitted as INTERNAL, moved between the employer’s projects without a submission, paid by payroll, never shown the bill rate.</td></tr>
  </tbody></table></div></section>`
  for (const s of streams) {
    const view = viewFor(prime, s)
    html += `<section class="stream" id="${s.id}"><p class="eyebrow">${s.code}</p><h2>${esc(s.name)}</h2><figure><div class="fig-scroll">${svg(view, { id: s.id, aria: s.aria })}</div><figcaption>${esc(s.caption)}</figcaption></figure>${table(s.table)}</section>`
  }
  html += `<section class="stream prose" id="words"><p class="eyebrow">The comparison, summed</p><h2>Where the words agree, and where they part</h2>
  <h3>Taken from SAP, by the founder’s decision</h3><ul>
  <li><strong>Bill</strong> — SAP’s process is billing; its document a billing document; its output a customer invoice. “Invoice” stays a correct synonym.</li>
  <li><strong>Invoice receipt</strong> — SAP’s own term for the step where a supplier’s invoice is received and matched. The party who issues a document names it: the supplier issues its invoice, we receive it.</li>
  <li><strong>A header and its lines</strong> — a purchase order is a header with items, and the sell and buy contracts are its lines. SAP never had a separate contract beside the order item.</li>
  <li><strong>Purchase order · sales order · work order</strong> — one document, three names, and SAP mirrors a single order as a PO on the buyer and a sales order on the seller.</li>
  <li><strong>Three-way match</strong> — order ↔ goods receipt ↔ invoice receipt is order ↔ timesheet receipt ↔ supplier invoice, and the exceptions routed to the AP desk are the same queue.</li>
  <li><strong>Master contract</strong> — the roll-up both sides settle to is SAP’s internal order or work-breakdown element. The word is Etyme-2017’s own, kept, and the tag is optional.</li>
  <li><strong>The four partner roles</strong> — sold-to, bill-to, ship-to, payer.</li></ul>
  <h3>The trade’s word chosen over SAP’s</h3><ul>
  <li><strong>Timesheet receipt</strong>, not service entry sheet. Same object; nobody at a staffing firm says the other. The screen uses the reader’s word; the mapping is stated once, at the boundary to the books.</li>
  <li><strong>Two signatures</strong>, not one approval. The client says the work happened; the employer says what it will pay for.</li>
  <li><strong>A sentence, not a message number.</strong> A refusal says what is missing and what to do.</li></ul>
  <h3>What SAP has no word for</h3><div class="callout"><ul>
  <li><strong>Consent to be marketed.</strong> A bench listing the consultant grants and can take back.</li>
  <li><strong>Neutrality.</strong> Etyme runs no bench and places nobody.</li>
  <li><strong>The person’s own page.</strong> Built from the work, made by their own first save, off until they turn it on.</li>
  <li><strong>Why, and whether it can be undone.</strong> Change records say what changed. The automation log says the reason and carries an honest reversible flag.</li>
  <li><strong>Bench reserve.</strong></li></ul></div>
  <div class="callout clay"><p style="margin:0"><strong>Where SAP already does what Etyme claims.</strong> Fieldglass tracks tenure per worker at the buyer, within its own walls. The honest claim is narrower: across suppliers who are <em>not</em> all on one system — which is every buyer who cannot afford one. That is the buyer, and that is the moat, not the wedge.</p></div></section>`
  return html + foot
}

// ── Write everything ──────────────────────────────────────────────────────
writeFileSync(new URL('seven-streams.html', OUT), artifactPage())
const written = []
for (const p of parties) {
  const f = `${p.file}.html`
  writeFileSync(new URL(f, OUT), partyDoc(p))
  written.push(f)
}
const counts = Object.fromEntries(parties.map((p) => [p.key, Object.values(TESTS[p.key] ?? {}).reduce((a, s) => a + Object.values(s).reduce((x, y) => x + y.length, 0), 0)]))
console.log('artifact + party pages written:', written.join(', '))
console.log('sentences per party:', JSON.stringify(counts), '| platform:', Object.values(PLATFORM).reduce((a, b) => a + b.length, 0))
