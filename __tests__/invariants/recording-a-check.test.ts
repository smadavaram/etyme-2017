import { describe, it, expect } from 'vitest'
import { checkToRecord, mayRecordCheck, type CheckToRecord } from '@/lib/attestation'
import { heldFromDocInstances } from '@/lib/document-request'
import { contractClearance } from '@/lib/contract-clearance'

/**
 * Putting a check on file — the door the simulation of 2026-10-20 found
 * missing between a worker sending her papers and a placement starting.
 *
 * Two shapes. A document somebody else issued is examined here and the
 * examination is recorded. A verdict a third party rendered is recorded
 * in their words, with their name, their reference and their date. Never
 * a judgment about a person.
 */

const ON = new Date('2026-10-20T12:00:00Z')
const days = (n: number) => new Date(ON.getTime() + n * 86_400_000)

const base = (over: Partial<CheckToRecord>): CheckToRecord => ({
  about: 'PERSON',
  type: 'I9_EVERIFY',
  subjectName: 'Ingrid Sørensen',
  recordedBy: 'Selma Achterberg',
  ...over,
})

const may = (over: Partial<Parameters<typeof mayRecordCheck>[0]>) =>
  mayRecordCheck({
    about: 'PERSON', side: 'EMPLOYER', type: 'I9_EVERIFY',
    holds: (p) => p === 'consultants.write',
    callerFirm: 'Pinnacle Staffing', subjectName: 'Ingrid Sørensen',
    employerName: 'Pinnacle Staffing', buyerName: 'Northbend Athletic',
    ...over,
  })

describe('who may put a check on file', () => {
  it('the firm that employs the person records the I-9, from the seat that keeps its people', () => {
    expect(may({}).ok).toBe(true)
  })

  it('the client cannot complete the employer’s I-9, and the refusal names the firm that does', () => {
    const v = may({ side: 'BUYER', callerFirm: 'Northbend Athletic' })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('NOT_YOURS_TO_RECORD')
      expect(v.message).toMatch(/recorded by Pinnacle Staffing, the firm that employs or places them/)
    }
  })

  it('a firm that is not a party to the placement records nothing about it', () => {
    const v = may({ side: null, callerFirm: 'Halcyon Talent' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toMatch(/Halcyon Talent is not a party to this placement/)
  })

  it('the AP clerk cannot record a check, because paying for the work is not clearing anybody to do it', () => {
    const v = may({ holds: (p) => p === 'payments.record' })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('FORBIDDEN')
      expect(v.message).toMatch(/HR’s or the compliance officer’s work/)
      expect(v.message).not.toMatch(/\bdesk\b/i)
    }
  })

  it('the compliance officer may record a check on a person', () => {
    expect(may({ holds: (p) => p === 'privacy.manage' }).ok).toBe(true)
  })

  it('a supplier does not check its own certificate; the firm that buys from it records what it received', () => {
    const own = may({ about: 'FIRM', type: 'GOOD_STANDING', side: 'EMPLOYER', holds: () => true })
    expect(own.ok).toBe(false)
    if (!own.ok) expect(own.message).toMatch(/A firm does not check its own certificate of good standing/)
    expect(may({ about: 'FIRM', type: 'GOOD_STANDING', side: 'BUYER', holds: (p) => p === 'privacy.manage' }).ok).toBe(true)
  })
})

