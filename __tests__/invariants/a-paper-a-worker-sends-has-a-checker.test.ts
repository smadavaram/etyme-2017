import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/db', () => ({ prisma: {} }))

import { paperDoorsFor, arrivalReads, waitingOnYouSays, firmThatOwes, type DoorLine, type DoorPaper } from '@/lib/document-stages/paper-doors'
import { itemsFollowArrival, itemsFollowExamination, paperFileUrl } from '@/lib/document-stages/arrived-papers'
import { answeredNotice } from '@/lib/document-request'
import { keptPaperSays } from '@/lib/document-stages/own-papers'

/**
 * The founder's tester on production, 2026-11-08: Noor Rahman, placed at
 * Northbend through CSI, sent her I-9 and her right to work from her own
 * page and read "4 documents are with them, waiting to be checked"; no
 * seat could check them, and the background check and drug screen the
 * placement needed had no door. These sentences hold the doors.
 */
const src = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')

const CSI = 'co-csi'
const NORTHBEND = 'co-northbend'
const HR = ['consultants.write', 'consultants.read', 'governance.read', 'documents.read']
const line: DoorLine = {
  contractId: 'sc-noor', personId: 'p-noor', personName: 'Noor Rahman',
  sellerId: CSI, sellerName: 'CSI', employer: { companyId: CSI, name: 'CSI', how: 'EMPLOYEE' },
}
const arrivedI9: DoorPaper = {
  key: 'I9_EVERIFY', label: 'I-9 and E-Verify', state: 'NEEDED', owedBy: 'WORKER',
  arrived: {
    paperId: 'doc-i9', firmId: CSI, firmName: 'CSI',
    row: { id: 'doc-i9', template: { name: 'I-9 and E-Verify' }, subject: 'Noor Rahman', subjectType: 'PERSON', aboutAFirm: false, fileName: 'i9.pdf', examineNeeds: { edition: true, shown: true } },
  },
}
const atCsiHr = { companyId: CSI, permissions: HR }
const atNorthbend = { companyId: NORTHBEND, permissions: ['*'] }

describe('a paper a worker sends from her own page has somebody to check it', () => {
  it('a paper a worker sends from her own page waits on her employer’s HR, and HR sees it as arrived and not examined with Check what arrived', () => {
    const d = paperDoorsFor(line, arrivedI9, atCsiHr)
    expect(d.doors).toHaveLength(1)
    expect(d.doors[0]).toMatchObject({ kind: 'CHECK', label: 'Check what arrived', paperId: 'doc-i9' })
  })

  it('the client is never offered a door on a supplier’s worker’s I-9: it reads that the paper arrived at the supplier and is being examined', () => {
    const d = paperDoorsFor(line, arrivedI9, atNorthbend)
    expect(d.doors).toEqual([])
    expect(d.says).toBe('I-9 and E-Verify arrived at CSI, being examined.')
  })

  it('a seat at the employer that does not work papers is told who looks at it, and is offered nothing', () => {
    const d = paperDoorsFor(line, arrivedI9, { companyId: CSI, permissions: ['invoices.read'] })
    expect(d.doors).toEqual([])
    expect(d.says).toContain('HR or the compliance officer at CSI')
  })

  it('a background check the firm owes offers Record the provider’s verdict on the placement and never asks the worker for the report', () => {
    const bg: DoorPaper = { key: 'BACKGROUND_CHECK', label: 'background check', state: 'NEEDED', owedBy: 'WORKER' }
    const d = paperDoorsFor(line, bg, atCsiHr)
    expect(d.doors).toEqual([expect.objectContaining({ kind: 'VERDICT', label: 'Record the provider’s verdict', contractId: 'sc-noor', checkType: 'BACKGROUND_CHECK' })])
    expect(d.doors.some((x) => x.kind === 'ASK')).toBe(false)
  })

  it('a drug screen opens the verdict form on the drug screen, not the background check', () => {
    const d = paperDoorsFor(line, { key: 'DRUG_SCREENING', label: 'drug screen', state: 'NEEDED' }, atCsiHr)
    expect(d.doors[0]).toMatchObject({ kind: 'VERDICT', checkType: 'DRUG_SCREENING' })
  })

  it('the client reads who orders a screening company’s report, and that the worker is never sent it', () => {
    const d = paperDoorsFor(line, { key: 'BACKGROUND_CHECK', label: 'background check', state: 'NEEDED' }, atNorthbend)
    expect(d.doors).toEqual([])
    expect(d.says).toBe('CSI orders background check from a screening company and records what it says. Noor is never sent the report.')
  })

  it('a paper she holds and has not sent offers her employer’s HR Ask Noor, and the client reads who asks', () => {
    const owed: DoorPaper = { key: 'I9_EVERIFY', label: 'I-9 and E-Verify', state: 'NEEDED', owedBy: 'WORKER' }
    expect(paperDoorsFor(line, owed, atCsiHr).doors[0]).toMatchObject({ kind: 'ASK', label: 'Ask Noor', documentTypeKey: 'I9_EVERIFY', personId: 'p-noor' })
    const client = paperDoorsFor(line, owed, atNorthbend)
    expect(client.doors).toEqual([])
    expect(client.says).toBe('CSI employs Noor and completes I-9 and E-Verify with Noor. It reads here once it is on file.')
  })

  it('a paper on file, a waived paper and the supplier’s own cover carry no door on the person', () => {
    expect(paperDoorsFor(line, { key: 'I9_EVERIFY', label: 'I-9', state: 'ALREADY_HELD' }, atCsiHr)).toEqual({ doors: [], says: null })
    expect(paperDoorsFor(line, { key: 'NDA', label: 'NDA', state: 'WAIVED' }, atCsiHr)).toEqual({ doors: [], says: null })
    expect(paperDoorsFor(line, { key: 'INSURANCE_GL', label: 'insurance', state: 'NEEDED', owedBy: 'SUPPLIER' }, atCsiHr)).toEqual({ doors: [], says: null })
  })

  it('a worker employed by a sub-vendor below the supplier has her papers asked and checked by the sub-vendor, not the supplier', () => {
    const sub: DoorLine = { ...line, employer: { companyId: 'co-tapin', name: 'Tapin', how: 'EMPLOYEE' } }
    expect(firmThatOwes(sub)).toEqual({ companyId: 'co-tapin', name: 'Tapin' })
    expect(paperDoorsFor(sub, { key: 'I9_EVERIFY', label: 'I-9', state: 'NEEDED' }, atCsiHr).doors).toEqual([])
    expect(paperDoorsFor(sub, { key: 'I9_EVERIFY', label: 'I-9', state: 'NEEDED' }, { companyId: 'co-tapin', permissions: HR }).doors[0].kind).toBe('ASK')
    // A best reading of the employer never moves a door off the seller.
    expect(firmThatOwes({ ...line, employer: { companyId: 'co-tapin', name: 'Tapin', how: 'BOTTOM' } }).companyId).toBe(CSI)
  })
})

