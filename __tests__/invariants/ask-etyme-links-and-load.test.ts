import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { questionsFor, CHIPS, FIRM_ORDER, FIRM_QUESTIONS, SUGGESTED_QUESTIONS, readsPicture, pictureOf, partyOf, today, type Readers } from '@/app/api/conversations/twin/ask'
import { cardsFor, paperCards, type WorkerFacts, type PaperAsk } from '@/app/api/conversations/twin/worker'
import { paperAsksFrom } from '@/app/api/conversations/twin/worker-read'

/**
 * The second Tapin walk (2026-10-30) and the calibration run of the
 * simulation (2026-11-01), as they fall to Ask Etyme:
 *
 *  - a supplier's seat was offered a client's chips, in a client's order;
 *  - Ask Etyme's greeting and answers linked to /dashboard/contracts/<id>,
 *    a page that does not exist;
 *  - the greeting took 2.25 seconds at the 95th percentile under load, a
 *    supplier's paying for a client's dashboard it never said, and a
 *    seated firm's reading the program page twice.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

// ── The chips are the party's own ──────────────────────────────────────

/** Every permission a chip asks for, so a seat holding them all may ask every question its party may. */
const ALL = [
  'requirements.write', 'requirements.read', 'submissions.create', 'timesheets.read', 'timesheets.approve',
  'payments.record', 'invoices.read', 'invoices.issue', 'governance.read', 'settings.manage',
  'consultants.read', 'assignments.write', 'utilization.read', 'vendors.manage',
]

describe('a supplier’s seat is offered a supplier’s questions, never a client’s', () => {
  it('a supplier’s owner, who may ask everything, is offered the firm’s own four, never “Who applied for my jobs?” and “What needs me today?” first', () => {
    const owner = questionsFor('FIRM', ALL, 'VENDOR')
    expect(owner).toEqual([...FIRM_QUESTIONS])
    expect(owner).not.toContain('Who applied for my jobs?')
    expect(owner).not.toContain('What needs me today?')
  })

  it('a firm seat that cannot ask one of the firm’s own four is offered a shared question in its place, after the firm’s own and never before', () => {
    // An account manager who reads jobs and submits, and reads no bills.
    const am = questionsFor('FIRM', ['requirements.read', 'submissions.create', 'consultants.read'], 'VENDOR')
    expect(am).toEqual(['Who rolls off in the next 30 days?', 'Who is on the bench?', 'Who applied for my jobs?', 'What needs me today?'])
    // AP & Payroll: accepts weeks and pays, and reads bills.
    const ap = questionsFor('FIRM', ['timesheets.approve', 'payments.record', 'invoices.read'], 'VENDOR')
    expect(ap.slice(0, 3)).toEqual(['Who rolls off in the next 30 days?', 'Which weeks are signed and not billed?', 'Which bills are unpaid?'])
    expect(ap[3]).toBe('Which weeks do I need to accept?')
  })

  it('every question a firm may be offered has its place in the firm’s order, so none jumps the firm’s own four', () => {
    for (const c of CHIPS.filter((x) => x.parties.includes('FIRM'))) expect(FIRM_ORDER, c.q).toContain(c.q)
    expect(FIRM_ORDER.slice(0, 4)).toEqual([...FIRM_QUESTIONS])
  })

  it('a client and a firm seated in a client’s program keep the client’s questions in the client’s order', () => {
    expect(questionsFor('CLIENT', ALL, 'CLIENT')[0]).toBe('What needs me today?')
    expect(questionsFor('MSP', ALL, 'MSP')).toEqual(CHIPS.filter((c) => c.parties.includes('MSP') && c.may(ALL, 'MSP')).slice(0, 4).map((c) => c.q))
    expect(questionsFor('MSP')).toEqual(SUGGESTED_QUESTIONS)
  })

  it('a supplier that holds no seat in a client’s program is a firm on the chat’s first screen, before the route answers', () => {
    expect(partyOf({ companyKind: 'VENDOR', seatedAt: null })).toBe('FIRM')
    expect(questionsFor(partyOf({ companyKind: 'VENDOR', seatedAt: null }))).toEqual([...FIRM_QUESTIONS])
    // The screen draws the route's chips once they arrive, and the party's own four until then.
    expect(read('src/app/dashboard/conversations/ask-etyme.tsx')).toContain('chips ?? questionsFor(party)')
  })
})

