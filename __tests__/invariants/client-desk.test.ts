import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { expenseAcceptanceDecision, kindWord, ACCEPTS_EXPENSES } from '@/app/api/decisions/expense-acceptance'
import { rolesFor } from '@/lib/company-defaults'
import { hasAnyPermission } from '@/lib/permissions'
import { chipsFor } from '@/app/dashboard/decisions/chips'

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
  const findings = read('src/app/api/program/desk-findings.ts')

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
    expect(decisions).toContain("import { chainTop, payerRung, viaPhrase } from '@/lib/chain-top'")
    expect(decisions).toContain('const filed = rungs.find((r) => r.id === sc.id)')
    expect(decisions).toContain('payerRung(filed, rungs)')
    expect(decisions).toContain('paying && (!asClient || paying.clientCompanyId === companyId)')
  })

  it('the dashboard counts the contracts the client pays — the top of every chain — and only people working now', () => {
    expect(program).toContain('const contracts = chainTop(everyRung)')
    expect(program).toContain("const onSite = contracts.filter((c) => c.state === 'IN_PROGRESS')")
    expect(program).toContain('const onSitePeople = new Set(onSite.map((c) => c.personId))')
    expect(program).toContain('activeContractors: onSitePeople.size')
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
    // The sentence moved into `needs-you.ts` (`emptyQueueSays`) on
    // 2026-10-03, so it can never contradict the headline above it.
    expect(needsYou).toContain('waiting on the hiring managers who own them')
    expect(page).toContain('emptyQueueSays({')
  })

  it('the headline is one sentence about the reader with the names in it, not a label and not a count', () => {
    // The sentence moved into `needs-you.ts` on 2026-09-21, because the
    // page was counting the approval queue and calling that the desk; on
    // 2026-10-19 it became one sentence naming what needs the reader.
    expect(needsYou).toContain("'Nothing needs you today.'")
    expect(needsYou).toContain("total === 1 ? 'thing needs' : 'things need'")
    expect(needsYou).toContain('export function deskHeadline(queue: readonly QueueRow[]): DeskHeadline')
    expect(page).toContain('said.says')
  })

  it('a question the twin is waiting on this desk for is counted in the queue, in the twin\u2019s own words, and opens Ask Etyme', () => {
    expect(decisions).toContain("import { waitingQuestions } from '@/lib/twin/ledger'")
    // Only what this seat may answer: never one asked on its own authority.
    expect(decisions).toContain('(await waitingQuestions(caller)).filter((q) => q.mayDecide)')
    expect(decisions).toContain("type: 'TWIN_QUESTION'")
    expect(decisions).toContain('title: TWIN_ACTS[q.action]?.says ?? q.rationale')
    expect(decisions).toContain('actionUrl: ASK_ETYME_HREF')
    expect(page).toContain("TWIN_QUESTION: 'Ask Etyme'")
  })

  it('a week that does not fit its contract is flagged in a sentence before anybody signs it', () => {
    expect(decisions).toContain("import { weekFlag, periodWord } from '@/lib/timesheet-flag'")
    expect(decisions).toContain('hoursPerWeek: sc.requirement?.hoursPerWeek ?? null')
    // "Look" opens the week it names, not the list the week sits in.
    expect(decisions).toMatch(/actionUrl: `\/dashboard\/timesheets\?id=\$\{ts\.id\}`,\s*amount,\s*flag,/)
  })

  it('a flagged week is named in the headline like any other, and is approved anyway only with a reason that goes on the signature', () => {
    expect(needsYou).toContain("input.decisions.filter((d) => d.flag || d.type === 'BILL_DISPUTED').length")
    expect(decisions).toContain("named: { whose: ts.person.name, what: 'week', whats: 'weeks' }")
    expect(page).toContain('Approve anyway')
    expect(page).toContain("if (reason.trim()) { onApprove(d, reason.trim()); setReasonFor(null) }")
    expect(page).toContain('body: JSON.stringify(note ? { note } : {})')
  })

  it('a clear desk is not an empty page: what was done today is listed under the queue', () => {
    expect(program).toContain("what: 'Hours signed'")
    expect(program).toContain("what: 'Awarded'")
    expect(needsYou).toContain("'Queue clear. Everything below was done today.'")
  })

  it('somebody starting soon shows the paperwork verdict a week early, in the words activation would use', () => {
    // Every not-started line is cleared; the panel shows the five nearest,
    // and every held start reaches the headline (2026-10-06).
    expect(program).toContain(".filter((c) => c.state !== 'IN_PROGRESS')")
    expect(program).toContain('startingSoon: cleared.slice(0, 5)')
    expect(program).toContain('paperwork: { outcome: papers.outcome, says: papers.says, fix: papers.fix, short: papers.short }')
    expect(page).toContain("'Paperwork complete. Nothing stops the start.'")
    // A held start says what is missing once, where papers alone hold it.
    expect(page).toContain(': c.paperwork.short ?? c.paperwork.says}')
  })

  it('the week-early paperwork verdict on the dashboard reads what the client\u2019s own order asked for', () => {
    // Spread last, so the line's own set beats the role's default packet
    // and the four insurance kinds the query above it selects. Cavanaugh
    // Glassworks' order to Wrenfield Technical requires a master service
    // agreement nobody ever signed; before this the desk read the default
    // packet for the role and saw nothing until the start date.
    // The verdict is read in one place, by the page and the queue alike.
    expect(program).toContain("import { startPaperwork, agreementsOnFile } from './desk-findings'")
    expect(findings).toContain("import { contractClearance, lineExtras, sentencePhrases } from '@/lib/contract-clearance'")
    expect(findings).toContain('...(await lineExtras({ sellContractId: c.id })),')
    // Last inside the call, not first: the order's answer must not be
    // overwritten by the shape it was merged into.
    const call = findings.slice(findings.indexOf('const papers = contractClearance({'))
    expect(call.indexOf('lineExtras')).toBeLessThan(call.indexOf('})'))
    expect(call.indexOf('through: c.endDate')).toBeLessThan(call.indexOf('lineExtras'))
  })

  it('the standing read under that verdict asks for the firm\u2019s whole file, never four insurance kinds by name', () => {
    // A list of four kinds went stale the day a fifth was named: the
    // certificate of good standing joined `COVER_THAT_STOPS_WORK` and
    // every caller that named keys beginning INSURANCE_ went on reading
    // past it. `supplierCoverGate` decides for itself which kinds it has
    // an opinion about, so nobody else needs a list.
    expect(findings).toContain('{ where: { companyId: c.companyId, personId: null }, select: VERIFICATION_SHAPE }')
    expect(program).not.toContain("const CERTS = ['INSURANCE_GL'")
  })

  it('the month\u2019s spend carries the line it rests on under the figure: "estimate from current rates, 160 hours a month, not signed time"', () => {
    // 160 hours a month is a stated assumption, not a measurement. It was
    // a paragraph under the six figures; since 2026-10-19 it is the one
    // line under the figure it explains (`spendLine`).
    const spend = read('src/lib/program-spend.ts')
    expect(spend).toContain('`estimate from current rates, ${HOURS_PER_MONTH} hours a month, not signed time`')
    expect(program).toContain('monthlySpendSays: spendLine(spend),')
    // And the heads with no rate are named, so the total of some seats is
    // never presented as the total of all of them.
    expect(spend).toContain('if (spend.unpriced <= 0) return line')
    expect(page).toContain('sub={s.monthlySpendSays ??')
    // The paragraph has left the page.
    expect(page).not.toContain('monthlySpendBasis')
    expect(program).not.toContain('This month counts')
  })

  it('"Roll off" on the list of contracts ending within 60 days is a plain button like "Extend", not an alarm', () => {
    const roll = page.slice(page.indexOf('onClick={() => onRolloff(c.contractId)}'))
    const button = roll.slice(0, roll.indexOf('</button>'))
    expect(button).toContain('border border-etyme-rule rounded text-etyme-ink hover:bg-etyme-canvas')
    expect(button).not.toContain('bg-etyme-attention')
  })

  it('the job requests list carries no line about how fast the first good candidate came, which is not the client’s first-screen question', () => {
    expect(page).not.toContain('firstGood')
    expect(page).not.toContain('/api/first-good')
  })

  it('a contract ending soon says in words whether anybody has acted, never "Event created"', () => {
    expect(decisions).not.toContain("'Event created'")
    expect(decisions).toContain("rolloffEvent ? 'Roll-off started' : 'Nobody has acted yet'")
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
    expect(page).toContain('Raise a job request')
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
    expect(seed).toContain('const worked = week(w, longHours ?? 40, start)')
    // A week that ended before the placement began is not filed at all,
    // never as a backwards sheet with no hours (a world born on a Sunday).
    expect(seed).toContain('if (!worked) continue')
    expect(seed).toContain('const { start: ws, end: we, days } = worked')
    // And the total is what the days add up to, so a week the start cuts
    // is not claimed at forty.
    expect(seed).toContain('const sheetHours = Object.values(days).reduce((a, b) => a + b, 0)')
    expect(seed).toContain('totalHours: sheetHours,')
  })
})

