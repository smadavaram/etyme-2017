import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { supplierCoverGate } from '@/lib/document-stages'
import { contractClearance } from '@/lib/contract-clearance'
import { assemble, outboundPackByKey, type OwnDocument } from '@/lib/outbound-pack'

/**
 * The floor, everywhere it is read — and the places it is not.
 *
 * `Verification` has carried `issuedAt` and `expiresAt` since it was
 * written and only the ceiling was ever read, so a certificate of
 * insurance printed in August for cover beginning in September passed in
 * August as held. The arithmetic was fixed on 2026-09-16 and three
 * routes went on selecting the expiry and not the start, which is worse
 * than the original bug: the same certificate blocked at activation and
 * read as held at submission, and a system that contradicts itself about
 * the law is one nobody trusts on either answer.
 *
 * Nothing caught that, because every test held the arithmetic and none
 * held the queries feeding it. The last test in this file is the one
 * that would have.
 */

const TODAY = new Date('2026-09-17T00:00:00Z')
const inDays = (n: number) => new Date(TODAY.getTime() + n * 86_400_000)

// ── The supplier's cover ─────────────────────────────────────────────

describe('a certificate that has not started covers nobody', () => {

  it('a supplier whose only general liability cover begins next month cannot put anybody forward', () => {
    const gate = supplierCoverGate({
      supplierName: 'Brightmoor Talent',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: inDays(-2), validFrom: inDays(21), expiresAt: inDays(386), verifiedAt: inDays(-2) },
        { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: inDays(-200), validFrom: inDays(-200), expiresAt: inDays(160), verifiedAt: inDays(-200) },
      ],
      on: TODAY,
    })
    expect(gate.outcome).toBe('BLOCK')
  })

  it('and the refusal says the cover has not begun, not that somebody should renew it', () => {
    const gate = supplierCoverGate({
      supplierName: 'Brightmoor Talent',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: inDays(-2), validFrom: inDays(21), expiresAt: inDays(386), verifiedAt: inDays(-2) },
        { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: inDays(-200), validFrom: inDays(-200), expiresAt: inDays(160), verifiedAt: inDays(-200) },
      ],
      on: TODAY,
    })
    // A broker cannot issue a replacement for a policy that simply has
    // not started, and "back in date" describes a document this supplier
    // does not have.
    expect(gate.says).toContain('does not start until')
    expect(gate.says).toContain('until that cover begins')
    expect(gate.says).not.toContain('back in date')
    expect(gate.fix).toContain('nobody starts before the cover does')
  })

  it('a supplier that filed next year’s certificate early is not blocked for being organized', () => {
    const gate = supplierCoverGate({
      supplierName: 'Vertex Talent',
      certificates: [
        // This year's, running out in three weeks.
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: inDays(-340), validFrom: inDays(-340), expiresAt: inDays(21), verifiedAt: inDays(-340) },
        // Next year's, filed the moment the broker issued it.
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: inDays(-3), validFrom: inDays(21), expiresAt: inDays(386), verifiedAt: inDays(-3) },
        { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: inDays(-200), validFrom: inDays(-200), expiresAt: inDays(160), verifiedAt: inDays(-200) },
      ],
      on: TODAY,
    })
    expect(gate.outcome).not.toBe('BLOCK')
  })

  it('but a gap between cover that ran out and cover that starts later is a gap, and it blocks', () => {
    const gate = supplierCoverGate({
      supplierName: 'Vertex Talent',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: inDays(-400), validFrom: inDays(-400), expiresAt: inDays(-30), verifiedAt: inDays(-400) },
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: inDays(-3), validFrom: inDays(14), expiresAt: inDays(379), verifiedAt: inDays(-3) },
        { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: inDays(-200), validFrom: inDays(-200), expiresAt: inDays(160), verifiedAt: inDays(-200) },
      ],
      on: TODAY,
    })
    expect(gate.outcome).toBe('BLOCK')
    // The one that covers the nearest thing to today is the one to talk
    // about, and neither of these does.
    expect(gate.says).toContain('Vertex Talent')
  })

  it('cover that has not begun stops a start the same way lapsed cover does', () => {
    const verdict = contractClearance({
      personName: 'Priya Raman',
      personVerifications: [
        { type: 'I9_EVERIFY', status: 'CLEAR' },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(200) },
      ],
      supplierName: 'Brightmoor Talent',
      supplierCertificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: inDays(-2), validFrom: inDays(21), expiresAt: inDays(386), verifiedAt: inDays(-2) },
        { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: inDays(-200), validFrom: inDays(-200), expiresAt: inDays(160), verifiedAt: inDays(-200) },
      ],
      on: TODAY,
      extraHeld: [{ key: 'NDA', expiresAt: null, accepted: true }],
    })
    expect(verdict.outcome).toBe('BLOCK')
    expect(verdict.says).not.toContain('cleared to start')
  })
})