// ── Every link Ask Etyme hands a person opens a page ───────────────────

/** The page file an address opens, or null (the same walk demand's decision-card test makes). */
function pageFor(address: string): string | null {
  const segments = address.split(/[?#]/)[0].split('/').filter(Boolean)
  const dynamic = (s: string) => s.includes('${')
  function walk(dir: string, rest: string[]): string | null {
    const here = readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory())
    const groups = here.filter((n) => /^\(.*\)$/.test(n))
    if (rest.length === 0) {
      for (const f of ['page.tsx', 'page.ts']) if (existsSync(join(dir, f))) return join(dir, f)
      for (const g of groups) { const found = walk(join(dir, g), rest); if (found) return found }
      return null
    }
    const [seg, ...tail] = rest
    const params = here.filter((n) => /^\[[^.\]][^\]]*\]$/.test(n))
    const candidates = dynamic(seg) ? params : [...here.filter((n) => n === seg), ...params]
    for (const c of candidates) { const found = walk(join(dir, c), tail); if (found) return found }
    for (const g of groups) { const found = walk(join(dir, g), rest); if (found) return found }
    return null
  }
  return walk(join(ROOT, 'src/app'), segments)
}

const TWIN = 'src/app/api/conversations/twin'
const TWIN_FILES = readdirSync(join(ROOT, TWIN)).filter((f) => f.endsWith('.ts')).map((f) => `${TWIN}/${f}`)

