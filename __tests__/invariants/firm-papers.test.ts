import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkCover, coverRefusal } from '@/lib/worker-classification'
import { buysFrom, mayFileFirmPapers, paperSubject } from '@/lib/document-stages/firm-papers'
import { mayFileOwnPaper } from '@/lib/document-stages/own-papers'
import { rolesFor } from '@/lib/company-defaults'

/**
 * The Tapin walk, 2026-10-29: Brightmoor accepted Tapin's insurance on
 * its Paperwork screen and "Place" still refused with "the vendor has no
 * general liability and workers' compensation cover on file", said twice.
 */

const NOW = new Date('2026-10-29T12:00:00Z')
const current = { expiresAt: new Date('2027-10-01T00:00:00Z'), status: 'CLEAR' }
const lapsed = { expiresAt: new Date('2026-09-01T00:00:00Z'), status: 'CLEAR' }

describe('a clearance refusal says each missing paper once', () => {
  it('a clearance refusal says each missing paper once', () => {
    const v = checkCover('W2', { certificates: [], consultantCorpName: null, corpMissing: false, vendorName: 'Tapin' }, NOW)
    expect(v.outcome).toBe('BLOCK')
    expect(v.reason).toBe("Tapin has neither a general liability nor a workers' compensation certificate on file")
    expect(v.reason.match(/general liability/g)).toHaveLength(1)
    expect(v.reason.match(/workers' compensation/g)).toHaveLength(1)
  })

  it('names the firm that owes the paper, never "the vendor"', () => {
    const v = checkCover('W2', { certificates: [{ type: 'INSURANCE_GL', ...current }], consultantCorpName: null, corpMissing: false, vendorName: 'Tapin' }, NOW)
    expect(v.reason).toBe("Tapin has no workers' compensation certificate on file")
    expect(v.reason).not.toMatch(/vendor/i)
  })

  it('a caller that does not name the firm reads "The supplier", capitalized', () => {
    const v = checkCover('W2', { certificates: [], consultantCorpName: null, corpMissing: false }, NOW)
    expect(v.reason.startsWith('The supplier has neither')).toBe(true)
  })

  it('says a lapsed paper lapsed and a missing one is missing, each once', () => {
    const v = checkCover('W2', {
      certificates: [{ type: 'INSURANCE_GL', ...lapsed }, { type: 'INSURANCE_GL', ...lapsed }],
      consultantCorpName: null, corpMissing: false, vendorName: 'Tapin',
    }, NOW)
    expect(v.reason).toBe("Tapin let its general liability certificate lapse and has no workers' compensation certificate on file")
  })

  it('a renewed certificate beside a lapsed one is current, and nothing is refused', () => {
    const v = checkCover('W2', {
      certificates: [{ type: 'INSURANCE_GL', ...lapsed }, { type: 'INSURANCE_GL', ...current }, { type: 'INSURANCE_WC', ...current }],
      consultantCorpName: null, corpMissing: false, vendorName: 'Tapin',
    }, NOW)
    expect(v.outcome).toBe('PASS')
  })

  it('the same paper passed twice is said once', () => {
    expect(coverRefusal('Tapin', [{ paper: 'INSURANCE_WC', lapsed: false }, { paper: 'INSURANCE_WC', lapsed: false }]))
      .toBe("Tapin has no workers' compensation certificate on file")
  })
})

describe('a firm with a team files its own W-9, insurance and good standing from Company paperwork', () => {
  const vendor = rolesFor('VENDOR')
  const perms = (name: string) => vendor.find((r) => r.name === name)!.permissions as readonly string[]
  const may = (name: string) => mayFileFirmPapers({ companyKind: 'VENDOR', companyName: 'Tapin', isOnePersonFirm: false, permissions: perms(name) })

  it('a firm with a team files its own W-9, insurance and good standing from Company paperwork', () => {
    for (const role of ['Owner', 'Admin', 'HR', 'Compliance Officer']) expect(may(role).ok, role).toBe(true)
    for (const key of ['W9', 'INSURANCE_GL', 'INSURANCE_WC', 'GOOD_STANDING']) {
      const v = mayFileOwnPaper({
        key, about: 'MY_FIRM', isOnePersonFirm: false, filesForFirm: true, canKeepCopy: true, fileName: `${key}.pdf`,
        edition: 'Rev. March 2024', validFrom: '2026-09-01', validUntil: '2027-08-31',
      }, NOW)
      expect(v.ok, key).toBe(true)
    }
  })

  it('a recruiter or the AP clerk does not file the firm’s papers, and is told who does', () => {
    for (const role of ['Recruiter', 'AP & Payroll']) {
      const v = may(role)
      expect(v.ok, role).toBe(false)
      if (!v.ok) expect(v.message).toContain('Owner, an Admin, HR or the Compliance Officer')
    }
  })

  it('a client is asked for no supplier papers', () => {
    const v = mayFileFirmPapers({ companyKind: 'CLIENT', companyName: 'Northbend Athletic', isOnePersonFirm: false, permissions: ['settings.manage'] })
    expect(v.ok).toBe(false)
  })

  it('a seat that may not file the firm’s papers is refused by the paper rule too', () => {
    const v = mayFileOwnPaper({ key: 'W9', about: 'MY_FIRM', isOnePersonFirm: false, canKeepCopy: true, fileName: 'w9.pdf', edition: 'Rev. March 2024' }, NOW)
    expect(v).toMatchObject({ ok: false, code: 'NOT_YOUR_FIRM' })
  })
})

describe('insurance a client accepted on screen clears the award the same day', () => {
  it('a paper kept from a document request about a supplier is about the supplier', () => {
    expect(paperSubject({ subjectType: 'PACKET_ITEM', subjectId: 'item', packet: { subjectCompanyId: 'tapin', subjectPersonId: null } }))
      .toEqual({ kind: 'FIRM', companyId: 'tapin' })
    expect(paperSubject({ subjectType: 'PACKET_ITEM', subjectId: 'item', packet: { subjectCompanyId: null, subjectPersonId: 'ravi' } }))
      .toEqual({ kind: 'PERSON', personId: 'ravi' })
    expect(paperSubject({ subjectType: 'PACKET_ITEM', subjectId: 'item', packet: null })).toEqual({ kind: 'NONE' })
  })

  it('asking a firm for its supplier papers counts as buying from it, before any job goes between them', () => {
    const none = { invited: false, submitted: false, onALine: false, onRegisterAsSupplier: false, askedForItsPapers: false }
    expect(buysFrom(none)).toBe(false)
    expect(buysFrom({ ...none, askedForItsPapers: true })).toBe(true)
    expect(buysFrom({ ...none, onRegisterAsSupplier: true })).toBe(true)
  })

  it('every door that accepts a supplier’s certificate records it through the one writer', () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
    const examine = read('src/app/api/documents/[id]/examine/route.ts')
    const review = read('src/app/api/packets/[id]/review/route.ts')
    const shared = read('src/app/api/packets/examination.ts')
    expect(examine).toContain('recordSupplierPaper')
    expect(examine).toContain('examinationOf')
    expect(review).toContain('examinationOf')
    // Neither route writes a check of its own.
    expect(examine).not.toContain('writeCheck(')
    expect(review).not.toContain('writeCheck(')
    expect(shared.match(/writeCheck\(/g)?.length).toBe(2)
  })
})

describe('the client’s Document requests page accepts or sends back what arrived', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/dashboard/packets/page.tsx'), 'utf8')
  it('the client’s Document requests page accepts or sends back what arrived', () => {
    expect(page).toContain('ExaminePaper')
    expect(page).toContain('Accept or send back')
    expect(page).toContain('/api/documents/${a.paperId}/file')
  })
})
