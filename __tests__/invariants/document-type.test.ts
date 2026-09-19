import { describe, it, expect } from 'vitest'
import {
  BUILT_IN,
  PURPOSES,
  typesFor,
  typeByKey,
  mayDefine,
  validityOf,
  floorOf,
  currentEdition,
  editionToUse,
  editionFinding,
  backingFinding,
  builtInType,
} from '@/lib/document-type'

/**
 * What kind of thing a document is.
 *
 * The founder listed seven real documents and five properties that differ
 * between them. The mistake would be to model the seven. What is modeled
 * is the five properties, so the eighth document a client invents behaves
 * correctly on the day somebody types it in.
 *
 * Every sentence below is one of those five, or one of the wrong answers
 * this replaced.
 */

const on = new Date('2026-09-16T12:00:00Z')
const inDays = (n: number) => new Date(on.getTime() + n * 86_400_000)

const COI = {
  label: 'Certificate of general liability insurance',
  validityShape: 'START_AND_END' as const,
  validMonths: 12,
}
const DEGREE = { label: 'Degree certificate', validityShape: 'NONE' as const, validMonths: null }
const VISA = { label: 'Visa', validityShape: 'END_ONLY' as const, validMonths: null }

describe('a document is good for a window, and the window has a start', () => {
  it('insurance cover that begins next month does not cover somebody starting this week', () => {
    const v = validityOf({ validFrom: inDays(15), expiresAt: inDays(380) }, COI, on)
    expect(v.validity).toBe('NOT_YET_VALID')
    expect(v.inForce).toBe(false)
  })

  it('says when the cover starts and how long away that is, instead of a code', () => {
    const v = validityOf({ validFrom: inDays(15), expiresAt: inDays(380) }, COI, on)
    expect(v.says).toContain('October 1, 2026')
    expect(v.says).toContain('15 days')
    expect(v.says).toContain('does not cover today')
  })

  it('falls back to the day the paper was issued when nothing says the cover start', () => {
    // A broker prints in August for a policy that starts in September. Where
    // the two are the same, the issue date is the floor and always was.
    const v = validityOf({ issuedAt: inDays(20), expiresAt: inDays(380) }, COI, on)
    expect(v.validity).toBe('NOT_YET_VALID')
  })

  it('takes the cover start over the day it was printed, because they are different facts', () => {
    const v = validityOf({ issuedAt: inDays(-40), validFrom: inDays(20), expiresAt: inDays(380) }, COI, on)
    expect(v.validity).toBe('NOT_YET_VALID')
  })

  it('a degree certificate with no dates at all never expires and never has a start', () => {
    expect(floorOf({ issuedAt: new Date('2009-06-01') }, 'NONE')).toBeNull()
    const v = validityOf({ issuedAt: new Date('2009-06-01') }, DEGREE, on)
    expect(v.validity).toBe('PERMANENT')
    expect(v.inForce).toBe(true)
  })

  it('a visa that runs out on a date is judged on that date and on nothing else', () => {
    expect(validityOf({ issuedAt: inDays(-400), expiresAt: inDays(-1) }, VISA, on).validity).toBe('EXPIRED')
    expect(validityOf({ issuedAt: inDays(-400), expiresAt: inDays(400) }, VISA, on).validity).toBe('VALID')
  })

  it('a certificate that expires and carries no expiry date says so rather than passing', () => {
    const v = validityOf({ issuedAt: null, expiresAt: null }, COI, on)
    expect(v.validity).toBe('NO_EXPIRY_RECORDED')
    expect(v.says).toContain('until the day somebody audits it')
  })

  it('cover that started yesterday and runs for a year is simply valid', () => {
    const v = validityOf({ validFrom: inDays(-1), expiresAt: inDays(364) }, COI, on)
    expect(v.validity).toBe('VALID')
    expect(v.inForce).toBe(true)
  })
})

