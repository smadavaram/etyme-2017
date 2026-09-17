import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Whose name is on the row, everywhere a client can read one.
 *
 * In a chain — a client buys from a prime, the prime buys from a sub —
 * every rung's contract names the client as the site the work is done at.
 * So a query written as "everybody at this client" returns the sub's leg
 * too, and the sub is a firm the client has no contract with and was
 * usually never told about. Naming it hands the prime's supplier list to
 * its own customer.
 *
 * `src/lib/chain-names.ts` is the rule: the client sees the rung it pays
 * and nothing below it, unless its own agreement with the prime carries
 * `disclosesSubVendors`. Three surfaces were closed against it on
 * 2026-09-17 — compliance, tenure and alumni — and the posture document
 * said in the same breath what was still open: the wall lives in those
 * three read surfaces and is not a constraint, so the next route that
 * joins contracts at a client and prints `company.name` leaks exactly the
 * way those three did, and nothing would say so.
 *
 * This is that scanner. It is the third sweep of its kind, after
 * `authenticated-is-not-authorised` and `document-floor`, and it is
 * written the same way and for the same reason: the bug is a shape, the
 * shape recurs across agents and files, and a test per route only ever
 * covers the routes somebody already thought of.
 *
 * ── What it reads, and why it reads source ───────────────────────────
 *
 * Source, not payloads. A scanner that called the routes would need a
 * database, and this has to run in the pure suite on every commit — the
 * commit that adds the leak is the cheapest moment there will ever be to
 * catch it.
 *
 * ── What counts as a leak ────────────────────────────────────────────
 *
 * One query, two properties, and both have to hold:
 *
 *   1. it is scoped to *every rung at a client* — `endClientFilter(…)`,
 *      or a `endClientCompanyId` matched against an id by hand; and
 *   2. it asks the selling firm for its name — `company: { … name: true }`,
 *      where `company` on a contract is the seller, and at the bottom of
 *      a chain the employer.
 *
 * And it is clean if those rows are handed to `nameForClient` /
 * `namesForClient`, or reduced by `chainTop` / `payerRung` / `asPayer` to
 * the rung the client pays before any name is read off them.
 *
 * `asPayer` was added to that list on 2026-09-17, having been left off
 * it on the first run. It is `chainTop` with a price test on top — the
 * same reduction, in the same file, exported for the one caller that
 * needs the rate beside the row — and its absence made the client's org
 * view read as a leak when every name on that page comes off a rung the
 * client is itself billed on. Recognizing the fix is not the same as
 * excusing the file, which is why it is here and not in the list below.
 *
 * ── What it deliberately does not flag ───────────────────────────────
 *
 * **A list scoped to what the client pays.** `payerScope`, and a plain
 * `clientCompanyId` filter, return the rung the client is the buyer of
 * and nothing under it. That firm is the client's own supplier, its name
 * was never anybody's to withhold, and flagging it would be the scanner
 * crying wolf about the correct answer. This is the distinction that
 * makes the sweep possible from source at all: the end-client filter
 * returns every rung, the payer scope returns one.
 *
 * ── What it cannot tell apart from source, stated rather than papered ─
 *
 * - **A name fetched in a second query.** A route that selects
 *   `companyId` off every rung and then looks the names up in a separate
 *   `prisma.company.findMany` is not caught: the second query carries no
 *   client scope, and fourteen files in this repository query a company
 *   by id for entirely ordinary reasons. A rule over those would be
 *   noise, and a noisy sweep is one people stop reading.
 * - **A reduction that is only half used.** Where a query's rows are
 *   handed to `chainTop`, the scanner trusts the reduction. A route that
 *   reduces its rows for a table and keeps the raw ones for a second
 *   panel is a leak this will call clean.
 * - **Whether a client seat actually reaches the route.** It does not
 *   ask. The three closed surfaces mask only for a client's own seats and
 *   pass a supplier its own supply chain unchanged, which costs nothing
 *   on a route no client can reach — so requiring the rule is cheap and
 *   guessing at the audience is not.
 */

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full))
  }
  return out
}

/** From an opening bracket to the one that closes it. */
function balanced(src: string, from: number, open: string, close: string): string {
  let depth = 0
  for (let i = from; i < src.length; i++) {
    if (src[i] === open) depth++
    else if (src[i] === close) {
      depth--
      if (depth === 0) return src.slice(from, i + 1)
    }
  }
  return src.slice(from)
}