// ── What we send out about ourselves ─────────────────────────────────

describe('a certificate that has not started is never sent to a client as current', () => {
  const INSURANCE = outboundPackByKey('INSURANCE_PROOF')!

  function held(over: Partial<OwnDocument> & { key: string }): OwnDocument {
    return { label: over.key, expiresAt: null, verifiedAt: inDays(-30), ...over }
  }

  it('a policy beginning in three weeks is refused, because sending it claims cover today', () => {
    const pack = assemble(
      INSURANCE,
      INSURANCE.items.map((i) =>
        held({ key: i.key, label: i.label, validFrom: inDays(21), issuedAt: inDays(-2), expiresAt: inDays(386) })
      ),
      TODAY
    )
    const refused = pack.items.filter((i) => i.disposition === 'REFUSED')
    expect(refused.length).toBeGreaterThan(0)
    expect(refused[0].says).toContain('does not start until')
    expect(refused[0].says).toContain('would rely on it')
  })

  it('and a firm holding both this year’s certificate and next year’s sends the one covering today', () => {
    const items = INSURANCE.items.flatMap((i) => [
      held({ key: i.key, label: i.label, validFrom: inDays(-340), issuedAt: inDays(-340), expiresAt: inDays(60) }),
      held({ key: i.key, label: i.label, validFrom: inDays(60), issuedAt: inDays(-2), expiresAt: inDays(425) }),
    ])
    const pack = assemble(INSURANCE, items, TODAY)
    expect(pack.items.every((i) => i.disposition !== 'REFUSED')).toBe(true)
    // The one that covers today, not the one that runs longest.
    expect(pack.items.every((i) => i.expiresAt?.getTime() === inDays(60).getTime())).toBe(true)
  })
})

// ── A form, and the things behind it ─────────────────────────────────