/** Every /dashboard address a file hands a line, a card or a link, as written. */
function addressesIn(file: string): string[] {
  const out: string[] = []
  read(file).split('\n').forEach((text, i) => {
    if (!/\b(href|actionUrl|link|[A-Z_]+_HREF)\s*[:=]/.test(text)) return
    for (const m of text.matchAll(/(['"`])(\/dashboard[^'"`]*)\1/g)) out.push(`${file}:${i + 1} ${m[2]}`)
  })
  return out
}

describe('every link Ask Etyme hands a person opens a page that exists', () => {
  it('the resolver finds the placement’s page and refuses the contracts address that has none', () => {
    expect(pageFor('/dashboard/placements/${l.id}')).toMatch(/placements\/\[id\]\/page\.tsx$/)
    expect(pageFor('/dashboard/contracts/${l.id}')).toBeNull()
  })

  it('every link in the greeting, a card or an answer opens a page that exists', () => {
    const links = TWIN_FILES.flatMap(addressesIn)
    expect(links.length).toBeGreaterThan(20)
    const dead = links.filter((l) => pageFor(l.slice(l.indexOf(' ') + 1)) === null)
    expect(dead).toEqual([])
  })

  it('who rolls off and whose start waits on a paper open the placement’s own page', () => {
    const src = read(`${TWIN}/read.ts`)
    expect(src).not.toContain('/dashboard/contracts/${')
    expect(src).toContain('href: `/dashboard/placements/${l.id}`')
    expect(src).toContain('href: `/dashboard/placements/${x.contractId}`')
  })
})

// ── The greeting reads each thing once, and only what it says ──────────

describe('the greeting reads the program page only where it says the program’s picture, and once', () => {
  it('a client’s greeting and a seated firm’s read the picture; a supplier’s, a one-person firm’s and a worker’s never do', () => {
    expect(readsPicture('CLIENT')).toBe(true)
    expect(readsPicture('MSP')).toBe(true)
    expect(readsPicture('FIRM')).toBe(false)
    expect(readsPicture('SOLO')).toBe(false)
    expect(readsPicture('WORKER')).toBe(false)
  })

  it('people on site and the suppliers they come through are counted off the program page’s own answer, live seats only', () => {
    const p = pictureOf({
      summary: { activeContractors: 3, monthlySpend: 2_080_000, monthlySpendSays: 'Current rates come to $20,800 a month' },
      contractors: [
        { state: 'IN_PROGRESS', vendor: { id: 'pinnacle' }, currency: 'USD' },
        { state: 'IN_PROGRESS', vendor: { id: 'pinnacle' }, currency: 'USD' },
        { state: 'IN_PROGRESS', vendor: { id: 'computer-systems' }, currency: 'USD' },
        { state: 'ENDED', vendor: { id: 'veritan' }, currency: 'USD' },
      ],
    })
    expect(p).toEqual({ onSite: 3, suppliers: 2, monthlyMinor: 2_080_000, currency: 'USD' })
  })

  it('what current rates come to a month is said only where every seat on site is priced, and in one currency', () => {
    const live = (currency: string) => ({ state: 'IN_PROGRESS', vendor: { id: 'a' }, currency })
    const partial = pictureOf({ summary: { activeContractors: 2, monthlySpend: 900_000, monthlySpendSays: 'Current rates come to $9,000 a month; one person has no rate and is not in it' }, contractors: [live('USD'), live('USD')] })
    expect(partial).toMatchObject({ onSite: 2, monthlyMinor: null, currency: null })
    const two = pictureOf({ summary: { activeContractors: 2, monthlySpend: 900_000 }, contractors: [live('USD'), live('EUR')] })
    expect(two).toMatchObject({ monthlyMinor: null, currency: null })
    // A page with no count gives no picture, never a zero.
    expect(pictureOf({ summary: {} })).toBeNull()
    expect(pictureOf(null)).toBeNull()
  })

  it('a firm seated in a client’s program reads the program page once, for its queue and its picture together', () => {
    const route = read(`${TWIN}/route.ts`)
    // One read per request, shared by the queue and the picture.
    expect(route).toContain('function programOf(caller: Caller)')
    expect(route).toContain('(await programOf(caller))?.programQueue')
    expect(route).toContain('return pictureOf(await programOf(caller))')
    // Neither the page's route nor its queue wrapper is called a second time.
    expect(route).not.toContain("from '@/app/api/program/route'")
    expect(route).not.toContain("from '@/app/api/program/queue'")
    expect(route.match(/programView\(/g)?.length).toBe(1)
  })

  it('the greeting marks what it said as read in one write, and its rule reads start when the request arrives', () => {
    const route = read(`${TWIN}/route.ts`)
    const greeting = route.slice(route.indexOf('export async function GET'), route.indexOf('function startedReaders'))
    expect(greeting.match(/markNoticesSeen\(/g)?.length).toBe(1)
    expect(greeting).toContain('startedReaders(readersFor(')
  })
})

/** The greeting's recommendation, where the answer is a greeting. */
const recommended = (a: Awaited<ReturnType<typeof today>>) => (a.kind === 'NEEDS' ? a.recommend : undefined)

/** A reader with nothing on it but what a test hands it. */
function quietReaders(over: Partial<Readers> = {}): Readers {
  const none = async () => []
  return {
    waiting: none, othersWaiting: none, limits: async () => ({ ok: true as const, entries: [] }),
    told: async () => ({ told: [], stale: [] }), spendIn: async () => ({ ok: true as const, receipts: [], undated: 0 }),
    unsignedWeeks: async () => ({ ok: true as const, rows: [], total: 0, company: 'Northbend Athletic', maySign: true }),
    entry: async () => null, receiptsIn: async () => ({ ok: true as const, receipts: [] }), named: async () => ({}),
    ledgerLines: none, modelOn: async () => false, vocabulary: async () => ({ people: [], firms: [] }),
    model: async () => null, logPrompt: async () => undefined,
    ...over,
  } as Readers
}

describe('a new party’s first act is read only where the greeting has nothing else to recommend', () => {
  it('a seat with something else to recommend, somebody near the time limit, never pays for the first act’s read, and is told that first', async () => {
    let asked = 0
    const firstAct = async () => { asked++; return { says: 'Post your first job.' } }
    const near = { personId: 'p', personName: 'Tobias Lindqvist', limitOn: new Date(Date.now() + 20 * 86_400_000).toISOString(), capMonths: 18, suppliers: ['Pinnacle'], recordedAt: new Date().toISOString() }
    const g = await today(quietReaders({ limits: async () => ({ ok: true as const, entries: [near] }) }), { greeting: true, party: 'CLIENT', firstAct })
    expect(asked).toBe(0)
    expect(recommended(g)?.says).toContain('Tobias Lindqvist')
  })

  it('a new client with nothing waiting reads its first act and is told it', async () => {
    let asked = 0
    const firstAct = async () => { asked++; return { says: 'Post your first job.' } }
    const g = await today(quietReaders(), { greeting: true, party: 'CLIENT', firstAct })
    expect(asked).toBe(1)
    expect(recommended(g)?.says).toBe('Post your first job.')
  })

  it('a first act that cannot be read says nothing in its place, never a guess', async () => {
    const g = await today(quietReaders(), { greeting: true, party: 'CLIENT', firstAct: async () => { throw new Error('down') } })
    expect(recommended(g)).toBeUndefined()
  })
})

// ── The mark and the greeting on the founder-scale world (2026-11-02) ──
//
// The page-timing pass read 432,336 notices and 263,813 access-log rows
// behind the pages: the greeting 12.7 s and the mark 9.8 s at the 95th
// percentile at a client and at a seated MSP.

describe('a client’s greeting reads the program page’s four figures alone, never the whole page', () => {
  it('a client’s picture comes from the page’s figures (programSummary), and only a seated firm, which needs the page’s queue, reads the page', () => {
    const route = read(`${TWIN}/route.ts`)
    expect(route).toContain("import { programSummary } from '@/app/api/program/summary'")
    expect(route).toContain('const summary = await programSummary(caller, null)')
    expect(route).toContain('if (await seatOf(caller)) return pictureOf(await programOf(caller))')
    // The page is read for a seat only.
    expect(route).toContain('if (!seat) return null')
  })

  it('the month is said in the currency the page’s figures name, and not at all where they split it across currencies', () => {
    const summary = (byCurrency: string[], currency: string | null) => ({
      summary: {
        activeContractors: 2, vendors: 1, monthlySpend: 1_600_000, monthlySpendCurrency: currency,
        monthlySpendByCurrency: byCurrency.map((c) => ({ currency: c, minor: 800_000 })), monthlySpendSays: 'Current rates come to €16,000 a month',
      },
      // The summary's rungs carry no currency of their own.
      contractors: [{ contractId: 'a', state: 'IN_PROGRESS', vendor: { id: 'v' } }, { contractId: 'b', state: 'IN_PROGRESS', vendor: { id: 'v' } }],
    })
    expect(pictureOf(summary(['EUR'], 'EUR'))).toEqual({ onSite: 2, suppliers: 1, monthlyMinor: 1_600_000, currency: 'EUR' })
    // Through the company's rates on the page, with a sentence the greeting has no room for: not said.
    expect(pictureOf(summary(['EUR', 'USD'], 'USD'))).toMatchObject({ onSite: 2, monthlyMinor: null, currency: null })
  })
})

describe('the mark counts what a seat owes and reads nothing it does not count', () => {
  const asked = (over: Partial<PaperAsk>): PaperAsk => ({ id: 'p1', name: 'Certificate of insurance', todo: 'upload', askedBy: 'Halcyon Talent', dueOn: '2026-11-20', stopsWork: true, href: '/dashboard/my-work/paperwork', renews: null, ...over })

  it('a one-person firm’s papers are read off her papers page alone, never off all four of her pages', () => {
    const route = read(`${TWIN}/route.ts`)
    expect(route).toContain('workerPapers(caller, request)')
    expect(route).toContain('paperCards(papers ?? [])')
    expect(route).not.toContain('cardsFor(own)')
    // Where the greeting already reads her pages for her week, the papers come off that one read.
    expect(route).toContain('facts.then((f) => (f ? f.papers : null))')
    expect(route.indexOf('const ownWeek = ownFactsOf(')).toBeLessThan(route.indexOf('const queue = queueFor(request, caller)\n    void queue()'))
  })

  it('her paper cards from her papers alone are exactly the paper cards her whole facts give', () => {
    const rows = [
      { id: 'p1', kind: 'ASKED', todo: 'upload', name: 'Professional license (RN 154-882, WI)', askedBy: 'Halcyon Talent', dueOn: '2026-11-20T00:00:00Z', stopsWork: true, link: '/dashboard/my-work/paperwork' },
      { id: 'p2', kind: 'HELD', name: 'Professional license', runsOutOn: '2026-11-15T00:00:00Z' },
      { id: 'p3', kind: 'ASKED', todo: 'sign', name: 'Non-disclosure agreement', askedBy: null, dueOn: null, stopsWork: false, link: '//elsewhere' },
    ]
    const papers = paperAsksFrom(rows)
    expect(papers.map((p) => [p.name, p.todo, p.renews?.runsOutOn ?? null, p.href])).toEqual([
      ['Professional license (RN 154-882, WI)', 'upload', '2026-11-15', '/dashboard/my-work/paperwork'],
      ['Non-disclosure agreement', 'sign', null, '/dashboard/my-work/paperwork'],
    ])
    const facts = { ...EMPTY_FACTS, papers }
    expect(paperCards(papers)).toEqual(cardsFor(facts).filter((c) => c.act === 'PAPER'))
  })

  it('a worker’s mark reads her pages in count-only mode, and the count does not depend on anything that mode leaves out', () => {
    expect(read(`${TWIN}/route.ts`)).toContain('workerFacts(caller, request, undefined, { forCount: true })')
    const base: WorkerFacts = { ...EMPTY_FACTS, papers: [asked({})], toFile: [{ periodStart: '2026-10-25', periodEnd: '2026-10-31', site: 'Northbend Athletic', ended: true, wholeWeek: true, expectedHours: 40, dueOn: '2026-11-02' }] }
    // What count-only mode does not read: the hours expected, the time limit, Your page, who employs her.
    const lean: WorkerFacts = { ...base, toFile: base.toFile.map((w) => ({ ...w, expectedHours: null })), limits: [], pageOn: null, consent: { ...base.consent, employers: [] } }
    expect(cardsFor(lean).length).toBe(cardsFor(base).length)
    const src = read(`${TWIN}/worker-read.ts`)
    for (const skipped of ['const endsRead = full &&', 'const pageRead = full', 'const employersRead = full &&', 'const lines = full && work']) expect(src).toContain(skipped)
  })
})

describe('“Since you last looked” reads each thing once', () => {
  it('the seats a person holds at other firms are read once for the greeting’s notices and its conversations together', () => {
    const src = read(`${TWIN}/notices.ts`)
    expect(src).toContain('const desks = await seatsElsewhere(caller)')
    expect(src.match(/prisma\.context\.findMany\(\{\s*where: \{ personId: caller\.person\.id, type: \{ not: 'CONSULTANT' \}/g)?.length).toBe(1)
  })
})

/** A worker with nothing on her record, for the sentences above to fill in. */
const EMPTY_FACTS: WorkerFacts = {
  seat: 'CONSULTANT', seatAt: null, ownFirm: null, placements: [], toFile: [], returned: [], sent: [],
  ownCompanyBills: null, weeksWithNoRate: 0, papers: [], runningOut: [], interviews: [], stays: [], limits: [],
  consent: { benches: [], asking: [], employers: [] }, unread: [], pageOn: false,
} as WorkerFacts

// ── Owed is sent and not paid (money's one sent rule, 2026-11-02) ───────

describe('Ask Etyme says a bill is owed only once the firm that pays it was sent it', () => {
  it('a bill raised and never sent is not said to be owed to the firm', async () => {
    const { owedToUs, OWED_TO_US } = await import('@/app/api/conversations/twin/read')
    expect(owedToUs('ISSUED')).toBe(false)
    expect(owedToUs('DRAFT')).toBe(false)
    expect(OWED_TO_US).not.toContain('ISSUED')
  })

  it('a bill sent, part paid, or held by the firm paying it is still owed, and a paid or cancelled one is not', async () => {
    const { owedToUs } = await import('@/app/api/conversations/twin/read')
    for (const s of ['SUBMITTED', 'PARTIALLY_PAID', 'HELD']) expect(owedToUs(s), s).toBe(true)
    for (const s of ['PAID', 'CANCELLED', 'VOID']) expect(owedToUs(s), s).toBe(false)
  })

  it('every status Ask Etyme counts as owed is one money’s reader calls sent', async () => {
    const { OWED_TO_US } = await import('@/app/api/conversations/twin/read')
    const { isSent } = await import('@/lib/money/bill-state')
    for (const s of OWED_TO_US) expect(isSent(s), s).toBe(true)
  })
})