interface Query {
  /** The whole call, arguments and all. */
  text: string
  /** The name the rows were read into, where there is one. */
  into: string | null
}

/** Every database read in a file, with the variable it lands in. */
export function reads(src: string): Query[] {
  const out: Query[] = []
  const marker = /prisma\.\w+\.(findMany|findFirst|findUnique|findUniqueOrThrow|aggregate|groupBy)\(/g
  let m: RegExpExecArray | null
  while ((m = marker.exec(src))) {
    const text = balanced(src, m.index + m[0].length - 1, '(', ')')
    const before = src.slice(Math.max(0, m.index - 120), m.index)
    // `const rows = await …`, and the guarded form this codebase uses for
    // a read only one kind of reader needs: `const rows = isClient ? await …`.
    const assigned = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[^=;{}]*\?\s*)?(?:await\s+)?$/.exec(before)
    out.push({ text, into: assigned ? assigned[1] : null })
  }
  return out
}

/**
 * Is this read scoped to every rung at a client, rather than to the rung
 * the client pays?
 *
 * `endClientCompanyId: true` is a column being selected and
 * `endClientCompanyId: null` is the direct-placement half of the filter,
 * neither of which scopes anything to a client.
 */
export function everyRungAtAClient(query: string): boolean {
  if (/endClientFilter\(/.test(query)) return true
  for (const m of query.matchAll(/endClientCompanyId:\s*([^,\n]+)/g)) {
    const value = m[1].trim().replace(/[,}\s]+$/, '')
    if (value !== 'true' && value !== 'null') return true
  }
  return false
}

/** Does this read ask the selling firm — never the client — for its name? */
export function namesTheSellingFirm(query: string): boolean {
  // `clientCompany:` and `endClientCompany:` are the client naming
  // itself, which it may always read.
  const starts = [...query.matchAll(/(?<![A-Za-z])company:\s*\{/g)].map((m) => m.index!)
  return starts.some((i) =>
    /(?<![A-Za-z])name:\s*true/.test(balanced(query, query.indexOf('{', i), '{', '}'))
  )
}

/** Where a `where:` is held in a variable, read the variable too. */
function withScope(src: string, query: string): string {
  const named = query.match(/where:\s*([A-Za-z_$][\w$]*)\s*[,}]/)
  if (!named) return query
  const decl = new RegExp(`(?:const|let)\\s+${named[1]}\\s*=(?:[^\\n]*\\n){0,4}`).exec(src)
  return decl ? query + decl[0] : query
}

/** Are these rows handed to one of these functions anywhere in the file? */
function handedTo(src: string, fns: string, into: string | null): boolean {
  if (!into) return false
  const marker = new RegExp(`(?:${fns})\\(`, 'g')
  const wanted = new RegExp(`\\b${into}\\b`)
  let m: RegExpExecArray | null
  while ((m = marker.exec(src))) {
    if (wanted.test(balanced(src, m.index + m[0].length - 1, '(', ')'))) return true
  }
  return false
}

/** Every read in a file that names a firm the client may not be entitled to. */
export function namesBelowTheRung(src: string): Query[] {
  return reads(src).filter(
    (q) =>
      everyRungAtAClient(withScope(src, q.text)) &&
      namesTheSellingFirm(q.text) &&
      !handedTo(src, 'nameForClient|namesForClient', q.into) &&
      !handedTo(src, 'chainTop|payerRung|asPayer', q.into)
  )
}

/**
 * Client-facing reads that still name a firm below the rung the client
 * pays, with whose file each is and what it gives away.
 *
 * Empty, and kept rather than deleted, because an empty list is the
 * statement: every read in `src/` that is scoped to a client's whole
 * site and prints a selling firm's name now asks `lib/chain-names` whose
 * name it may print. A new one fails this test on the commit that adds
 * it, and its author either routes it through the rule or writes a line
 * here saying whose file it is and what it gives away.
 *
 * ── What was on it, and what it cost ─────────────────────────────────
 *
 * Six files on the first run, all `etyme-demand`'s, listed rather than
 * reached into because a file belongs to exactly one agent. All six were
 * closed on 2026-09-17, on the same walk that added `asPayer` to the
 * reductions this recognizes:
 *
 *   decisions      the client's "needs you" queue named the employer's
 *                  own firm wherever the walk up the chain came back
 *                  empty, and read no disclosure term at all
 *   identity       `vendorName` off every rung, beside a person's
 *                  history, on the screen where two records are merged
 *   people         the register, on the row and in the time-here column
 *   people/[id]    one page per person, on every engagement row
 *   program        the roster was right; the approval queue named the
 *                  leg a week or a claim was filed against
 *   program/org    read as a leak and was not one — every name on that
 *                  page comes off a rung the client is billed on, and
 *                  the sweep could not see `asPayer` doing the reducing
 */