describe('what is reported and what actually warns', () => {

  const CLEAN = {
    personName: 'Priya Raman',
    supplierName: 'Brightmoor Talent',
    supplierCertificates: [
      { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: inDays(-100), validFrom: inDays(-100), expiresAt: inDays(260), verifiedAt: inDays(-100) },
      { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: inDays(-100), validFrom: inDays(-100), expiresAt: inDays(260), verifiedAt: inDays(-100) },
    ],
    on: TODAY,
    extraHeld: [{ key: 'NDA', expiresAt: null, accepted: true }],
  }

  it('an I-9 with nothing behind it is said out loud even on a person who is cleared to start', () => {
    const verdict = contractClearance({
      ...CLEAN,
      personVerifications: [
        { type: 'I9_EVERIFY', status: 'CLEAR', completedAt: inDays(-10), backedBy: [] },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(200) },
      ],
    })
    // Cleared, and not silent about it. A finding that lives only in an
    // array nobody renders is a column with nothing reading it.
    expect(verdict.outcome).toBe('PASS')
    expect(verdict.says).toContain('cleared to start')
    expect(verdict.says).toContain('nothing behind it')
    // The remedy travels with the sentence. It is not promoted to the
    // clearance's own fix, because there is nothing to fix before
    // activating and a green verdict with an instruction beside it reads
    // as a condition of starting.
    expect(verdict.says).toContain('Record the document it was completed from')
    expect(verdict.fix).toBeNull()
  })

  it('and it does not warn, because every I-9 on file today has nothing recorded behind it', () => {
    const verdict = contractClearance({
      ...CLEAN,
      personVerifications: [
        { type: 'I9_EVERIFY', status: 'CLEAR', completedAt: inDays(-10), backedBy: [] },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(200) },
      ],
    })
    expect(verdict.outcome).not.toBe('WARN')
    expect(verdict.outcome).not.toBe('BLOCK')
  })

  it('an I-9 completed from a passport that has since expired does warn, because somebody recorded proof and it ran out', () => {
    const verdict = contractClearance({
      ...CLEAN,
      personVerifications: [
        {
          type: 'I9_EVERIFY', status: 'CLEAR', completedAt: inDays(-400),
          backedBy: [{ key: 'PASSPORT', inForce: false }],
        },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(200) },
      ],
    })
    expect(verdict.outcome).toBe('WARN')
    expect(verdict.says).toContain('proves nothing')
  })

  it('a form whose edition nobody wrote down is reported and does not warn, the same as a form with nothing behind it', () => {
    const verdict = contractClearance({
      ...CLEAN,
      personVerifications: [
        {
          type: 'I9_EVERIFY', status: 'CLEAR', completedAt: inDays(-30),
          formEdition: null,
          backedBy: [{ key: 'PASSPORT', inForce: true }],
        },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(200) },
      ],
      editions: { I9_EVERIFY: [{ edition: '08/01/2023', effectiveFrom: inDays(-800) }] },
    })
    // An unanswered question is not a defect. On the day a company first
    // records its editions, every form filed before then is unanswered,
    // and a warning on all of them is a click rather than a warning.
    expect(verdict.outcome).toBe('PASS')
    expect(verdict.says).toContain('does not say which edition')
    expect(verdict.says).toContain('record the edition printed on it')
    expect(verdict.fix).toBeNull()
  })

  it('but a form completed on an edition the issuer had already replaced does warn, and names both editions', () => {
    const verdict = contractClearance({
      ...CLEAN,
      personVerifications: [
        {
          type: 'I9_EVERIFY', status: 'CLEAR', completedAt: inDays(-30),
          formEdition: '10/21/2019',
          backedBy: [{ key: 'PASSPORT', inForce: true }],
        },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(200) },
      ],
      editions: {
        I9_EVERIFY: [
          { edition: '10/21/2019', effectiveFrom: inDays(-2400) },
          { edition: '08/01/2023', effectiveFrom: inDays(-800) },
        ],
      },
    })
    expect(verdict.outcome).toBe('WARN')
    expect(verdict.says).toContain('10/21/2019')
    expect(verdict.says).toContain('08/01/2023')
  })

  it('a 2019 I-9 signed while the 2019 edition was the current one is right forever, and says nothing at all', () => {
    const verdict = contractClearance({
      ...CLEAN,
      personVerifications: [
        {
          type: 'I9_EVERIFY', status: 'CLEAR', completedAt: inDays(-1200),
          formEdition: '10/21/2019',
          backedBy: [{ key: 'PASSPORT', inForce: true }],
        },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(200) },
      ],
      editions: {
        I9_EVERIFY: [
          { edition: '10/21/2019', effectiveFrom: inDays(-2400) },
          { edition: '08/01/2023', effectiveFrom: inDays(-800) },
        ],
      },
    })
    expect(verdict.outcome).toBe('PASS')
    expect(verdict.says).toBe('Priya Raman is cleared to start. Everything required is on file.')
  })
})

// ── The test that would have caught the half-landed fix ──────────────

