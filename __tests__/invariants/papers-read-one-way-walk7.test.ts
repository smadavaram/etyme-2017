import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/db', () => ({ prisma: {} }))

import { countWaiting, firmAsClientReadsIt, paperIdOfFileUrl, type WaitingItem, type WaitingPaper } from '@/lib/document-stages/arrived-papers'
import { namesForClient } from '@/lib/chain-names'
import { startSentenceAboutNow, startSentenceNow, startedOn } from '@/lib/document-stages/start-day'
import { askWord, workerPaperWord } from '@/lib/document-request'

/**
 * Walk 7, 2026-11-08 (items 1 and 3): papers read two ways again. The
 * client's Document requests said nothing "At your suppliers" while the
 * placement read "I-9 and E-Verify arrived at Halcyon Talent, being
 * examined"; and a worker's own upload counted under Paperwork's "waiting
 * on you" and not under Document requests'. These sentences hold both to
 * one reader each.
 */
const src = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')

describe('what arrived at a supplier is read once, by the placement and by Document requests', () => {
  it('the client’s At your suppliers reads what arrived through the reader the placement reads, not a list of its own', () => {
    const lib = src('lib/document-stages/arrived-papers.ts')
    const at = lib.slice(lib.indexOf('export async function arrivedAtSuppliers'))
    expect(at).toContain('arrivedOnLine(')
    expect(lib.slice(lib.indexOf('export async function paperDoorsForLine'))).toContain('arrivedOnLine(')
  })

  it('an I-9 the employer owes, not the worker, is listed at the supplier, because the placement lists it', () => {
    const lib = src('lib/document-stages/arrived-papers.ts')
    const at = lib.slice(lib.indexOf('export async function arrivedAtSuppliers'))
    expect(at).not.toMatch(/owedBy === 'WORKER'/)
    // The placement's own checklist, the start's verdict, decides what is asked.
    expect(at).toContain('await startPapers(')
  })

  const rungs = [
    { id: 'sc-top', personId: 'p-samuel', companyId: 'co-brightmoor', companyName: 'Brightmoor Staffing', clientCompanyId: 'co-cavanaugh' },
    { id: 'sc-sub', personId: 'p-samuel', companyId: 'co-halcyon', companyName: 'Halcyon Talent', clientCompanyId: 'co-brightmoor' },
  ]

  it('a paper that arrived at the supplier the client pays names that supplier', () => {
    const seen = namesForClient(rungs, 'co-cavanaugh', () => false)
    expect(firmAsClientReadsIt({ firmId: 'co-brightmoor', firmName: 'Brightmoor Staffing', seen, paidId: 'co-brightmoor', paidName: 'Brightmoor Staffing' })).toBe('Brightmoor Staffing')
  })

  it('a paper that arrived at a firm below the supplier the client pays never names that firm, and says who it comes through', () => {
    const seen = namesForClient(rungs, 'co-cavanaugh', () => false)
    const said = firmAsClientReadsIt({ firmId: 'co-halcyon', firmName: 'Halcyon Talent', seen, paidId: 'co-brightmoor', paidName: 'Brightmoor Staffing' })
    expect(said).not.toContain('Halcyon')
    expect(said).toContain('Brightmoor Staffing')
  })

  it('where the client’s agreement with the prime requires disclosure, the firm below is named', () => {
    const seen = namesForClient(rungs, 'co-cavanaugh', (prime) => prime === 'co-brightmoor')
    expect(firmAsClientReadsIt({ firmId: 'co-halcyon', firmName: 'Halcyon Talent', seen, paidId: 'co-brightmoor', paidName: 'Brightmoor Staffing' })).toBe('Halcyon Talent')
  })

  it('a firm the chain does not show the client is never named either: it reads as the supplier’s supplier', () => {
    const seen = namesForClient(rungs.slice(0, 1), 'co-cavanaugh', () => false)
    expect(firmAsClientReadsIt({ firmId: 'co-elsewhere', firmName: 'Elsewhere LLC', seen, paidId: 'co-brightmoor', paidName: 'Brightmoor Staffing' })).toBe('Brightmoor Staffing’s supplier')
  })
})