const KNOWN_TO_NAME_BELOW_THE_RUNG: Record<string, string> = {}

// ── The three that were closed ───────────────────────────────────────

describe('the surfaces that were closed hand their rows to the name rule', () => {
  const CLOSED: Array<[string, string]> = [
    ['the compliance page', 'src/app/api/compliance/route.ts'],
    ['the tenure ledger', 'src/app/api/tenure/route.ts'],
    ['the alumni list', 'src/app/api/alumni/route.ts'],
  ]

  for (const [what, file] of CLOSED) {
    it(`${what} reads every rung at the client, which is why the rule is needed there`, () => {
      const src = readFileSync(join(ROOT, file), 'utf8')
      expect(reads(src).some((q) => everyRungAtAClient(withScope(src, q.text)))).toBe(true)
    })

    it(`${what} asks the one rule whose name a client may read, rather than deciding for itself`, () => {
      const src = readFileSync(join(ROOT, file), 'utf8')
      expect(src).toContain("from '@/lib/chain-names'")
      expect(namesBelowTheRung(src)).toEqual([])
    })
  }
})

// ── The scanner, on sources written to be read ───────────────────────

describe('the sweep can tell a firm the client pays from a firm below it', () => {

  it('a list of everybody at a client that prints the selling firm’s name is caught', () => {
    const src = `
      const everyRung = await prisma.sellContract.findMany({
        where: { ...endClientFilter(clientCompany.id) },
        select: { personId: true, company: { select: { name: true } } },
      })
      return NextResponse.json({ data: everyRung })
    `
    expect(namesBelowTheRung(src)).toHaveLength(1)
  })

  it('a list scoped to the contracts the client itself pays is left alone, because that firm is its own supplier', () => {
    const src = `
      const mine = await prisma.sellContract.findMany({
        where: { clientCompanyId: caller.company.id },
        select: { personId: true, company: { select: { name: true } } },
      })
      return NextResponse.json({ data: mine })
    `
    expect(namesBelowTheRung(src)).toEqual([])
  })

  it('a list of everybody at a client that reads no firm’s name is left alone', () => {
    const src = `
      const everyRung = await prisma.sellContract.findMany({
        where: { ...endClientFilter(clientCompany.id) },
        select: { personId: true, companyId: true, startDate: true },
      })
    `
    expect(namesBelowTheRung(src)).toEqual([])
  })

  it('a contract asked which company it sits under is not a contract naming a firm', () => {
    const src = `
      const one = await prisma.sellContract.findUnique({
        where: { id },
        select: { clientCompanyId: true, endClientCompanyId: true, company: { select: { name: true } } },
      })
    `
    expect(namesBelowTheRung(src)).toEqual([])
  })

  it('rows reduced by asPayer — which is that same reduction with a price test — are left alone too', () => {
    const src = `
      const rungs = await prisma.sellContract.findMany({
        where: { ...endClientFilter(clientCompany.id) },
        select: { personId: true, companyId: true, clientCompanyId: true, billRate: true, company: { select: { name: true } } },
      })
      const rows = asPayer(rungs, clientCompany.id)
      const priced = rows.filter((r) => r.rateCents !== null).map((r) => r.contract.company.name)
    `
    expect(namesBelowTheRung(src)).toEqual([])
  })

  it('rows reduced to the top of each chain before a name is read off them are left alone', () => {
    const src = `
      const everyRung = await prisma.sellContract.findMany({
        where: { ...endClientFilter(clientCompany.id) },
        select: { personId: true, companyId: true, clientCompanyId: true, company: { select: { name: true } } },
      })
      const contracts = chainTop(everyRung)
      const vendors = contracts.map((c) => c.company.name)
    `
    expect(namesBelowTheRung(src)).toEqual([])
  })

  it('and rows handed to the name rule are left alone, which is what being fixed looks like', () => {
    const src = `
      const everyRung = await prisma.sellContract.findMany({
        where: { ...endClientFilter(clientCompany.id) },
        select: { personId: true, companyId: true, clientCompanyId: true, company: { select: { name: true } } },
      })
      const seenNames = namesForClient(
        everyRung.map((c) => ({ id: c.id, personId: c.personId, companyId: c.companyId, companyName: c.company.name, clientCompanyId: c.clientCompanyId })),
        clientCompany.id,
        (prime) => mayNameSubVendors(terms, clientCompany.id, prime)
      )
    `
    expect(namesBelowTheRung(src)).toEqual([])
  })

  it('rows fetched only for the reader who needs the rule are still followed to it', () => {
    // A read no supplier ever makes is written as a guarded one. The
    // sweep follows it, or the fix for the placement row below would
    // look like a leak.
    const src = `
      const chainRungs = readsFromBelow
        ? await prisma.sellContract.findMany({
            where: { ...endClientFilter(mine), personId: placement.personId },
            select: { id: true, personId: true, companyId: true, clientCompanyId: true, company: { select: { name: true } } },
          })
        : []
      const seenNames = namesForClient(chainRungs.map((c) => ({ companyName: c.company.name })), mine, may)
    `
    expect(namesBelowTheRung(src)).toEqual([])
  })

  it('a name reached through a relation on another table is caught too, not only a contract read head-on', () => {
    // The identity screen reads people, and hangs every rung of each
    // person's chain off the person. Same leak, one level in.
    const src = `
      const people = await prisma.person.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, name: true,
          sellContracts: { where: endClientFilter(companyId), select: { company: { select: { name: true } } } },
        },
      })
    `
    expect(namesBelowTheRung(src)).toHaveLength(1)
  })
})