describe('an I-9 is the employer’s examination, recorded with what stood behind it', () => {
  const passport = { type: 'PASSPORT', expiresAt: days(1500) }

  it('an I-9 with no edition is refused, because an old edition is an audit finding', () => {
    const v = checkToRecord(base({ evidence: [passport] }), ON)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('NO_EDITION')
  })

  it('an I-9 with nothing behind it is refused, because on its own it proves nothing', () => {
    const v = checkToRecord(base({ formEdition: '01/20/25' }), ON)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toMatch(/Say which document Ingrid Sørensen showed/)
  })

  it('an expired passport cannot stand behind an I-9', () => {
    const v = checkToRecord(base({ formEdition: '01/20/25', evidence: [{ type: 'PASSPORT', expiresAt: days(-3) }] }), ON)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('EXPIRED_EVIDENCE')
  })

  it('a degree is not a document an I-9 can be completed from', () => {
    const v = checkToRecord(base({ formEdition: '01/20/25', evidence: [{ type: 'DEGREE', expiresAt: days(100) }] }), ON)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('NOT_ON_THE_LIST')
  })

  it('an I-9 completed from a passport is on file with no reverification date, and says who examined what', () => {
    const v = checkToRecord(base({ formEdition: '01/20/25', evidence: [passport] }), ON)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.row.status).toBe('CLEAR')
      expect(v.row.formEdition).toBe('01/20/25')
      expect(v.row.expiresAt).toBeNull()
      expect(v.row.evidence).toHaveLength(1)
      expect(v.says).toMatch(/Selma Achterberg examined Ingrid Sørensen’s passport and completed the I-9 on the 01\/20\/25 edition/)
    }
  })

  it('an I-9 completed from a visa must be completed again before the visa runs out', () => {
    const v = checkToRecord(base({ formEdition: '01/20/25', evidence: [{ type: 'VISA', expiresAt: days(200) }] }), ON)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.row.expiresAt?.getTime()).toBe(days(200).getTime())
      expect(v.says).toMatch(/completed again before/)
    }
  })
})

describe('a third party’s verdict is recorded in their words, never ours', () => {
  const report = {
    type: 'BACKGROUND_CHECK', provider: 'Sterling', reference: 'STR-4471', renderedOn: days(-2),
    outcome: 'CLEAR', providerSays: 'No records found. County criminal search complete.', consentOn: days(-9),
  }

  it('a background check with no screening company named is refused as a box somebody ticked', () => {
    const v = checkToRecord(base({ ...report, provider: null }), ON)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('NO_PROVIDER')
  })

  it('a verdict with no reference, no date or no words of the provider’s own is refused', () => {
    for (const [over, code] of [
      [{ reference: '' }, 'NO_REFERENCE'],
      [{ renderedOn: null }, 'NO_DATE'],
      [{ providerSays: '' }, 'NOT_VERBATIM'],
      [{ renderedOn: days(3) }, 'FUTURE_DATE'],
      [{ outcome: 'FIT' }, 'NO_OUTCOME'],
    ] as const) {
      const v = checkToRecord(base({ ...report, ...over }), ON)
      expect(v.ok, code).toBe(false)
      if (!v.ok) expect(v.code).toBe(code)
    }
  })

  it('a clear report is recorded as the provider said it, with their name, reference and date, good for a year', () => {
    const v = checkToRecord(base(report), ON)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.row.provider).toBe('Sterling')
      expect(v.row.referenceId).toBe('STR-4471')
      expect(v.row.result).toMatchObject({ outcome: 'CLEAR', providerSays: 'No records found. County criminal search complete.' })
      expect(v.row.ordered).toBe(true)
      expect(v.row.expiresAt?.toISOString().slice(0, 10)).toBe('2027-10-18')
      expect(v.says).toMatch(/^Sterling reported clear on .*reference STR-4471\./)
      expect(v.says).not.toMatch(/fit|cleared to place|verified by Etyme/i)
    }
  })

  it('an unfavorable report says the firm’s notice steps come before any decision', () => {
    const v = checkToRecord(base({ ...report, outcome: 'FAILED' }), ON)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.says).toMatch(/sends Ingrid Sørensen a notice with a copy of the report, waits, and only then decides/)
  })

  it('a verdict recorded with no signed authorization named says so on the record', () => {
    const v = checkToRecord(base({ ...report, consentOn: null }), ON)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.says).toMatch(/No signed authorization from Ingrid Sørensen is named/)
      expect(v.row.result).toMatchObject({ consentOn: null })
    }
  })
})