describe('the client’s Document requests never asks the client to examine a supplier’s worker’s I-9', () => {
  it('an I-9 that arrived on the client’s own request about somebody another firm employs is said, never counted as waiting on the client', () => {
    const r = arrivalReads({ readerCompanyId: NORTHBEND, holderCompanyId: NORTHBEND, holderName: 'Northbend Athletic', key: 'I9_EVERIFY', employerCompanyId: CSI, employerName: 'CSI' })
    expect(r.examinesIt).toBe(false)
    expect(r.says).toContain('CSI employs this person and examines it')
  })

  it('a paper that arrived at the supplier reads arrived at the supplier, being examined', () => {
    expect(arrivalReads({ readerCompanyId: NORTHBEND, holderCompanyId: CSI, holderName: 'CSI', key: 'NDA' })).toEqual({ examinesIt: false, says: 'Arrived at CSI, being examined.' })
  })

  it('the employer examines what arrived on its own request', () => {
    expect(arrivalReads({ readerCompanyId: CSI, holderCompanyId: CSI, holderName: 'CSI', key: 'I9_EVERIFY', employerCompanyId: CSI }).examinesIt).toBe(true)
  })

  it('the packets route leaves an employer-only paper another firm employs the person for out of Waiting on you, and lists what arrived at the client’s suppliers', () => {
    const route = src('app/api/packets/route.ts')
    expect(route).toMatch(/awaitingReview: p\.items\.filter\(\(i\) => i\.state === 'RECEIVED' && !notOurs\(p, i\.key\)\)/)
    expect(route).toContain('arrivedAtSuppliers(')
  })
})

