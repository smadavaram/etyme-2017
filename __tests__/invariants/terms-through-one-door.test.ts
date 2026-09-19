import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { domainOf } from '@/lib/domains'

/**
 * One door to a placement's billing rhythm, and a sweep that finds the
 * next reader to walk round it.
 *
 * ── What went wrong ──────────────────────────────────────────────────
 *
 * A purchase order is a header and its lines. Six fields were carried on
 * both rows — `billFrequency`, `billAnchor`, `billStraddle`,
 * `paymentTerms`, `startDate`, `endDate`, with the pay-side mirror on
 * `BuyContract` — and nothing reconciled the two copies. Those six
 * decide when hours fall due, when a bill is raised, when it is due and
 * when somebody is paid.
 *
 * `lib/money/order-terms` is now the only file that decides between
 * them: the rhythm and the net days are the document's, the dates are
 * the line's.
 *
 * ── Why the sweep is the valuable half ───────────────────────────────
 *
 * Fixing the six readers leaves the seventh free to write
 * `frequency: contract.billFrequency` again, and a placement billed
 * monthly where its client's own paper says weekly is a plausible,
 * silent, wrong date — nobody audits a date that looks like a date. So
 * the rule is enforced over the tree rather than over a list somebody
 * keeps up to date.
 *
 * The sweep does not forbid reading the columns. Two honest reasons to
 * read one remain: handing it to the helper, and comparing a line
 * against what the helper says it should be, which is how the order
 * route counts the placements it has corrected. What is forbidden is
 * **deciding** with one — casting a line's own copy into the period
 * engine's `Terms`, which is the exact shape every one of these bugs had.
 */

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

/** The one file that decides which copy answers. */
const THE_DOOR = 'src/lib/money/order-terms.ts'

/** The six, as they are spelled on a row. */
const LINE_COLUMNS = [
  'billFrequency', 'billAnchor', 'billStraddle',
  'payFrequency', 'payAnchor', 'payStraddle',
]

/**
 * Who else may put one of the four on a row, and why.
 *
 * Reading a column is not the offense; deciding a billing period from a
 * **line's** copy is. Two kinds of read stay legitimate outside this
 * helper, and both are writes rather than decisions:
 *
 *   · **The write side of an award.** `app/api/submissions/**` and
 *     `lib/award` create the header and its first line together and copy
 *     the header's four onto the line, so a line agrees with its
 *     document from the first second. That is demand's half of the same
 *     change and it reads the *header*, which is the copy that wins.
 *
 * The replacement route was on this list and came off on 2026-09-19:
 * the architect routed it through `nextLineOnSameDocument`, which asks
 * `termsFor` for the header's answer and falls back to the line's own
 * copy only where the seat was never on an order at all. It still names
 * the four columns — it has to, to hand the door what the line says —
 * and that is not a copy onto a row, so the sweep learned the
 * difference rather than keeping a file-shaped hole. Handing the door
 * the line's copy is allowed anywhere; copying it onto another row is
 * allowed only here.
 *
 * The list is a ceiling, never a floor: a file leaving it is the fix
 * landing and the test does not care. A file joining it means another
 * domain has started copying terms nobody reconciled, and that is a
 * conversation with the money desk.
 */
const MAY_COPY_THE_COLUMNS = [
  /^src\/app\/api\/submissions\//,
  /^src\/lib\/award\.ts$/,
]

/** Copying one of the four from one row onto another. */
const COPIES_A_COLUMN =
  /\b(bill|pay)(Frequency|Anchor|Straddle)\s*:\s*[^,\n;}]*\.(bill|pay)(Frequency|Anchor|Straddle)\b/

/**
 * The one door — called with what the line says, and answering.
 *
 *   const line = nextLineOnSameDocument({ old: { billFrequency: old.billFrequency, … } })
 *   …
 *   billFrequency: line.billFrequency,
 *
 * Neither of those is a second opinion about a period. The first is the
 * door being TOLD what the line's own copy is, so it can use it where
 * there is no header to beat it; the second is the door's own ANSWER
 * being written onto the new row. What is still forbidden is what it
 * always was: taking one row's copy and putting it on another without
 * asking which copy wins.
 */
const DOORS = ['nextLineOnSameDocument(', 'termsFor(', 'periodTermsFor(']