describe('a document of a kind that runs out never goes on file without its date', () => {
  it('a license with no expiry is refused', () => {
    const v = checkToRecord(base({ type: 'PROFESSIONAL_LICENSE', issuer: 'Oregon State Board of Nursing', licenseNumber: 'RN-154882' }), ON)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('NO_EXPIRY')
  })

  it('a license with no number is refused, because a number on a register is what can be checked', () => {
    const v = checkToRecord(base({ type: 'PROFESSIONAL_LICENSE', issuer: 'Oregon State Board of Nursing', expiresAt: days(400) }), ON)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('NO_NUMBER')
  })

  it('a license with its window is recorded with its number and state where the start gate reads them', () => {
    const v = checkToRecord(
      base({ type: 'PROFESSIONAL_LICENSE', issuer: 'Oregon State Board of Nursing', licenseNumber: 'RN-154882', licenseState: 'OR', validFrom: days(-300), expiresAt: days(400) }),
      ON
    )
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.row.result).toEqual({ license: 'RN-154882', state: 'OR' })
  })

  it('a supplier’s certificate with no start date is refused, because cover that starts later covers nobody today', () => {
    const v = checkToRecord(base({ about: 'FIRM', type: 'GOOD_STANDING', subjectName: 'Pinnacle Staffing', issuer: 'Oregon Secretary of State' }), ON)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('NO_START')
  })

  it('a lapsed certificate of good standing goes on file as it is, and says nobody starts through the firm', () => {
    const v = checkToRecord(
      base({ about: 'FIRM', type: 'GOOD_STANDING', subjectName: 'Pinnacle Staffing', issuer: 'Oregon Secretary of State', validFrom: days(-400), expiresAt: days(-35) }),
      ON
    )
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.says).toMatch(/nobody starts through Pinnacle Staffing until a current one is on file/)
  })

  it('a certificate about a firm cannot be recorded on a person', () => {
    const v = checkToRecord(base({ type: 'INSURANCE_GL', issuer: 'Hartford' }), ON)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('WRONG_SUBJECT')
  })
})

describe('a worker’s own upload of her I-9 never starts her', () => {
  it('an I-9 the worker sent counts as received, not as the employer’s examination', () => {
    const held = heldFromDocInstances(
      [{ id: 'd1', status: 'UPLOADED', signedAt: days(-1), template: { name: 'I-9 and E-Verify' } }],
      [{ key: 'I9_EVERIFY', label: 'I-9 and E-Verify' }]
    )
    expect(held).toHaveLength(1)
    expect(held[0].accepted).toBe(false)
  })

  it('so the start is still refused on the I-9 until the employer records its examination', () => {
    const insured = [
      { type: 'INSURANCE_GL', status: 'CLEAR', validFrom: days(-100), expiresAt: days(200), verifiedAt: days(-100) },
      { type: 'INSURANCE_WC', status: 'CLEAR', validFrom: days(-100), expiresAt: days(200), verifiedAt: days(-100) },
    ]
    const uploaded = heldFromDocInstances(
      [{ id: 'd1', status: 'UPLOADED', signedAt: days(-1), template: { name: 'I-9 and E-Verify' } }],
      [{ key: 'I9_EVERIFY', label: 'I-9 and E-Verify' }]
    )
    const before = contractClearance({
      personName: 'Ingrid Sørensen', personVerifications: [], supplierName: 'Pinnacle Staffing',
      supplierCertificates: insured, on: ON, extraHeld: uploaded,
    })
    expect(before.outcome).toBe('BLOCK')
    expect(before.says).toMatch(/I-9/)

    const after = contractClearance({
      personName: 'Ingrid Sørensen',
      personVerifications: [{ type: 'I9_EVERIFY', status: 'CLEAR', issuedAt: days(0), formEdition: '01/20/25' }],
      supplierName: 'Pinnacle Staffing', supplierCertificates: insured, on: ON, extraHeld: uploaded,
    })
    expect(after.blocking.map((b) => b.key)).not.toContain('I9_EVERIFY')
  })
})

