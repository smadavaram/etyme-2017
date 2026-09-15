import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import * as scopes from '@/lib/resolve-client-company'
import { payerScope } from '@/lib/resolve-client-company'
import { payerRung, type DatedRung } from '@/lib/chain-top'
import type { CallerContext } from '@/lib/api-context'

/**
 * Whose rate a caller may read.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * **A rate is a term of a contract, and only its two parties may read
 * it — each on the side they are a party to.**
 *
 * A contract has exactly two parties: the firm that sells (`companyId`)
 * and the firm that pays (`clientCompanyId`). Three consequences, and
 * every rate leak found in this codebase has been a failure of one of
 * them:
 *
 *   1. **The site is not a party.** `endClientCompanyId` says where the
 *      work happens. It is how tenure aggregates, how a client signs
 *      hours for people it never contracted with, and how headcount is
 *      counted — and it confers no right to a rate. In a chain every
 *      rung carries the same end client, so a list scoped by site hands
 *      the client its prime's cost next to its own price, and the
 *      difference is the prime's entire margin.
 *   2. **The person named on a contract is not a party to it.** A
 *      consultant is the subject of a sell contract and a party only to
 *      the pay line that names them on a buy contract. Their rate is
 *      `BuyContractCandidate.payRate` and never `SellContract.billRate`.
 *   3. **Where the paper cannot name exactly one contract the caller is
 *      a party to, the rate is null and the screen says why.** A
 *      plausible wrong rate is worse than a blank, because nobody
 *      audits a number that looks right.
 *
 * ── Why this is a test and not a note in CLAUDE.md ───────────────────
 *
 * Six defects of one shape were found in six files on one day, by five
 * different agents. Every one of them was the same mistake: a correct
 * narrow helper existed, and a caller reached for the wide one. Finding
 * the seventh by walking the app is worse than failing the build on it.
 *
 * So the six are in here as specimens. Each scanner below is run twice:
 * once against the real file, which must be clean, and once against the
 * defect verbatim as it was written, which must be caught. A guard that
 * passes on a codebase where all six are already fixed proves nothing.
 */

// ── Reading the source ────────────────────────────────────────────────

const ROOT = process.cwd()
const API = join(ROOT, 'src/app/api')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(p)
  }
  return out
}

const ROUTES = walk(API).filter((p) => p.endsWith(`${sep}route.ts`))
const asRepoPath = (p: string) => relative(ROOT, p).split(sep).join('/')
const sourceOf = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/**
 * The file with its comments removed.
 *
 * A comment that says "this route used to put billRate on the file" is
 * the fix, not the defect, and a scanner that cannot tell them apart
 * fails on the explanation of its own rule. Quotes are tracked so that
 * a `'http://'` inside a string is not read as the start of a comment.
 */
export function code(source: string): string {
  let out = ''
  let state: 'code' | 'line' | 'block' | "'" | '"' | '`' = 'code'
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    const n = source[i + 1]
    if (state === 'code') {
      if (c === '/' && n === '/') { state = 'line'; i++; continue }
      if (c === '/' && n === '*') { state = 'block'; i++; continue }
      if (c === "'" || c === '"' || c === '`') state = c
      out += c
      continue
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; out += c } ; continue }
    if (state === 'block') { if (c === '*' && n === '/') { state = 'code'; i++ } ; continue }
    if (c === '\\') { out += c + (n ?? ''); i++; continue }
    if (c === state) state = 'code'
    out += c
  }
  return out
}

/**
 * The object literal `needle` sits inside, brace-matched.
 *
 * The same scan `__tests__/invariants/autonomy.test.ts` uses to read an
 * `automationLog.create(...)` out of a route: find the marker, walk back
 * to the brace that opens its object, and forward to the one that
 * closes it.
 */
export function blockAround(source: string, needle: string): string | null {
  const at = source.indexOf(needle)
  if (at < 0) return null
  const open = source.lastIndexOf('{', at)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return null
}