// ── An expense this firm pays for, its turn to accept ──────────────────
//
// The founder, 2026-10-19 (decision 1): an expense is accepted by each
// firm that pays for it, the client first. Money says whose turn it is
// and records the answer; the queue only puts the card in front of the
// person who can give it.

describe('an expense waiting on this firm to accept it', () => {
  const decisions = read('src/app/api/decisions/route.ts')
  const decisionsPage = read('src/app/dashboard/decisions/page.tsx')
  const row = read('src/app/api/decisions/expense-acceptance.ts')
  const now = new Date('2026-10-19T12:00:00Z')
  const helenasTrain = {
    expenseId: 'exp-1', personName: 'Helena Marsh', from: 'Computer Systems Inc', category: 'TRAVEL',
    upToCents: 25_000, currency: 'USD',
    periodStart: new Date('2026-10-14T00:00:00Z'), approvedAt: new Date('2026-10-18T09:00:00Z'),
  }
  const role = (name: string) => rolesFor('CLIENT').find((r) => r.name === name)!.permissions

  it("an expense the client has not accepted is on the AP clerk's queue as Accept expense, with the amount, the kind and the firm it came from", () => {
    const card = expenseAcceptanceDecision(helenasTrain, now)
    expect(card.title).toBe('Accept expense — Helena Marsh')
    expect(card.subtitle).toBe('$250.00 · Travel · from Computer Systems Inc')
    expect(card.entityType).toBe('EXPENSE')
    expect(card.entityId).toBe('exp-1')
    expect(card.actionUrl).toBe('/dashboard/expenses')
    expect(card.amount).toBe(250)
    // The AP clerk is the desk that pays, and the route's gate admits it.
    expect(hasAnyPermission(role('AP Clerk'), ACCEPTS_EXPENSES)).toBe(true)
    expect(decisions).toContain('if (hasAnyPermission(caller.permissions, ACCEPTS_EXPENSES)) {')
    expect(decisions).toContain('const waiting = await expensesWaitingOn(companyId)')
    expect(decisions).toContain("type: 'EXPENSE_ACCEPTANCE',\n        named: { whose: e.personName, what: 'expense', whats: 'expenses' },\n        ...expenseAcceptanceDecision(e, now),")
  })

  it('the queue asks for exactly the permissions the accept route asks for, so it never offers a card the route refuses', () => {
    expect([...ACCEPTS_EXPENSES].sort()).toEqual(['payments.record', 'timesheets.approve'])
    const route = read('src/app/api/expenses/[id]/accept/route.ts')
    expect(route).toContain("const DECIDES: Permission[] = ['timesheets.approve', 'payments.record']")
  })

  it('a seat that neither signs the work nor pays for it is not shown an expense to accept', () => {
    expect(hasAnyPermission(role('Compliance Officer'), ACCEPTS_EXPENSES)).toBe(false)
  })

  it('the card names the firm directly below and nothing else about who raised the expense', () => {
    const card = expenseAcceptanceDecision(helenasTrain, now)
    expect(`${card.title} ${card.subtitle}`).not.toMatch(/Techpeple/)
    // The row reads `from`, money's "the firm directly below", and no
    // other field of the expense names a firm.
    expect(row).toContain('from ${e.from}')
    expect(row).not.toMatch(/companyName|sellerName|employer\w*Name/)
  })

  it('the kind of expense is said in plain words, never the stored value', () => {
    expect(kindWord('TRAVEL')).toBe('Travel')
    expect(kindWord('RELOCATION')).toBe('Relocation')
    expect(kindWord('SOFT_SKILLS')).toBe('Soft skills')
  })

  it('an expense in another currency is said in its own currency and adds nothing to the dollar total', () => {
    const card = expenseAcceptanceDecision({ ...helenasTrain, currency: 'EUR', upToCents: 18_050 }, now)
    expect(card.subtitle).toMatch(/^€180\.50 · Travel · from Computer Systems Inc$/)
    expect(card.amount).toBeNull()
    expect(card.currency).toBe('EUR')
  })

  it('an expense waiting five days is urgent, two days is soon, and a fresh one is low', () => {
    const at = (iso: string) => expenseAcceptanceDecision({ ...helenasTrain, approvedAt: new Date(iso) }, now).urgency
    expect(at('2026-10-14T12:00:00Z')).toBe('HIGH')
    expect(at('2026-10-17T12:00:00Z')).toBe('MEDIUM')
    expect(at('2026-10-19T08:00:00Z')).toBe('LOW')
  })

  it('a firm with nothing to accept sees no such card, and no chip for it', () => {
    const reader = { kind: 'CLIENT' as const, isConsultant: false, permissions: role('AP Clerk') }
    expect(chipsFor(reader, {}, 0).map((c) => c.key)).not.toContain('EXPENSE_ACCEPTANCE')
    expect(chipsFor(reader, { EXPENSE_ACCEPTANCE: 1 }, 1).map((c) => c.label)).toContain('Expenses to accept')
  })

  it('accepting from the card goes through the one accept route', () => {
    expect(decisionsPage).toContain('fetch(`/api/expenses/${entityId}/accept`')
    expect(decisionsPage).toContain("decideExpense(entityId, { decision: 'accept' })")
    expect(decisionsPage).toContain("decideExpense(sendingBack.expenseId, { decision: 'send_back', reason })")
    // The card's Accept sends no figure: the route records the most this
    // firm may accept, which is the amount the card shows.
    expect(decisionsPage).not.toMatch(/decision: 'accept', amountCents/)
  })
})