/**
 * A rule about queries, not about arithmetic.
 *
 * Every branch of the floor was already tested and every one passed
 * while three live screens gave the opposite answer, because the column
 * was never selected. So this reads the source: a file that hands
 * verification rows to the compliance arithmetic has to ask those rows
 * when they start, not only when they stop.
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

/** Everything from `prisma.verification.find…(` to its closing brace. */
function verificationQueries(src: string): string[] {
  const out: string[] = []
  const marker = /prisma\.verification\.find\w*\(/g
  let m: RegExpExecArray | null
  while ((m = marker.exec(src))) {
    let depth = 0
    let i = m.index + m[0].length - 1
    const from = i
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    out.push(src.slice(from, i + 1))
  }
  return out
}

/**
 * Files that read verification rows for the compliance arithmetic and
 * still do not read the floor, with whose file each is.
 *
 * Every one of them makes a document that has not begun read as held.
 * They are listed rather than fixed because a file belongs to exactly one
 * agent and these belong to somebody else — and listed rather than
 * ignored, because a gap nobody wrote down is the one that survives. A
 * new one fails this test on the commit that adds it.
 */
const KNOWN_TO_DROP_THE_FLOOR: Record<string, string> = {
}

describe('a query that feeds the compliance arithmetic asks when a document starts', () => {

  const READS_THE_ARITHMETIC = walk(join(ROOT, 'src')).filter((f) => {
    const src = readFileSync(join(ROOT, f), 'utf8')
    if (!/prisma\.verification\.find/.test(src)) return false
    return /from '@\/lib\/(document-stages|packets|contract-clearance|outbound-pack)'/.test(src)
  })

  /**
   * A select written once and used twice is still a select. `program`
   * keeps its verification shape in a constant, and a sweep that only
   * read the query would have called it clean.
   */
  function withSharedShapes(src: string, query: string): string {
    const named = query.match(/select:\s*([A-Za-z_$][\w$]*)/)
    if (!named) return query
    const decl = src.match(new RegExp(`(const|let)\\s+${named[1]}\\s*=\\s*\\{[^}]*\\}`))
    return decl ? query + decl[0] : query
  }

  const OFFENDERS = READS_THE_ARITHMETIC.filter((f) => {
    const src = readFileSync(join(ROOT, f), 'utf8')
    return verificationQueries(src)
      .map((q) => withSharedShapes(src, q))
      .some((q) => /expiresAt:\s*true/.test(q) && !/validFrom:\s*true/.test(q))
  })

  it('finds the queries to check, so an empty sweep never passes by accident', () => {
    expect(READS_THE_ARITHMETIC.length).toBeGreaterThan(4)
  })

  it('the compliance page, the packets it sends and the submissions it gates all read the start date', () => {
    for (const f of [
      'src/app/api/compliance/route.ts',
      'src/app/api/packets/route.ts',
      'src/app/api/submissions/route.ts',
      'src/app/api/outbound-pack/own-documents.ts',
    ]) {
      expect(READS_THE_ARITHMETIC, `${f} should be reading the compliance arithmetic`).toContain(f)
      expect(OFFENDERS, `${f} asks a document when it expires and not when it starts`).not.toContain(f)
    }
  })

  it('and every place that still does not is named here, with whose file it is', () => {
    const unexplained = OFFENDERS.filter((f) => !(f in KNOWN_TO_DROP_THE_FLOOR))
    expect(
      unexplained,
      'a query reading a document\u2019s expiry and not its start. Add validFrom to the select, ' +
        'or name the file above with the reason it cannot be fixed here:\n  ' + unexplained.join('\n  ')
    ).toEqual([])
  })

  it('and nothing stays on that list once somebody has fixed it', () => {
    const fixed = Object.keys(KNOWN_TO_DROP_THE_FLOOR).filter((f) => !OFFENDERS.includes(f))
    expect(
      fixed,
      'these read the start date now \u2014 take them off the list so it keeps meaning something:\n  ' +
        fixed.join('\n  ')
    ).toEqual([])
  })
})