const calls = (source: string, fn: string) =>
  new RegExp(`\\b${fn}\\s*\\(`).test(source)

// ── Callers, as three seats ───────────────────────────────────────────

const NIKE = 'nike'
const PRIME = 'computer-systems'
const SUB = 'cloudepa'

const seat = (kind: string, companyId: string): CallerContext =>
  ({
    person: { id: 'someone', name: 'Somebody' },
    company: { id: companyId, kind, name: kind, slug: kind },
    context: { type: 'EMPLOYEE' },
    permissions: ['*'],
  }) as unknown as CallerContext

const onBench = (personId: string, agencyId: string): CallerContext =>
  ({
    person: { id: personId, name: 'Helena Marsh' },
    company: { id: agencyId, kind: 'VENDOR', name: 'agency', slug: 'agency' },
    context: { type: 'CONSULTANT' },
    permissions: [],
  }) as unknown as CallerContext

const nobody = {
  person: { id: 'someone', name: 'Somebody' },
  company: null,
  context: { type: 'EMPLOYEE' },
  permissions: [],
} as unknown as CallerContext

// ═══════════════════════════════════════════════════════════════════════
// 1 · The rule, on the helpers themselves
// ═══════════════════════════════════════════════════════════════════════

describe('a rate is a term of a contract, and only its two parties may read it', () => {
  it('scopes a client to the contracts it is itself billed on, and to no others', () => {
    expect(payerScope(seat('CLIENT', NIKE))).toEqual({ clientCompanyId: NIKE })
  })

  it('never lets the site the work happens at stand in for the firm that pays', () => {
    // Both of Helena's legs name Nike as end client — the sub's as much
    // as the prime's — so an end-client clause on a list that carries a
    // rate is the leak itself, not a route to it.
    for (const kind of ['CLIENT', 'VENDOR', 'MSP', 'GSI']) {
      expect(JSON.stringify(payerScope(seat(kind, NIKE)))).not.toContain('endClient')
    }
  })

  it('gives a supplier its own book, and an intermediary both sides of its own', () => {
    expect(payerScope(seat('VENDOR', SUB))).toEqual({ companyId: SUB })
    expect(payerScope(seat('MSP', PRIME))).toEqual({
      OR: [{ companyId: PRIME }, { clientCompanyId: PRIME }],
    })
  })

  it('treats the person named on a contract as the subject of it and not a party to it', () => {
    // Their session points at the agency whose bench they sit on. Read
    // as employment it handed a contractor the agency's whole book.
    expect(payerScope(onBench('helena', SUB))).toEqual({ personId: 'helena' })
    expect(payerScope(onBench('helena', SUB))).not.toEqual({ companyId: SUB })
  })

  it('entitles a caller with no company to nothing, rather than to an empty filter meaning everything', () => {
    expect(payerScope(nobody)).toBeNull()
  })

  it('has one answer for whose contract it is, so there is no wide one left to reach for by mistake', () => {
    // `sellContractScope` was the wide one: for a CLIENT it returned the
    // end-client clause, every rung of every chain at its sites, rates
    // and all. Two routes picked it and both printed a supplier's
    // supplier's rate on the client's own screen.
    //
    // It should not exist. It is a synonym whose only function in this
    // codebase has been to be chosen by accident, and deleting it is a
    // better invariant than this test. While it lives, it must be the
    // narrow one exactly.
    const wide = (scopes as Record<string, unknown>).sellContractScope as
      | ((c: CallerContext) => unknown)
      | undefined
    if (!wide) return // Deleted. Better than any assertion here.
    for (const kind of ['CLIENT', 'VENDOR', 'MSP', 'GSI']) {
      expect(wide(seat(kind, NIKE))).toEqual(payerScope(seat(kind, NIKE)))
    }
    expect(wide(onBench('helena', SUB))).toEqual(payerScope(onBench('helena', SUB)))
    expect(wide(nobody)).toEqual(payerScope(nobody))
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2 · Which scope each route may use, written down rather than remembered
// ═══════════════════════════════════════════════════════════════════════

/**
 * The seven ways a caller's entitlement is turned into a query.
 *
 * Every one of them is narrow and correct for the list it was written
 * for. The defect is never in the helper; it is always in the choosing.
 */
const SCOPES = [
  'payerScope',
  'sellContractScope',
  'buyContractScope',
  'expenseScope',
  'invoiceScope',
  'requirementScope',
  'submissionScope',
] as const

/**
 * Which route may ask which question.
 *
 * A register rather than a convention, because a convention is what the
 * six defects were already breaking. A route that scopes a list by
 * company and is not in here fails the build until somebody writes down
 * which scope it uses and why — which is the moment the wrong choice is
 * cheapest to notice.
 */
const REGISTER: Record<string, { may: string[]; because: string }> = {
  'src/app/api/timesheets/route.ts': {
    may: ['payerScope'],
    because:
      'Hours are read by three seats owed three different numbers. The rows a ' +
      'client sees are the ones at its sites; the rate on each is walked up to ' +
      'the contract the client pays, by lib/chain-top, never read off the leg ' +
      'the hours were filed against.',
  },
  'src/app/api/contracts/route.ts': {
    may: ['payerScope', 'buyContractScope'],
    because:
      'A sell list is the contracts this firm sells or is billed on; a buy list ' +
      'is what it pays. Two questions, two scopes, one route.',
  },
  'src/app/api/rolloff/route.ts': {
    may: ['sellContractScope'],
    because:
      'The one caller of the wide name left. It is harmless today only because ' +
      'the wide name now returns the narrow answer. The switch to payerScope, ' +
      'and the deletion of the export, belong to etyme-supply and etyme-demand ' +
      'respectively; this line goes when they are done.',
  },
  'src/app/api/expenses/route.ts': {
    may: ['expenseScope'],
    because:
      'A vendor owns its expenses; a client is a party only to the billable ones ' +
      'raised against work at its own sites, because those land on its invoices.',
  },
  'src/app/api/invoices/[id]/route.ts': {
    may: ['invoiceScope'],
    because: 'An invoice has two parties and both sit on the agreement behind it.',
  },
  'src/app/api/invoices/[id]/received/route.ts': {
    may: ['invoiceScope'],
    because: 'Same two parties; recording receipt is not a wider read than viewing.',
  },
  'src/app/api/invoices/[id]/match/route.ts': {
    may: ['invoiceScope'],
    because: 'Same two parties; the three-way match is read by the payer and the biller.',
  },
  'src/app/api/invoices/[id]/payments/route.ts': {
    may: ['invoiceScope'],
    because: 'Same two parties; a payment is against an invoice both can already read.',
  },
  'src/app/api/requirements/route.ts': {
    may: ['requirementScope'],
    because:
      'A role is read by whoever raised it, whoever was invited to it, and — ' +
      'where it was deliberately opened — the network. Not by a contract scope: ' +
      'there is no contract yet.',
  },
  'src/app/api/submissions/route.ts': {
    may: ['submissionScope'],
    because:
      'A submission has a sender and a recipient. A client reads the ones ' +
      'addressed to it before it is a party to any contract at all.',
  },
}

describe('which scope a route may use is written down, not remembered', () => {
  const scopeCalls = (repoPath: string): string[] =>
    SCOPES.filter((fn) => calls(code(sourceOf(repoPath)), fn))

  it('names every route that scopes a list by company, so a new one cannot be quietly added', () => {
    const unregistered = ROUTES.map(asRepoPath)
      .filter((p) => scopeCalls(p).length > 0)
      .filter((p) => !(p in REGISTER))
      .map((p) => `${p} — scopes by company and has no entry in the register`)
    expect(unregistered).toEqual([])
  })

  it('refuses a route that reaches for a scope wider than the one it is registered for', () => {
    const wrong: string[] = []
    for (const [path, entry] of Object.entries(REGISTER)) {
      for (const fn of scopeCalls(path)) {
        if (!entry.may.includes(fn)) {
          wrong.push(`${path} calls ${fn}; registered for ${entry.may.join(', ')} — ${entry.because}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  it('keeps no entry for a route that has stopped scoping anything, so the register cannot outlive the code', () => {
    const stale = Object.keys(REGISTER)
      .filter((p) => scopeCalls(p).length === 0)
      .map((p) => `${p} is registered and no longer calls a scope — delete its entry`)
    expect(stale).toEqual([])
  })

  it('says out loud why the one route still naming the wide scope is allowed to', () => {
    const naming = Object.entries(REGISTER).filter(([, e]) => e.may.includes('sellContractScope'))
    expect(naming.map(([p]) => p)).toEqual(['src/app/api/rolloff/route.ts'])
    expect(naming[0][1].because).toMatch(/payerScope/)
  })

  it('catches the timesheet list as it was written this morning, which is how this register earns its keep', () => {
    // Verbatim from src/app/api/timesheets/route.ts at 258b4bfd. It
    // showed Nike $118 — what CloudEPA charges Computer Systems —
    // against the $145 Nike pays.
    const thisMorning = `
      import { sellContractScope } from '@/lib/resolve-client-company'
      // A client approves hours worked at their sites; a vendor sees the hours
      // they bill. Both read the same table through their own side of it.
      const scope = sellContractScope(caller)
    `
    const reached = SCOPES.filter((fn) => calls(code(thisMorning), fn))
    expect(reached).toEqual(['sellContractScope'])
    expect(REGISTER['src/app/api/timesheets/route.ts'].may).not.toContain('sellContractScope')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3 · In a chain, the client reads the rung it pays
// ═══════════════════════════════════════════════════════════════════════

/**
 * Helena's chain. Nike buys her from Computer Systems at $145; Computer
 * Systems buys her from CloudEPA at $118. Both legs name Nike as the end
 * client, because that is the building she walks into.
 */
const BOTTOM: DatedRung & { billRate: number } = {
  id: 'bottom', personId: 'helena', companyId: SUB, clientCompanyId: PRIME,
  startDate: new Date('2026-02-27'), endDate: new Date('2027-02-22'), billRate: 11800,
}
const TOP: DatedRung & { billRate: number } = {
  id: 'top', personId: 'helena', companyId: PRIME, clientCompanyId: NIKE,
  startDate: new Date('2026-02-27'), endDate: new Date('2027-02-22'), billRate: 14500,
}

describe('in a chain the client reads the rung it pays and never the one underneath', () => {
  it('prices a week filed on the employer’s leg at the contract the client is billed on', () => {
    expect(payerRung(BOTTOM, [BOTTOM, TOP])?.billRate).toBe(14500)
    expect(payerRung(BOTTOM, [BOTTOM, TOP])?.billRate).not.toBe(11800)
  })

  it('understates the client by the prime’s whole margin when it reads the leg underneath', () => {
    // Three approved weeks: $17,400 at what Nike pays, $14,160 at what
    // its supplier pays. The $3,240 gap is both the wrong bill and the
    // exact figure a client must not be able to compute.
    expect(120 * TOP.billRate - 120 * BOTTOM.billRate).toBe(324_000)
  })

  it('returns nothing rather than a guess where two legs above one week both cover it', () => {
    const twin = { ...TOP, id: 'twin', billRate: 13900 }
    expect(payerRung(BOTTOM, [BOTTOM, TOP, twin])).toBeNull()
  })

  /**
   * The general form of defect 1 and defect 3: a list scoped by the site
   * the work happens at, carrying a contract rate, with nothing walking
   * that rate up to the rung the reader pays.
   */
  const bySite = (source: string) => calls(code(source), 'endClientFilter')
  const carriesAContractRate = (source: string) =>
    /billRate:\s*true/.test(code(source))
  const walksTheChain = (source: string) => code(source).includes('@/lib/chain-top')

  /**
   * Known open, each with the sentence and the owner.
   *
   * Silence about a gap is worse than the gap. These three are the same
   * defect in three more files, found by this scanner rather than by
   * walking the app, and all three are etyme-demand's to fix. A fourth
   * fails the build.
   */
  const KNOWN_OPEN: Record<string, string> = {
    'src/app/api/program/org/route.ts':
      'The org page lists every rung standing at the client’s sites and returns ' +
      '`rate: c.billRate` on each, so a chained person appears twice and the ' +
      'lower figure is the prime’s cost. etyme-demand.',
    'src/app/api/decisions/route.ts':
      'The client’s queue values a week at the rate on the leg the hours were ' +
      'filed against and prints it in the row subtitle, which in a chain is the ' +
      'supplier’s supplier’s rate. etyme-demand.',
    'src/app/api/requisitions/route.ts':
      '`medianRateForSkills` takes the median over every rung at the client, so ' +
      'the benchmark a raiser is shown blends its prime’s cost into its own ' +
      'prices. etyme-demand.',
    'src/app/api/requisitions/[id]/route.ts':
      'The same `medianRateForSkills`, copied. Two readings of one benchmark, ' +
      'both over every rung. etyme-demand.',
  }

  it('walks the rate up to the payer on every list that is scoped by the site and carries a rate', () => {
    const leaking = walk(join(ROOT, 'src'))
      .map(asRepoPath)
      .filter((p) => {
        const src = sourceOf(p)
        return bySite(src) && carriesAContractRate(src) && !walksTheChain(src)
      })
      .filter((p) => !(p in KNOWN_OPEN))
      .map((p) => `${p} — scopes sell contracts by end client, selects billRate, and never resolves the payer rung`)
    expect(leaking).toEqual([])
  })

  it('holds no file on the known-open list that has since been fixed', () => {
    const fixed = Object.keys(KNOWN_OPEN)
      .filter((p) => {
        const src = sourceOf(p)
        return !(bySite(src) && carriesAContractRate(src) && !walksTheChain(src))
      })
      .map((p) => `${p} no longer leaks — delete its line from KNOWN_OPEN in this file`)
    expect(fixed).toEqual([])
  })

  it('catches the client dashboard as it was written before lib/chain-top existed', () => {
    const before = `
      import { endClientFilter } from '@/lib/resolve-end-client'
      const contracts = await prisma.sellContract.findMany({
        where: { ...endClientFilter(clientCompany.id) },
        select: { billRate: true, personId: true },
      })
    `
    expect(bySite(before) && carriesAContractRate(before) && !walksTheChain(before)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4 · A refusal quotes the rate of the leg the reader is on
// ═══════════════════════════════════════════════════════════════════════

describe('a refusal quotes the rate of the leg the reader is on, never the leg beneath it', () => {
  const APPROVE = 'src/app/api/timesheets/[id]/approve/route.ts'
  const approve = () => code(sourceOf(APPROVE))

  /** The rate an object literal quotes, if it quotes one. */
  const ratesIn = (block: string) =>
    [...block.matchAll(/(?:rateCents|billRateCents|billRate)\s*:\s*([A-Za-z0-9_.]+)/g)].map((m) => m[1])

  it('hands a client asking about overtime its own hourly rate and not its supplier’s supplier’s', () => {
    const refusal = blockAround(approve(), `code: 'OVERTIME_UNDECIDED'`)
    expect(refusal).not.toBeNull()
    expect(refusal!).not.toContain('sellContract.billRate')
    expect(ratesIn(refusal!)).toEqual(['deciding.billRate'])
  })

  it('values the answer at that same leg, so the figure and the sentence cannot disagree', () => {
    const valued = [...approve().matchAll(/valueOf\(\s*[A-Za-z0-9_]+\s*,\s*([A-Za-z0-9_.]+)\s*\)/g)].map((m) => m[1])
    expect(valued.length).toBeGreaterThan(0)
    for (const rate of valued) expect(rate).toBe('deciding.billRate')
  })

  it('tells the approver afterwards what their own leg was worth, at their own rate', () => {
    expect(approve()).toContain('billRateCents: deciding.billRate')
  })

  it('catches the refusal as it was written before today, which is how these three earn their keep', () => {
    // Verbatim from 71153f18^, the state this morning's fix replaced.
    const before = `
      {
        error: {
          code: 'OVERTIME_UNDECIDED',
          message: saysAwaiting(unanswered, timesheet.person.name, policy),
          weeks: unanswered.map((w) => ({
            weekOf: w.weekOf,
            afterHours: policy.afterHours,
            rateCents: timesheet.sellContract.billRate,
          })),
        },
      }
    `
    const refusal = blockAround(code(before), `code: 'OVERTIME_UNDECIDED'`)
    expect(refusal).not.toBeNull()
    expect(refusal!).toContain('sellContract.billRate')
    expect(ratesIn(refusal!)).toEqual(['timesheet.sellContract.billRate'])

    const valuedBefore = 'const value = valueOf(finalSplit, timesheet.sellContract.billRate)'
    const rate = valuedBefore.match(/valueOf\(\s*[A-Za-z0-9_]+\s*,\s*([A-Za-z0-9_.]+)\s*\)/)![1]
    expect(rate).not.toBe('deciding.billRate')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5 · The pay side never reads the bill side
// ═══════════════════════════════════════════════════════════════════════

describe('a payroll file pays the rate somebody agreed to pay, never the rate somebody agreed to charge', () => {
  /** The two files that decide what a consultant is actually paid. */
  const PAY_FILES = ['src/lib/payroll-export.ts', 'src/app/api/payroll/export/route.ts']

  it('never mentions a bill rate anywhere in the code that produces the file', () => {
    const wrong = PAY_FILES
      .filter((p) => code(sourceOf(p)).includes('billRate'))
      .map((p) => `${p} reads a bill rate; what the client was charged is not what anybody is paid`)
    expect(wrong).toEqual([])
  })

  it('takes its rate from the agreement that pays the person', () => {
    expect(code(sourceOf('src/lib/payroll-export.ts'))).toContain('payRateCents')
    expect(code(sourceOf('src/app/api/payroll/export/route.ts'))).toContain('payRate')
  })

  it('leaves a week off the file and names it, rather than paying at whichever rate was handy', () => {
    expect(sourceOf('src/lib/payroll-export.ts')).toMatch(/payRateCents\s*(\|\||<=|==|!)/)
  })

  it('catches the payroll route as it was written this morning, when every file it produced paid the client’s price', () => {
    // Verbatim from ac60adc1^. $132 an hour against a $96 pay rate, on
    // every payroll file this has ever produced.
    const before = `
      sellContract: { select: { billRate: true, billCurrency: true } },
      rateCents: s.sellContract.billRate,
    `
    expect(code(before).includes('billRate')).toBe(true)
  })
})

describe('a consultant reads their own pay and never the markup taken out of their week', () => {
  const reachableByAConsultant = (source: string) => calls(code(source), 'payerScope')
  const carriesABillRate = (source: string) => /\bbillRate\b/.test(code(source))
  const knowsTheSeat = (source: string) =>
    calls(code(source), 'isConsultantSeat') || calls(code(source), 'staffOnly')

  /**
   * Known open, with the sentence and the owner.
   *
   * This is the seventh defect, found by this scanner and not by walking
   * the app — which is the whole point of writing it down.
   */
  const KNOWN_OPEN: Record<string, string> = {
    'src/app/api/contracts/route.ts':
      'GET /api/contracts?side=sell has no seat guard, and payerScope answers a ' +
      'consultant seat with { personId }. So the sell contracts that name them ' +
      'come back carrying `billRate` — their agency’s price for them — to the ' +
      'person whose pay rate is on the buy leg. Exactly defect 4, in the page ' +
      'the same session can also open. etyme-money.',
  }

  it('prices a consultant’s own week from the agreement that pays them, on every page their session can open', () => {
    for (const p of ['src/app/api/timesheets/route.ts', 'src/app/api/me/work/route.ts']) {
      expect(code(sourceOf(p))).toContain('buyContractCandidate')
      expect(code(sourceOf(p))).toContain('payRate')
    }
  })

  it('puts no bill rate in the code of any page written for the person themselves', () => {
    const wrong = ROUTES.map(asRepoPath)
      .filter((p) => p.startsWith('src/app/api/me/'))
      .filter((p) => carriesABillRate(sourceOf(p)))
      .map((p) => `${p} — a page written for the consultant reads what their agency charges`)
    expect(wrong).toEqual([])
  })

  it('guards the seat on every list that returns a contract rate through a scope a consultant can pass', () => {
    const wrong = ROUTES.map(asRepoPath)
      .filter((p) => {
        const src = sourceOf(p)
        return reachableByAConsultant(src) && carriesABillRate(src) && !knowsTheSeat(src)
      })
      .filter((p) => !(p in KNOWN_OPEN))
      .map((p) => `${p} — a consultant seat passes its scope and the rows carry a bill rate`)
    expect(wrong).toEqual([])
  })

  it('holds no file on the known-open list that has since been fixed', () => {
    const fixed = Object.keys(KNOWN_OPEN)
      .filter((p) => {
        const src = sourceOf(p)
        return !(reachableByAConsultant(src) && carriesABillRate(src) && !knowsTheSeat(src))
      })
      .map((p) => `${p} now guards the seat — delete its line from KNOWN_OPEN in this file`)
    expect(fixed).toEqual([])
  })

  it('catches the timesheet list as it was written this morning, when it handed a $96 contractor a $125 rate', () => {
    const thisMorning = `
      import { sellContractScope } from '@/lib/resolve-client-company'
      const scope = sellContractScope(caller)
      sellContract: { select: { billRate: true, billCurrency: true } },
    `
    // The old wide helper had the same consultant branch, so the seat
    // passed the scope and the rate came back regardless.
    expect(carriesABillRate(thisMorning)).toBe(true)
    expect(knowsTheSeat(thisMorning)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6 · A rate band is told to one supplier at a time
// ═══════════════════════════════════════════════════════════════════════

describe('a rate band is told to one supplier at a time, and lives where only its recipient can read it', () => {
  const SCHEMA = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8')

  const model = (name: string): string => {
    const at = SCHEMA.indexOf(`\nmodel ${name} {`)
    expect(at, `model ${name} is missing from the schema`).toBeGreaterThan(-1)
    return SCHEMA.slice(at, SCHEMA.indexOf('\n}', at))
  }

  const hasField = (block: string, field: string) =>
    new RegExp(`^\\s*${field}\\s+`, 'm').test(block)

  it('carries the pay band on the invitation, which names exactly one supplier', () => {
    const invitation = model('RequirementInvitation')
    expect(hasField(invitation, 'payMin')).toBe(true)
    expect(hasField(invitation, 'payMax')).toBe(true)
    expect(hasField(invitation, 'toCompanyId')).toBe(true)
  })

  it('carries no supplier’s band on the role itself, where a second supplier would read the first’s', () => {
    const requirement = model('Requirement')
    for (const field of ['payMin', 'payMax', 'payRate']) {
      expect(hasField(requirement, field), `Requirement.${field} would be readable by every invited supplier`).toBe(false)
    }
  })

  it('allows one invitation per supplier per role, so two bands cannot land on one row', () => {
    expect(model('RequirementInvitation')).toContain('@@unique([requirementId, toCompanyId])')
  })

  it('catches the band if it is ever moved onto the role, which is how this one keeps holding', () => {
    const moved = `
model Requirement {
  id        String @id @default(cuid())
  title     String
  payMin    Int?
  payMax    Int?
}
`
    expect(/^\s*payMin\s+/m.test(moved)).toBe(true)
  })
})
