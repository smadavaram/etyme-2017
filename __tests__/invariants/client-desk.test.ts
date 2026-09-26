import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The client dashboard, read from Northbend Athletic's program desk: five contractors
 * for three people, $972.80 a month, seven roles waiting when two were
 * open, and "Nothing needs you" over six weeks of unsigned hours. Each
 * was a real number computed the wrong way round.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('what the client desk is told', () => {
  const decisions = read('src/app/api/decisions/route.ts')
  const program = read('src/app/api/program/route.ts')
  const page = read('src/app/dashboard/program/page.tsx')
  const needsYou = read('src/app/dashboard/program/needs-you.ts')
  const volume = read('src/lib/demo-volume.ts')
  const seed = read('src/lib/seed-programmes.ts')

  it('a submitted week reaches the client desk that signs it, not only the supplier that pays for it', () => {
    expect(decisions).toContain('{ sellContract: endClientFilter(companyId), clientApprovedAt: null }')
    expect(decisions).toContain('{ sellContract: { companyId }, employerAcceptedAt: null }')
  })

  it("a client sees the hours on a sheet, never the rate its supplier's supplier charges", () => {
    expect(decisions).toContain('`${ts.totalHours}h · through ${supplier} · ${period}`')
  })

  it("and never the name of its supplier's supplier either, which is the same walk for the name", () => {
    // This used to pin `paidSupplier.get(ts.personId) ?? sc.company.name`
    // — a lookup of the firm the client pays, falling back where the walk
    // came back empty to the employer, which is the firm two rungs down
    // printed on its own customer's queue. Found by the sweep in
    // `client-facing-names` on 2026-09-17 and routed through the one rule
    // that decides whose name a client may read.
    expect(decisions).toContain("import { mayNameSubVendors, namesForClient } from '@/lib/chain-names'")
    expect(decisions).toContain('const seenName = seenNames.get(sc.companyId)')
    expect(decisions).toContain(": 'a supplier on this site'")
  })

  it('the queue a client approves from prices a week at the contract that client is billed on', () => {
    // A week is filed against the employer's leg, which in a chain is two
    // firms below the reader. Priced there it was blank for the client
    // and, before that, its supplier's supplier's rate. Walked up, Northbend Athletic
    // reads its own $145.
    expect(decisions).toContain("import { payerRung, viaPhrase } from '@/lib/chain-top'")
    expect(decisions).toContain('const filed = rungs.find((r) => r.id === sc.id)')
    expect(decisions).toContain('payerRung(filed, rungs)')
    expect(decisions).toContain('paying && (!asClient || paying.clientCompanyId === companyId)')
  })

  it('the dashboard counts the contracts the client pays — the top of every chain — and only people working now', () => {
    expect(program).toContain('const contracts = chainTop(everyRung)')
    expect(program).toContain("const onSite = contracts.filter((c) => c.state === 'IN_PROGRESS')")
    expect(program).toContain('activeContractors: new Set(onSite.map((c) => c.personId)).size')
  })

  it('monthly spend is in cents like every other figure, so the page formats it once', () => {
    // The 160-hour month moved into `api/program/spend` on 2026-09-21,
    // so the dashboard, the org view and the census page share one
    // answer instead of writing the same assumption out four times. What
    // this test holds is unchanged: minor units all the way to the
    // screen, and the division by a hundred happens once, in the
    // formatter. (The client desk once divided by a hundred twice and
    // reported $972 of a $60,000 month.)
    expect(program).toContain('programMonthlySpend(onSite.map((c) => ({ rateMinorPerHour: c.billRate ?? null })))')
    expect(program).toContain("from '@/lib/program-spend'")
    expect(program).not.toContain('/ 100, // cents to dollars')
    expect(page).toContain('compact(s.monthlySpend)')
  })

  it('a week the client has signed leaves the client’s approvals; it is the employer’s to accept now', () => {
    expect(program).toMatch(/status: 'SUBMITTED',\s*clientApprovedAt: null,/)
    expect(page).toContain('approvalQueue: cur.approvalQueue.filter((a) => a.id !== d.entityId)')
  })

  it('when nothing is on this desk but work is waiting at another, the page says whose', () => {
    expect(page).toContain('waiting on the hiring managers who own them')
  })

  it('the headline is a sentence about the reader, not a label', () => {
    // The sentence moved into `needs-you.ts` on 2026-09-21, because the
    // page was counting the approval queue and calling that the desk.
    expect(needsYou).toContain("'Nothing needs you today.'")
    expect(needsYou).toContain("'thing needs', 'things need'")
    expect(page).toContain('said.says')
  })

  it('a week that does not fit its contract is flagged in a sentence before anybody signs it', () => {
    expect(decisions).toContain("import { timesheetFlag, periodWord } from '@/lib/timesheet-flag'")
    expect(decisions).toContain('hoursPerWeek: sc.requirement?.hoursPerWeek ?? null')
    expect(decisions).toMatch(/actionUrl: '\/dashboard\/timesheets',\s*amount,\s*flag,/)
  })

  it('the headline counts exceptions; a flagged week is approved anyway only with a reason, and the reason goes on the signature', () => {
    expect(needsYou).toContain("input.decisions.filter((d) => d.flag || d.type === 'BILL_DISPUTED').length")
    expect(needsYou).toContain("c.exceptions === 1 ? 'has an exception' : 'have exceptions'")
    expect(page).toContain('const exceptions = counts.exceptions')
    expect(page).toContain('Approve anyway')
    expect(page).toContain("if (reason.trim()) { onApprove(d, reason.trim()); setReasonFor(null) }")
    expect(page).toContain('body: JSON.stringify(note ? { note } : {})')
  })

  it('a clear desk is not an empty page: what was done today is listed under the queue', () => {
    expect(program).toContain("what: 'Hours signed'")
    expect(program).toContain("what: 'Awarded'")
    expect(page).toContain("'Queue clear. Everything below was done today.'")
  })

  it('somebody starting soon shows the paperwork verdict a week early, in the words activation would use', () => {
    expect(program).toContain("contracts.filter((c) => c.state !== 'IN_PROGRESS').slice(0, 5)")
    expect(program).toContain('paperwork: { outcome: papers.outcome, says: papers.says, fix: papers.fix }')
    expect(page).toContain("'Paperwork complete. Nothing stops the start.'")
  })

  it('the week-early paperwork verdict on the dashboard reads what the client\u2019s own order asked for', () => {
    // Spread last, so the line's own set beats the role's default packet
    // and the four insurance kinds the query above it selects. Cavanaugh
    // Glassworks' order to Wrenfield Technical requires a master service
    // agreement nobody ever signed; before this the desk read the default
    // packet for the role and saw nothing until the start date.
    expect(program).toContain("import { contractClearance, lineExtras } from '@/lib/contract-clearance'")
    expect(program).toContain('...(await lineExtras({ sellContractId: c.id })),')
    // Last inside the call, not first: the order's answer must not be
    // overwritten by the shape it was merged into.
    const call = program.slice(program.indexOf('const papers = contractClearance({'))
    expect(call.indexOf('lineExtras')).toBeLessThan(call.indexOf('})'))
    expect(call.indexOf('through: c.endDate')).toBeLessThan(call.indexOf('lineExtras'))
  })

  it('the standing read under that verdict asks for the firm\u2019s whole file, never four insurance kinds by name', () => {
    // A list of four kinds went stale the day a fifth was named: the
    // certificate of good standing joined `COVER_THAT_STOPS_WORK` and
    // every caller that named keys beginning INSURANCE_ went on reading
    // past it. `supplierCoverGate` decides for itself which kinds it has
    // an opinion about, so nobody else needs a list.
    expect(program).toContain('{ where: { companyId: c.companyId, personId: null }, select: verificationShape }')
    expect(program).not.toContain("const CERTS = ['INSURANCE_GL'")
  })

  it('the month\u2019s spend carries the sentence it rests on, not just "from current rates"', () => {
    // 160 hours a month is a stated assumption, not a measurement, and
    // `basisSays` was imported into this route the day the helper was
    // written and never called. A twenty-hour validation seat priced at
    // 160 is twice its real cost, and the page said nothing about it.
    expect(program).toContain('monthlySpendBasis:')
    expect(program).toContain('basisSays(')
    expect(program).toContain("'at the rate on the contract you pay,'")
    // And the heads with no rate are named, so the total of some seats is
    // never presented as the total of all of them.
    expect(program).toContain('spend.unpriced > 0')
    expect(page).toContain('{s.monthlySpendBasis}')
  })

  it('each supplier carries the standing this client gave it, and a published role with nobody in five days says so', () => {
    expect(program).toContain('standing: tierWord(tierOf.get(v.id), agreed.has(v.id))')
    expect(page).toContain("const quiet = r.status === 'OPEN' && r.submissions === 0 && r.openDays >= 5")
    expect(page).toContain('Widen the release or ask the suppliers.')
  })

  it('a firm with a contractor on site is on the supplier register, agreement or no agreement', () => {
    // Cavanaugh's dashboard named four suppliers and its Suppliers page
    // listed three: Wrenfield Technical had somebody on site and no
    // agreement on file, so the register — built from agreements and
    // invitations only — did not know it existed.
    const suppliers = read('src/app/api/suppliers/route.ts')
    expect(suppliers).toContain('for (const c of engagements) {')
    expect(suppliers).toContain('if (byCompany.has(c.companyId)) continue')
    // And an agreement found later enriches that row rather than wiping
    // the contacts and the invitation off it.
    expect(suppliers).toContain('const had = byCompany.get(a.vendorId)')
  })

  it('a firm with somebody on site and no agreement behind them says so, on the register and on the dashboard', () => {
    // The flag was already on every row of `/api/suppliers` and was read
    // for nothing but the wording of a dropdown option; the dashboard
    // said "Not rated", which is the standing word and not this fact.
    const register = read('src/app/dashboard/suppliers/page.tsx')
    expect(register).toContain('const noAgreement = (s: Supplier): string =>')
    expect(register).toContain('with no agreement on file')
    expect(register).toContain('No agreement')
    expect(program).toContain('agreement: agreed.has(v.id)')
    expect(page).toContain('on site with no agreement on file. Get one signed.')
  })

  it('the all-clear on tenure counts what tenure counts — everybody who has worked here, not everybody on site', () => {
    // "All 5 people on site are inside the cap" sat beside "ON SITE 4".
    // Both numbers were right. One of the five had left, served a break
    // and was clear to return: not on site, and not inside the cap.
    expect(page).toContain('function capSentence(')
    expect(page).toContain('people who have worked here')
    expect(page).toContain('served a break')
    expect(page).not.toContain('people on site are inside the cap')
  })

  it('the contractors tab counts people working today, and says separately how many have not started', () => {
    expect(page).toContain("const onSite = contractors.filter((c) => c.state === 'IN_PROGRESS').length")
    expect(page).toContain('const toStart = contractors.length - onSite')
    expect(page).not.toContain('active contractor{contractors.length !== 1')
  })

  it('a masked supplier reads like English after the word "through", not like the word twice', () => {
    // "45h · through the firm supplied through Computer Systems Inc" was
    // correct masking and nobody's sentence.
    const chain = read('src/lib/chain-top.ts')
    expect(chain).toContain('export function viaPhrase(')
    expect(chain).toContain('`a firm ${seen.through} arranged`')
    expect(decisions).toContain('viaPhrase(seenName)')
    expect(program).toContain('viaPhrase(shown(c.company.id, c.company.name))')
    expect(program).not.toContain('through ${shown(c.company.id, c.company.name).phrase}')
  })

  it('a week this client has already signed reads as signed, offers no second tick, and leaves the count', () => {
    const list = read('src/app/api/timesheets/route.ts')
    const screen = read('src/app/dashboard/timesheets/page.tsx')
    expect(list).toContain("import { maySign, type Sheet } from '@/lib/timesheet-signatures'")
    expect(list).toContain('function waitingSentence(')
    expect(list).toContain('waitingOnYou: entitled.ok && signable.ok')
    expect(screen).toContain('t.signature ? t.signature.waitingOnYou : t.status === \'SUBMITTED\'')
    expect(screen).not.toContain("const pendingApproval = timesheets.filter((t) => t.status === 'SUBMITTED').length")
  })

  it('a week over the weekly hours asks what happens to them from every desk that signs a week', () => {
    // The route refused with OVERTIME_UNDECIDED and a good sentence, and
    // only the Timesheets list had ever been taught to ask. On the
    // program dashboard and the supplier's Decisions page the row sprang
    // back: a dead end with no words on it.
    const modal = read('src/app/dashboard/timesheets/decide-overtime.tsx')
    const queue = read('src/app/dashboard/decisions/page.tsx')
    expect(modal).toContain('export function DecideOvertime(')
    for (const screen of [page, queue]) {
      expect(screen).toContain("from '../timesheets/decide-overtime'")
      expect(screen).toContain("=== 'OVERTIME_UNDECIDED'")
      expect(screen).toContain('<DecideOvertime')
    }
  })

  it('a client with nothing on it yet is told what to do first, not shown six zeros', () => {
    expect(page).toContain('Nothing here yet.')
    expect(page).toContain('Post a requirement')
  })

  it("a demo client's book is mostly history — a few dozen open, not a hundred and forty", () => {
    expect(volume).toContain("? [['OPEN', 12], ['FILLED', 48], ['CLOSED', 22], ['CANCELLED', 10], ['DRAFT', 8]]")
  })

  it('the tenure panel reads the shape the tenure route actually sends', () => {
    // The fourth walk found this white-screening the client program
    // dashboard — the page the demo door lands on — for any client with
    // somebody near the cap, which is two of the three seeded programs.
    // /api/tenure stopped sending `vendors` in 7fae9d30 and this page
    // went on calling .map on it. Nothing caught it: the fetch runs
    // through readJson to `any`, so tsc cannot see it, and 7,004 green
    // tests never read this panel. This is the test that reads it.
    const tenureRoute = read('src/app/api/tenure/route.ts')
    expect(tenureRoute, 'the route sends firms, folded').toContain('firms: firmsOnARow(')
    expect(page, 'the panel reads firms, not a field the route stopped sending')
      .toContain('{p.firms.says}')
    expect(page, 'nothing on this page reads vendors off a tenure row')
      .not.toMatch(/p\.vendors/)
    // And the page does not add its own clause about the firms it may
    // not name: `firmsOnARow` already folds them into `says`, as
    // "Computer Systems Inc (and one firm below them)". The first cut of
    // this fix appended the count on top of that and printed the clause
    // twice — invisible on the seeded world, because only a chained
    // placement over 75% of the cap reaches this panel, and ordinary at
    // a real client. This test is three greps over source text: it would
    // have caught the crash and could never have caught that, which is
    // why the walk exists.
    expect(page, 'says already carries the withheld clause')
      .not.toMatch(/firms\.withheld\s*>\s*0/)
  })

  it('the seeded Northbend Athletic desk has one week claimed over the role, so there is an exception to read', () => {
    expect(seed).toContain("rates: [9800, 7400], exceptionHours: 44,")
    expect(seed).toContain('const longHours = awaiting && w === 1 ? pl.exceptionHours ?? null : null')
    // The hours reach the days, not only the total: a sheet that says
    // 44 over five eight-hour days is a figure with nothing behind it.
    expect(seed).toContain('const { start: ws, end: we, days } = week(w, longHours ?? 40)')
    expect(seed).toContain('totalHours: longHours ?? 40,')
  })
})