describe('the list of documents belongs to the company, not to us', () => {
  it('a firm that has added nothing still has an I-9, a W-9 and a certificate of insurance', () => {
    const keys = typesFor([]).map((t) => t.key)
    expect(keys).toContain('I9_EVERIFY')
    expect(keys).toContain('W9')
    expect(keys).toContain('INSURANCE_GL')
  })

  it('a client can add a document nobody here has ever heard of, and it behaves', () => {
    const own = [
      {
        key: 'SITE_INDUCTION',
        label: 'Site induction certificate',
        purpose: 'COMPLIANCE',
        validityShape: 'START_AND_END',
        validMonths: 24,
        backedByAnyOf: [],
      },
    ]
    const t = typeByKey('SITE_INDUCTION', own)!
    expect(t.label).toBe('Site induction certificate')
    const v = validityOf({ validFrom: inDays(5), expiresAt: inDays(700) }, t, on)
    expect(v.validity).toBe('NOT_YET_VALID')
  })

  it('a firm that renames one of ours keeps its behavior and only changes the words', () => {
    const own = [
      {
        key: 'INSURANCE_GL',
        label: 'Public liability certificate',
        purpose: 'COMPLIANCE',
        validityShape: 'START_AND_END',
        validMonths: 12,
      },
    ]
    const t = typeByKey('INSURANCE_GL', own)!
    expect(t.label).toBe('Public liability certificate')
    expect(t.blocks).toBe(true)
    expect(t.builtIn).toBe(true)
  })

  it('a firm that retires one of ours stops being asked for it', () => {
    const own = [
      {
        key: 'DRUG_SCREENING',
        label: 'Drug screening',
        purpose: 'COMPLIANCE',
        validityShape: 'END_ONLY',
        archivedAt: new Date('2026-01-01'),
      },
    ]
    expect(typesFor(own).map((t) => t.key)).not.toContain('DRUG_SCREENING')
  })

  it('every document we ship is for compliance, for an agreement, or is proof of something', () => {
    for (const t of BUILT_IN) expect(PURPOSES).toContain(t.purpose)
  })

  it('the documents the founder named are all there, each in the shape he described', () => {
    // The table in CLAUDE.md, read back as a test rather than as prose.
    expect(builtInType('MSA')!.signedBy).toBe('BOTH_PARTIES')
    expect(builtInType('VISA')!.validityShape).toBe('END_ONLY')
    expect(builtInType('I9_EVERIFY')!.signedBy).toBe('BOTH_PARTIES')
    expect(builtInType('DRIVERS_LICENSE')!.validityShape).toBe('END_ONLY')
    expect(builtInType('DEGREE')!.validityShape).toBe('NONE')
    expect(builtInType('INSURANCE_GL')!.validityShape).toBe('START_AND_END')
    expect(builtInType('GOOD_STANDING')!.validityShape).toBe('START_AND_END')
  })

  it('the supplier is who gets chased for insurance, and the candidate for a degree', () => {
    expect(builtInType('INSURANCE_GL')!.suppliedBy).toBe('SUPPLIER')
    expect(builtInType('DEGREE')!.suppliedBy).toBe('CANDIDATE')
  })
})

describe('adding a document type refuses in words, never in a code', () => {
  it('a document with no short code is refused with an example of one', () => {
    const v = mayDefine({ key: 'site induction', label: 'Site induction', purpose: 'COMPLIANCE', validityShape: 'NONE' }, [])
    expect(v.ok).toBe(false)
    expect(v.says).toContain('SITE_INDUCTION')
  })

  it('a second document with a code somebody already used is refused, and says which to edit', () => {
    const existing = [{ key: 'SITE_INDUCTION', label: 'x', purpose: 'COMPLIANCE', validityShape: 'NONE' }]
    const v = mayDefine({ key: 'SITE_INDUCTION', label: 'Site induction', purpose: 'COMPLIANCE', validityShape: 'NONE' }, existing)
    expect(v.ok).toBe(false)
    expect(v.says).toContain('Edit that one')
  })

  it('a document set to never expire cannot also be good for twelve months', () => {
    const v = mayDefine({ key: 'DEGREE_X', label: 'Degree', purpose: 'PROOF', validityShape: 'NONE', validMonths: 12 }, [])
    expect(v.ok).toBe(false)
    expect(v.says).toContain('never expire')
  })

  it('a document with a real code, a name and a purpose is accepted', () => {
    const v = mayDefine(
      { key: 'EXPORT_LICENSE', label: 'Export license', purpose: 'COMPLIANCE', validityShape: 'START_AND_END', validMonths: 36 },
      []
    )
    expect(v.ok).toBe(true)
  })
})