describe('the arrival and the look keep the request saying the same thing', () => {
  it('a paper she sends answers that firm’s own open request for it, and Document requests counts it as waiting', async () => {
    const findMany = vi.fn(async () => [{ id: 'item-1' }])
    const updateMany = vi.fn(async () => ({ count: 1 }))
    const n = await itemsFollowArrival(
      { docId: 'doc-i9', firmId: CSI, personId: 'p-noor', key: 'I9_EVERIFY', paperName: 'I-9 and E-Verify', fileName: 'i9.pdf', now: new Date('2026-11-08T00:00:00Z') },
      { packetItem: { findMany, updateMany } } as never,
    )
    expect(n).toBe(1)
    const where = (findMany.mock.calls[0] as unknown as [{ where: any }])[0].where
    // Only the firm it went to, about her, still asked for: never another firm's request.
    expect(where.packet).toEqual({ companyId: CSI, subjectPersonId: 'p-noor', cancelledAt: null })
    expect(where.state).toBe('PENDING')
    expect((updateMany.mock.calls[0] as unknown as [{ data: any }])[0].data).toMatchObject({ state: 'RECEIVED', fileUrl: paperFileUrl('doc-i9'), fileName: 'i9.pdf' })
  })

  it('a paper nobody can name answers no request', async () => {
    const findMany = vi.fn()
    expect(await itemsFollowArrival({ docId: 'd', firmId: CSI, personId: 'p', key: null, fileName: null }, { packetItem: { findMany } } as never)).toBe(0)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('accepting the paper on Paperwork closes the request item it answered', async () => {
    const findMany = vi.fn(async () => [])
    await itemsFollowExamination({ docId: 'doc-i9', accepted: true, reviewerId: 'p-hr', note: null, validUntil: null, verificationId: null }, { packetItem: { findMany } } as never)
    expect((findMany.mock.calls[0] as unknown as [{ where: any }])[0].where).toEqual({ fileUrl: '/api/documents/doc-i9/file', state: 'RECEIVED' })
    expect(src('app/api/documents/[id]/examine/route.ts')).toContain('itemsFollowExamination(')
  })

  it('her upload through a request answers the firm’s open request, and a paper she keeps on her own record goes to the firm a line asks it for', () => {
    expect(src('app/api/documents/[id]/act.ts')).toContain('itemsFollowArrival(')
    const me = src('app/api/me/papers/route.ts')
    expect(me).toContain("about === 'ME' && !filer && file ? await sendToTheFirmThatAsks(")
    expect(me).toMatch(/status: 'UPLOADED'[^\n]*signedById: me/)
  })

  it('the examiners are told it arrived and where to look, never that it is on file', () => {
    expect(answeredNotice({ who: 'Noor Rahman', paper: 'I-9 and E-Verify', signed: false, before: 0, note: null }).body)
      .toBe('It arrived and waits for you to look at it under Contracts, on the Paperwork tab.')
  })
})

describe('Paperwork counts what waits on the seats whose work papers are', () => {
  it('one paper and many are said in a sentence, and none says nothing', () => {
    expect(waitingOnYouSays(0)).toBeNull()
    expect(waitingOnYouSays(1)).toBe('One paper arrived and is waiting on you. Open it, then accept it or send it back.')
    expect(waitingOnYouSays(4)).toBe('4 papers arrived and are waiting on you. Open each one, then accept it or send it back.')
  })

  it('the Paperwork read counts only for a seat a paper arriving is told to, and asking from the placement never asks for a screening report', () => {
    const route = src('app/api/documents/route.ts')
    expect(route).toContain('await examinesAt(companyId, caller.person.id)')
    expect(route).toContain('waitingOnYou:')
    expect(route).toMatch(/if \(orderedNotCollected\(key\)\)/)
  })
})

describe('a paper she keeps on her own record says where it is', () => {
  it('a paper she keeps on her own record that no line asks for reads on your record, never with them', () => {
    const r = keptPaperSays({ examinedAt: null, checkStatus: 'PENDING', ownRecord: true, sentTo: null })
    expect(r).toEqual({ examined: false, says: 'On your record. Nobody has been sent it, because no work you are on asks for it.' })
    expect(r.says).not.toMatch(/with them|waiting to be checked/)
  })

  it('a paper she kept and that went to the firm a line asks it for names that firm until it is examined', () => {
    expect(keptPaperSays({ examinedAt: null, checkStatus: 'PENDING', ownRecord: true, sentTo: 'CSI' }).says).toBe('Sent to CSI, not examined yet')
  })

  it('a paper she put on her own record is not counted as with a firm, on her page or at the door that sends it', () => {
    const me = src('app/api/me/papers/route.ts')
    expect(me.match(/received: WITH_THEM\.includes\(v\.status\) && !keptOnHerOwnRecord\(v\.result\)/g)).toHaveLength(2)
  })
})

describe('sending back an answer on Document requests asks for the reason in a field', () => {
  it('Document requests never asks for a reason in a browser prompt', () => {
    const page = src('app/dashboard/packets/page.tsx')
    expect(page).not.toContain('window.prompt')
    expect(page).toContain('Why it goes back.')
  })
})