/** What the door's answer was called in this file: `const line = …`. */
function doorOutputs(src: string): string[] {
  const names = new Set<string>()
  for (const door of DOORS) {
    const fn = door.slice(0, -1)
    const re = new RegExp(`\\b(?:const|let|var)\\s+(\\w+)\\s*=\\s*(?:await\\s+)?${fn}\\s*\\(`, 'g')
    for (const m of src.matchAll(re)) names.add(m[1])
  }
  return [...names]
}

/** Which object a copied value came from: `old` in `old.billFrequency`. */
const COPIES_FROM =
  /\b(?:bill|pay)(?:Frequency|Anchor|Straddle)\s*:\s*([A-Za-z_$][\w$]*)[^,\n;}]*\.(?:bill|pay)(?:Frequency|Anchor|Straddle)\b/g

/** Every copy in this source that did not come out of the door. */
function copiesFrom(src: string): string[] {
  const fromTheDoor = new Set(doorOutputs(src))
  return [...outsideTheDoor(src).matchAll(COPIES_FROM)]
    .filter((m) => !fromTheDoor.has(m[1]))
    .map((m) => m[0])
}

/** The source with every argument list of a door call removed. */
function outsideTheDoor(src: string): string {
  let out = src
  for (const door of DOORS) {
    for (;;) {
      const at = out.indexOf(door)
      if (at === -1) break
      // Walk the brackets, so a nested object inside the call goes too.
      let depth = 0
      let i = at + door.length - 1
      for (; i < out.length; i++) {
        if (out[i] === '(') depth += 1
        else if (out[i] === ')') {
          depth -= 1
          if (depth === 0) break
        }
      }
      out = out.slice(0, at) + out.slice(i + 1)
    }
  }
  return out
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const FILES = sourceFiles(SRC).map((f) => relative(ROOT, f).replace(/\\/g, '/'))

const text = (file: string) => readFileSync(join(ROOT, file), 'utf8')

/** Files that mention a line's own copy of one of the six at all. */
function filesTouchingTheColumns(): string[] {
  return FILES.filter((f) => {
    const s = text(f)
    return LINE_COLUMNS.some((c) => s.includes(c))
  })
}

/**
 * A decision made on a line's own copy: its value cast straight into
 * what the period engine reads.
 *
 *   frequency: contract.billFrequency
 *   anchor: bc.payAnchor as Terms['anchor']
 *   straddle: ts.sellContract.billStraddle,
 *
 * The helper's own output does not match, because it is named
 * `frequency`, `anchor` and `straddle` on both sides.
 */
const DECIDES_ON_A_LINE =
  /\b(frequency|anchor|straddle)\s*:\s*[^,\n;}]*\.(bill|pay)(Frequency|Anchor|Straddle)\b/g

function decisionsIn(file: string): string[] {
  return [...text(file).matchAll(DECIDES_ON_A_LINE)].map((m) => m[0])
}