// ── The sweep ────────────────────────────────────────────────────────

describe('a client-facing list never names a firm below the rung the client pays', () => {
  const EVERY_FILE = walk(join(ROOT, 'src'))

  const SCOPED_TO_A_CLIENT = EVERY_FILE.filter((f) => {
    const src = readFileSync(join(ROOT, f), 'utf8')
    return reads(src).some((q) => everyRungAtAClient(withScope(src, q.text)))
  })

  const OFFENDERS = EVERY_FILE.filter(
    (f) => namesBelowTheRung(readFileSync(join(ROOT, f), 'utf8')).length > 0
  )

  it('finds the client-facing lists it is meant to check, so an empty run never passes for the wrong reason', () => {
    expect(SCOPED_TO_A_CLIENT.length).toBeGreaterThan(8)
    for (const f of [
      'src/app/api/compliance/route.ts',
      'src/app/api/tenure/route.ts',
      'src/app/api/alumni/route.ts',
    ]) {
      expect(SCOPED_TO_A_CLIENT, `${f} reads every rung at a client`).toContain(f)
    }
  })

  it('and every place that still does is named here, with whose file it is and what it gives away', () => {
    const unexplained = OFFENDERS.filter((f) => !(f in KNOWN_TO_NAME_BELOW_THE_RUNG))
    expect(
      unexplained,
      'a client-facing list printing the name of a firm below the rung the client pays. Route it ' +
        'through nameForClient or namesForClient in src/lib/chain-names.ts, reduce the rows with ' +
        'chainTop first, or name the file above with its owner and what it leaks:\n  ' +
        unexplained.join('\n  ')
    ).toEqual([])
  })

  it('and nothing stays on that list once somebody has routed it through the rule', () => {
    const fixed = Object.keys(KNOWN_TO_NAME_BELOW_THE_RUNG).filter((f) => !OFFENDERS.includes(f))
    expect(
      fixed,
      'these withhold the name now — take them off the list so it keeps meaning something:\n  ' +
        fixed.join('\n  ')
    ).toEqual([])
  })

  it('every file named on that list says which agent answers for it', () => {
    for (const [file, why] of Object.entries(KNOWN_TO_NAME_BELOW_THE_RUNG)) {
      expect(why, `${file} needs an owner`).toMatch(/etyme-[a-z]+ —/)
      expect(why.length, `${file} needs to say what it gives away`).toBeGreaterThan(80)
    }
  })
})