describe('Waiting on you is one count on Paperwork and on Document requests', () => {
  const none = () => false
  const upload = (id: string, extra: Partial<WaitingPaper> = {}): WaitingPaper => ({ id, status: 'UPLOADED', examinedAt: null, key: 'I9_EVERIFY', aboutPersonId: 'p-ingrid', ...extra })

  it('a worker’s own upload that answers no request counts as waiting on you', () => {
    expect(countWaiting({ papers: [upload('doc-1')], items: [], seatPersonId: 'p-ruth', employedElsewhere: none }).count).toBe(1)
  })

  it('a request answered with a file is counted once, as its paper, not again as the request item', () => {
    const item: WaitingItem = { id: 'item-1', key: 'I9_EVERIFY', aboutPersonId: 'p-ingrid', paperId: 'doc-1' }
    const w = countWaiting({ papers: [upload('doc-1')], items: [item], seatPersonId: 'p-ruth', employedElsewhere: none })
    expect(w).toEqual({ count: 1, paperIds: ['doc-1'], itemIds: [] })
  })

  it('a question answered in words, with no paper, is counted as the request item', () => {
    const item: WaitingItem = { id: 'item-2', key: 'WORK_AUTH_QUESTION', aboutPersonId: 'p-ingrid', paperId: null }
    expect(countWaiting({ papers: [], items: [item], seatPersonId: 'p-ruth', employedElsewhere: none }).itemIds).toEqual(['item-2'])
  })

  it('a paper somebody already examined does not wait, and neither does a request item whose paper was examined', () => {
    const looked = upload('doc-1', { examinedAt: new Date('2026-11-07T00:00:00Z') })
    const item: WaitingItem = { id: 'item-1', key: 'I9_EVERIFY', aboutPersonId: 'p-ingrid', paperId: 'doc-1' }
    expect(countWaiting({ papers: [looked], items: [item], seatPersonId: 'p-ruth', employedElsewhere: none }).count).toBe(0)
  })

  it('the seat’s own paper never waits on the seat', () => {
    expect(countWaiting({ papers: [upload('doc-1', { aboutPersonId: 'p-ruth' })], items: [], seatPersonId: 'p-ruth', employedElsewhere: none }).count).toBe(0)
  })

  it('an I-9 about somebody another firm employs is that firm’s to examine, never counted as waiting here', () => {
    const w = countWaiting({ papers: [upload('doc-1')], items: [], seatPersonId: 'p-ruth', employedElsewhere: (p) => p === 'p-ingrid' })
    expect(w.count).toBe(0)
  })

  it('Paperwork, Document requests and the decisions queue all read the one count', () => {
    expect(src('app/api/documents/route.ts')).toContain('await waitingOnYou(')
    expect(src('app/api/packets/route.ts')).toMatch(/awaitingReview: waiting\.count/)
    const lib = src('lib/document-stages/arrived-papers.ts')
    expect(lib.slice(lib.indexOf('export async function papersWaitingOn'))).toContain('await waitingOnYou(')
  })

  it('a paper that waits and answers no request is said on Document requests with a link to Paperwork, so the count always has somewhere to open', () => {
    expect(src('app/api/packets/route.ts')).toContain('waitingOutsideRequests')
    const page = src('app/dashboard/packets/page.tsx')
    expect(page).toContain('Open them on Paperwork')
    expect(page).toContain('href="/dashboard/documents"')
  })

  it('a request item’s paper is read from its file address, and anything else names no paper', () => {
    expect(paperIdOfFileUrl('/api/documents/doc-9/file')).toBe('doc-9')
    expect(paperIdOfFileUrl('https://elsewhere/x')).toBeNull()
    expect(paperIdOfFileUrl(null)).toBeNull()
  })
})

describe('a stored start sentence is said on the day it is read', () => {
  const NOV = new Date('2026-11-08T12:00:00Z')
  const aug9 = new Date('2026-08-09T00:00:00Z')

  it('HR’s request list says a stored start sentence about the person, on the day it is read, never the raw day as still to come', () => {
    const said = startSentenceAboutNow('You are due to start at Northbend Athletic on 2026-08-09.', 'Rajesh Iyer', NOV, () => false)
    expect(said).toBe('Rajesh Iyer was due to start at Northbend Athletic on Aug 9, 2026.')
  })

  it('a person whose line began on that day reads as started, on HR’s list and on her own', () => {
    const lines = [{ startDate: aug9, state: 'IN_PROGRESS' }]
    expect(startSentenceAboutNow('You are due to start at Northbend Athletic on 2026-08-09.', 'Rajesh Iyer', NOV, (d) => startedOn(lines, d)))
      .toBe('Rajesh Iyer started at Northbend Athletic on Aug 9, 2026.')
    expect(startSentenceNow('You are due to start at Northbend Athletic on 2026-08-09.', NOV, (d) => startedOn(lines, d)))
      .toBe('You started at Northbend Athletic on Aug 9, 2026.')
  })

  it('a line that started on another day, or is still a draft, does not count as started', () => {
    expect(startedOn([{ startDate: new Date('2026-08-10T00:00:00Z'), state: 'IN_PROGRESS' }], aug9)).toBe(false)
    expect(startedOn([{ startDate: aug9, state: 'DRAFT' }], aug9)).toBe(false)
  })

  it('both the request list and the worker’s own page rebuild the stored sentence', () => {
    expect(src('app/api/packets/route.ts')).toContain('startSentenceAboutNow(')
    expect(src('app/api/me/papers/route.ts')).toContain('startToday(p.reopenedReason)')
  })
})

describe('the worker’s own list never says On file for a paper nobody examined', () => {
  it('an upload nobody has examined reads sent and waiting to be checked on her own list', () => {
    expect(workerPaperWord({ status: 'UPLOADED', examinedAt: null })).toBe('Sent, waiting to be checked')
  })

  it('an upload the firm examined reads on file', () => {
    expect(workerPaperWord({ status: 'UPLOADED', examinedAt: new Date() })).toBe('On file')
  })

  it('a request item she answered at the link reads sent and waiting until the firm accepts it', () => {
    expect(askWord('RECEIVED')).toBe('Sent, waiting to be checked')
    expect(askWord('ACCEPTED')).toBe('Accepted')
  })

  it('her page hands the examination to the word', () => {
    expect(src('app/api/me/papers/route.ts')).toContain('examinedAt: r.examinedAt,')
  })
})