describe('a form has an edition, and an old edition is an audit finding', () => {
  const I9 = { label: 'I-9', reissued: true }
  const editions = [
    { edition: '07/17/2017', effectiveFrom: new Date('2017-09-18'), retiredAt: new Date('2023-11-01') },
    { edition: '08/01/2023', effectiveFrom: new Date('2023-08-01') },
  ]

  it('the edition in force today is the one somebody should be filling in', () => {
    expect(editionToUse(editions, on)).toBe('08/01/2023')
  })

  it('a form signed on the edition that was current that day is right forever', () => {
    const f = editionFinding(I9, '07/17/2017', new Date('2019-03-04'), editions)
    expect(f.standing).toBe('CURRENT')
  })

  it('the same form signed after the issuer replaced that edition is the finding', () => {
    const f = editionFinding(I9, '07/17/2017', new Date('2026-03-04'), editions)
    expect(f.standing).toBe('SUPERSEDED')
    expect(f.says).toContain('audit finding')
    expect(f.fix).toContain('08/01/2023')
  })

  it('a form on file that does not say which edition it is says so, and says why it matters', () => {
    const f = editionFinding(I9, null, new Date('2026-03-04'), editions)
    expect(f.standing).toBe('UNRECORDED')
    expect(f.says).toContain('which edition')
  })

  it('claims nothing about an edition where the company has never said which one is current', () => {
    const f = editionFinding(I9, '07/17/2017', new Date('2026-03-04'), [])
    expect(f.standing).toBe('UNKNOWN')
    expect(f.expected).toBeNull()
  })

  it('a document the issuer does not reissue has no edition to be wrong about', () => {
    const f = editionFinding({ label: 'Degree certificate', reissued: false }, null, null, [])
    expect(f.standing).toBe('NOT_APPLICABLE')
  })

  it('an edition the issuer has not brought in yet is not the one to use today', () => {
    const future = [{ edition: '01/01/2030', effectiveFrom: new Date('2030-01-01') }, ...editions]
    expect(currentEdition(future, on)!.edition).toBe('08/01/2023')
  })
})

describe('a form is not evidence on its own', () => {
  const I9 = {
    label: 'I-9',
    requiresBacking: true,
    backedByAnyOf: ['PASSPORT', 'GREEN_CARD', 'VISA'],
  }

  it('an I-9 with nothing behind it is a record that somebody looked, and no record of what they saw', () => {
    const f = backingFinding(I9, [])
    expect(f.standing).toBe('UNSUPPORTED')
    expect(f.says).toContain('nothing behind it')
    expect(f.fix).toContain('PASSPORT')
  })

  it('an I-9 completed from a passport is backed, and the sentence names the passport', () => {
    const f = backingFinding(I9, [{ key: 'PASSPORT', inForce: true, label: 'Passport' }])
    expect(f.standing).toBe('BACKED')
    expect(f.says).toContain('Passport')
  })

  it('an I-9 backed by a passport that has expired proves nothing, and says so', () => {
    const f = backingFinding(I9, [{ key: 'PASSPORT', inForce: false, label: 'Passport' }])
    expect(f.standing).toBe('BACKING_NOT_IN_FORCE')
    expect(f.says).toContain('proves nothing')
  })

  it('any one acceptable document is enough — the real List A and List B plus C rules are not claimed', () => {
    expect(backingFinding(I9, [{ key: 'GREEN_CARD', inForce: true }]).standing).toBe('BACKED')
    expect(backingFinding(I9, [{ key: 'VISA', inForce: true }]).standing).toBe('BACKED')
  })

  it('a degree certificate stands on its own and is never chased for evidence behind it', () => {
    const f = backingFinding({ label: 'Degree certificate', requiresBacking: false, backedByAnyOf: [] }, [])
    expect(f.standing).toBe('NOT_REQUIRED')
  })

  it('a document of the wrong kind does not count as backing the form', () => {
    const f = backingFinding(I9, [{ key: 'RESUME', inForce: true }])
    expect(f.standing).toBe('UNSUPPORTED')
  })
})

// ── The floor, read by the gates that actually stop a start ───────────

import { standingOf, supplierCoverGate } from '@/lib/document-stages'
import { resolveItems, packetByKey } from '@/lib/packets'
import { contractClearance } from '@/lib/contract-clearance'

describe('cover that has not started yet stops a start, the same as cover that ran out', () => {
  const started = (validFrom: Date, expiresAt: Date) => ({
    type: 'INSURANCE_GL',
    status: 'CLEAR',
    validFrom,
    expiresAt,
    verifiedAt: on,
  })
  const wc = { type: 'INSURANCE_WC', status: 'CLEAR', expiresAt: inDays(300), issuedAt: inDays(-60), verifiedAt: on }

  it('a certificate on file whose policy starts next month reads as not covering today', () => {
    const s = standingOf(
      { key: 'INSURANCE_GL', label: 'General liability', validFrom: inDays(15), expiresAt: inDays(380) },
      { key: 'INSURANCE_GL', label: 'General liability', validMonths: 12 },
      on
    )
    expect(s.standing).toBe('NOT_YET_VALID')
    expect(s.says).toContain('does not cover today')
  })

  it('a supplier whose only general liability certificate starts next month cannot place anybody', () => {
    const gate = supplierCoverGate({
      supplierName: 'Brightmoor',
      certificates: [started(inDays(15), inDays(380)), wc],
      on,
    })
    expect(gate.outcome).toBe('BLOCK')
  })

  it('a supplier who filed next year’s certificate early is not blocked for being organized', () => {
    // Two certificates: this year's, running three more weeks, and next
    // year's, starting when it ends. Reading the floor on the longest one
    // alone would have blocked a firm that did exactly the right thing.
    const gate = supplierCoverGate({
      supplierName: 'Brightmoor',
      certificates: [started(inDays(-340), inDays(21)), started(inDays(21), inDays(386)), wc],
      on,
    })
    expect(gate.outcome).not.toBe('BLOCK')
  })

  it('a packet does not report a document as already held when it does not start until next month', () => {
    const spec = packetByKey('VENDOR_ONBOARDING_US')!
    const [gl] = resolveItems(spec, [{ key: 'INSURANCE_GL', validFrom: inDays(15), expiresAt: inDays(380), accepted: true }], on)
      .filter((r) => r.key === 'INSURANCE_GL')
    expect(gl.state).toBe('NOT_YET_VALID')
    expect(gl.note).toContain('does not cover today')
  })

  it('a right-to-work document that comes into force after the first day does not authorize the start', () => {
    const v = contractClearance({
      personName: 'Priya Raman',
      personVerifications: [
        { type: 'I9_EVERIFY', status: 'CLEAR', validFrom: inDays(20), expiresAt: inDays(500) },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(300) },
      ],
      supplierName: 'CloudEPA',
      supplierCertificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: inDays(300), verifiedAt: on },
        { type: 'INSURANCE_WC', status: 'CLEAR', expiresAt: inDays(300), verifiedAt: on },
      ],
      on,
      extraHeld: [{ key: 'NDA', expiresAt: null, accepted: true }],
    })
    expect(v.outcome).toBe('BLOCK')
    expect(v.says).toContain('cannot start')
  })
})