describe('a placement is billed on the rhythm of the document it is on', () => {

  it('no reader in the money domain reaches past the helper to a line’s own copy of a header field', () => {
    const offenders: string[] = []
    for (const file of filesTouchingTheColumns()) {
      if (file === THE_DOOR) continue
      for (const bad of decisionsIn(file)) offenders.push(`${file}: ${bad}`)
    }
    expect(
      offenders,
      'These read a placement’s own copy of a field that belongs to the purchase order it sits on. ' +
        "Call termsFor('SELL', line) or periodTermsFor('SELL', line) from @/lib/money/order-terms instead."
    ).toEqual([])
  })

  it('a file in the money domain that loads a line’s rhythm also loads the document behind it', () => {
    // Selecting `billFrequency: true` and not `workOrder` is how a caller
    // gets the line's answer while believing it got the document's.
    const missing = filesTouchingTheColumns()
      .filter((f) => f !== THE_DOOR)
      .filter((f) => domainOf(f)?.key === 'MONEY')
      .filter((f) => /\b(billFrequency|payFrequency|billStraddle|payStraddle):\s*true/.test(text(f)))
      .filter((f) => !text(f).includes('workOrder'))
    expect(
      missing,
      'These select a line’s billing rhythm without selecting the order it is on, so they can only ever ' +
        'get the line’s copy. Add `workOrder: { select: ORDER_HEADER_SELECT }`.'
    ).toEqual([])
  })

  it('every money file that touches one of the six goes through the helper or is only writing it', () => {
    const strangers = filesTouchingTheColumns()
      .filter((f) => f !== THE_DOOR)
      .filter((f) => domainOf(f)?.key === 'MONEY')
      .filter((f) => !text(f).includes("@/lib/money/order-terms"))
    expect(
      strangers,
      'A money-domain file that mentions one of the six and never imports the helper is reading a copy ' +
        'nobody reconciled.'
    ).toEqual([])
  })

  it('nobody outside the money domain decides a billing period from a line’s own copy either', () => {
    // The strong rule, everywhere. A due date is money whichever desk
    // computes it.
    const offenders = filesTouchingTheColumns()
      .filter((f) => f !== THE_DOOR)
      .filter((f) => domainOf(f)?.key !== 'MONEY')
      .flatMap((f) => decisionsIn(f).map((bad) => `${f}: ${bad}`))
    expect(
      offenders,
      'A desk outside money is deciding a billing period from a placement’s own copy of a purchase ' +
        "order field. Call termsFor from @/lib/money/order-terms."
    ).toEqual([])
  })

  it('the desks that copy one of the four onto a row are named, and each has a reason', () => {
    const copying = filesTouchingTheColumns()
      .filter((f) => f !== THE_DOOR)
      .filter((f) => domainOf(f)?.key !== 'MONEY')
      .filter((f) => copiesFrom(text(f)).length > 0)
    const unexpected = copying.filter((f) => !MAY_COPY_THE_COLUMNS.some((r) => r.test(f)))
    expect(
      unexpected,
      'Another domain has started copying a placement’s billing terms from one row onto another. ' +
        'Two copies of one fact is one wrong date waiting — talk to the money desk first.'
    ).toEqual([])
  })

  it('the sweep reads the tree rather than a list somebody kept up to date', () => {
    // It found the helper and a dozen readers on the day it was written.
    // If this reaches zero the sweep has stopped looking at anything.
    expect(filesTouchingTheColumns().length).toBeGreaterThan(3)
    expect(filesTouchingTheColumns()).toContain(THE_DOOR)
  })

  it('a route that read a contract’s own billing frequency would be caught by this sweep', () => {
    // The sweep tested on itself: the exact lines the invoice route and
    // the payroll route used to carry, and the lines that replaced them.
    const asItWas =
      "const terms: Terms = {\n" +
      "  frequency: anchorContract.billFrequency as Terms['frequency'],\n" +
      "  anchor: anchorContract.billAnchor as Terms['anchor'],\n" +
      "  straddle: anchorContract.billStraddle as Terms['straddle'],\n" +
      '}'
    expect([...asItWas.matchAll(DECIDES_ON_A_LINE)]).toHaveLength(3)

    const payrollAsItWas = "frequency: bc.payFrequency as Terms['frequency'],"
    expect([...payrollAsItWas.matchAll(DECIDES_ON_A_LINE)]).toHaveLength(1)

    const asItIs = "const terms: Terms = periodTermsFor('SELL', anchorContract)"
    expect([...asItIs.matchAll(DECIDES_ON_A_LINE)]).toHaveLength(0)

    // Handing the column to the helper is not deciding with it, and the
    // order route comparing a line against the helper's answer is the
    // whole point of the correction it logs.
    const handingItOver =
      "periodTermsFor('SELL', { startDate: ts.periodStart, billStraddle: ts.sellContract.billStraddle })"
    expect([...handingItOver.matchAll(DECIDES_ON_A_LINE)]).toHaveLength(0)

    const comparing = 'c.billFrequency !== onThisOrder.frequency'
    expect([...comparing.matchAll(DECIDES_ON_A_LINE)]).toHaveLength(0)
  })

  it('and a row copied straight off another row is still caught, in the same file that calls the door', () => {
    // The sweep tested on itself again, because the exemption added on
    // 2026-09-19 is the kind that quietly swallows the rule it is an
    // exception to. A file that calls the door does not thereby get to
    // copy a stale line onto a new one somewhere else in itself.
    const fromTheDoor =
      'const line = nextLineOnSameDocument({ old: { billFrequency: old.billFrequency } })\n' +
      'await tx.sellContract.create({ data: { billFrequency: line.billFrequency } })'
    expect(copiesFrom(fromTheDoor)).toEqual([])

    const stale =
      'const line = nextLineOnSameDocument({ old: {} })\n' +
      'await tx.sellContract.create({ data: { billFrequency: old.billFrequency } })'
    expect(copiesFrom(stale)).toHaveLength(1)

    // And with no door in the file at all, nothing is exempt.
    expect(copiesFrom('data: { payFrequency: bc.payFrequency }')).toHaveLength(1)
  })
})