describe('a supplier answers a document asked of the firm itself', () => {
  it('a supplier asked for its own certificate puts it on file as itself, rather than being told it was not asked', async () => {
    const { mayAct } = await import('@/lib/document-request')
    const doc = { status: 'SENT', templateName: 'Certificate of good standing', needsSignature: false, subjectPersonId: null, issuerName: 'Northbend Athletic' }
    const v = mayAct('upload', doc, { personId: 'owner-1', staffOfIssuer: false, atSubjectCompany: true }, { fileUrl: 'https://files.example/gs.pdf' })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.next).toBe('UPLOADED')
  })

  it('a firm the paper is not about is still refused it', async () => {
    const { mayAct } = await import('@/lib/document-request')
    const doc = { status: 'SENT', templateName: 'Certificate of good standing', needsSignature: false, subjectPersonId: null, issuerName: 'Northbend Athletic' }
    const v = mayAct('upload', doc, { personId: 'stranger', staffOfIssuer: false }, { fileUrl: 'https://files.example/gs.pdf' })
    expect(v.ok).toBe(false)
  })
})

describe('a start refused on two things says both as sentences', () => {
  it('a missing I-9 and a lapsed certificate of good standing read as two sentences, and the second speaks of starting, not submitting', () => {
    const certs = [
      { type: 'INSURANCE_GL', status: 'CLEAR', validFrom: days(-100), expiresAt: days(200), verifiedAt: days(-100) },
      { type: 'INSURANCE_WC', status: 'CLEAR', validFrom: days(-100), expiresAt: days(200), verifiedAt: days(-100) },
      { type: 'GOOD_STANDING', status: 'CLEAR', validFrom: days(-400), expiresAt: days(-35), verifiedAt: days(-400) },
    ]
    const v = contractClearance({
      personName: 'Samuel Adeyinka', personVerifications: [], supplierName: 'Halcyon Talent',
      supplierCertificates: certs, on: ON,
    })
    expect(v.outcome).toBe('BLOCK')
    expect(v.says).toMatch(/^Samuel Adeyinka cannot start without proof of right to work \(I-9, checked with E-Verify\)\. Halcyon Talent/)
    expect(v.says).toMatch(/Nobody can start through Halcyon Talent/)
    expect(v.says).not.toMatch(/submitted/)
  })
})

describe('a certificate nobody collected warns at the start, in words about collecting it', () => {
  it('a client order asking for good standing nobody has collected warns, and asks for a current one rather than calling it lapsed', () => {
    const certs = [
      { type: 'INSURANCE_GL', status: 'CLEAR', validFrom: days(-100), expiresAt: days(200), verifiedAt: days(-100) },
      { type: 'INSURANCE_WC', status: 'CLEAR', validFrom: days(-100), expiresAt: days(200), verifiedAt: days(-100) },
    ]
    const v = contractClearance({
      personName: 'Aditi Ramaswamy',
      personVerifications: [{ type: 'I9_EVERIFY', status: 'CLEAR', issuedAt: days(-1) }],
      supplierName: 'Sundara Systems', supplierCertificates: certs, on: ON,
      requirements: [{
        key: 'GOOD_STANDING', label: 'Certificate of good standing', required: true, owedBy: 'SUPPLIER',
        blocks: true, from: 'ORDER', waived: false,
      } as never],
    })
    expect(v.outcome).toBe('WARN')
    expect(v.says).toMatch(/Ask Sundara Systems for a current one/)
    expect(v.says).not.toMatch(/back in date|submitted/)
  })
})

describe('a worker’s own page offers the button the paper needs', () => {
  it('an outstanding item whose request is a paper to sign says Sign, not Upload', async () => {
    const { myPapers } = await import('@/lib/document-request')
    const papers = myPapers({
      myEmail: 'ilya@example.invalid',
      documents: [{
        id: 'ask-1', status: 'SENT', templateName: 'Non-disclosure agreement', needsSignature: true,
        issuerName: 'Sorrelwood Clinical Staffing', sentAt: days(-1), signedAt: null,
      }],
      packets: [],
      owed: [{
        key: 'NDA', label: 'Non-disclosure agreement', owedBy: 'WORKER', owedByName: null, stopsWork: false,
        state: 'MISSING', word: 'Not on file', asked: 'required by the order', ranOutOn: null, waivedSays: null,
        hers: true, notHersBecause: null,
      }],
      asksByKey: { NDA: 'ask-1' },
      on: ON,
    } as never)
    const row = papers.find((p) => p.id === 'ask-1')
    expect(row?.todo).toBe('sign')
    expect(row?.needsSignature).toBe(true)
  })
})