describe('what the clearance says about a form with nothing behind it', () => {
  const base = {
    personName: 'Priya Raman',
    supplierName: 'CloudEPA',
    supplierCertificates: [
      { type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: inDays(300), verifiedAt: on },
      { type: 'INSURANCE_WC', status: 'CLEAR', expiresAt: inDays(300), verifiedAt: on },
    ],
    on,
    extraHeld: [{ key: 'NDA', expiresAt: null, accepted: true }],
  }

  it('an I-9 held with nothing behind it is reported on the checklist, with what to do about it', () => {
    const v = contractClearance({
      ...base,
      personVerifications: [
        { type: 'I9_EVERIFY', status: 'CLEAR' },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(300) },
      ],
    })
    expect(v.unsupported).toHaveLength(1)
    expect(v.unsupported[0].says).toContain('nothing behind it')
  })

  it('and does not warn on it, because every I-9 on file today is unsupported and a warning on all of them is noise', () => {
    const v = contractClearance({
      ...base,
      personVerifications: [
        { type: 'I9_EVERIFY', status: 'CLEAR' },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(300) },
      ],
    })
    expect(v.outcome).toBe('PASS')
  })

  it('an I-9 tied to a passport that has expired does warn, because somebody recorded proof and it ran out', () => {
    const v = contractClearance({
      ...base,
      personVerifications: [
        { type: 'I9_EVERIFY', status: 'CLEAR', backedBy: [{ key: 'PASSPORT', inForce: false }] },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(300) },
      ],
    })
    expect(v.outcome).toBe('WARN')
    expect(v.says).toContain('proves nothing')
  })

  it('an I-9 completed from a current passport says nothing at all, because there is nothing to say', () => {
    const v = contractClearance({
      ...base,
      personVerifications: [
        { type: 'I9_EVERIFY', status: 'CLEAR', backedBy: [{ key: 'PASSPORT', inForce: true }] },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(300) },
      ],
    })
    expect(v.unsupported).toEqual([])
    expect(v.outcome).toBe('PASS')
  })

  it('an I-9 signed on a superseded edition warns and names the edition that should have been used', () => {
    const v = contractClearance({
      ...base,
      personVerifications: [
        {
          type: 'I9_EVERIFY',
          status: 'CLEAR',
          formEdition: '07/17/2017',
          completedAt: new Date('2026-03-04'),
          backedBy: [{ key: 'PASSPORT', inForce: true }],
        },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(300) },
      ],
      editions: {
        I9_EVERIFY: [
          { edition: '07/17/2017', effectiveFrom: new Date('2017-09-18'), retiredAt: new Date('2023-11-01') },
          { edition: '08/01/2023', effectiveFrom: new Date('2023-08-01') },
        ],
      },
    })
    expect(v.outcome).toBe('WARN')
    expect(v.editions[0].expected).toBe('08/01/2023')
  })

  it('a company that has never said which edition is current has nothing claimed about its forms', () => {
    const v = contractClearance({
      ...base,
      personVerifications: [
        { type: 'I9_EVERIFY', status: 'CLEAR', formEdition: '07/17/2017', backedBy: [{ key: 'PASSPORT', inForce: true }] },
        { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(300) },
      ],
    })
    expect(v.editions).toEqual([])
    expect(v.outcome).toBe('PASS')
  })
})
