/**
 * The page a person opens to see what has been asked of them.
 *
 * It listed documents sent for signature and nothing else, so an ICU
 * nurse asked by email to renew her state license — an ask raised as a
 * packet against her, with a link of her own — opened her paperwork page
 * and found it empty. A page that shows one of the two ways she is asked
 * for something is worse than no page: she has been told there is
 * nothing to do.
 *
 * So the list is derived from everything that actually asks her, and
 * these sentences hold the shape of it.
 */

import { describe, it, expect } from 'vitest'
import { myPapers, askWord, type AskedPacket, type SentDocument } from '@/lib/document-request'

const HERS = 'colleen.byrne@example.invalid'

function sent(over: Partial<SentDocument> = {}): SentDocument {
  return {
    id: 'doc-1',
    status: 'SENT',
    templateName: 'Non-disclosure agreement',
    needsSignature: true,
    issuerName: 'Nike',
    sentAt: new Date('2026-09-10T00:00:00Z'),
    signedAt: null,
    ...over,
  }
}

function packet(over: Partial<AskedPacket> = {}): AskedPacket {
  return {
    id: 'pack-1',
    label: 'Renewing a license',
    askedBy: 'Halcyon Staffing',
    recipientEmail: HERS,
    token: 'tok-abc',
    expiresAt: new Date('2026-10-17T00:00:00Z'),
    cancelledAt: null,
    createdAt: new Date('2026-09-15T00:00:00Z'),
    reason: 'Your professional license (RN 154-882, WI) runs out in 24 days. The Wisconsin Board of Nursing takes a fortnight.',
    items: [
      {
        id: 'item-1',
        label: 'professional license (RN 154-882, WI)',
        state: 'PENDING',
        required: true,
        receivedAt: null,
        position: 0,
      },
    ],
    ...over,
  }
}

const mine = (over: Parameters<typeof myPapers>[0] | Partial<Parameters<typeof myPapers>[0]> = {}) =>
  myPapers({ myEmail: HERS, documents: [], packets: [], ...over })

describe('what a person sees on their own paperwork page', () => {
  it('shows a document sent for signature, with who asked and what to do about it', () => {
    const [paper] = mine({ documents: [sent()] })
    expect(paper.name).toBe('Non-disclosure agreement')
    expect(paper.askedBy).toBe('Nike')
    expect(paper.word).toBe('Asked for')
    expect(paper.todo).toBe('sign')
  })

  it('keeps a document nobody has sent yet off the page, because an unsent ask is the company’s business', () => {
    expect(mine({ documents: [sent({ status: 'PENDING', sentAt: null })] })).toEqual([])
  })

  it('shows a license renewal asked for through a packet on the same page as the document sent for signature', () => {
    const papers = mine({ documents: [sent()], packets: [packet()] })
    expect(papers).toHaveLength(2)
    const renewal = papers.find((p) => p.kind === 'REQUEST')!
    expect(renewal.name).toBe('Professional license (RN 154-882, WI)')
    expect(renewal.partOf).toBe('Renewing a license')
  })

  it('says who asked for the renewal, by when, and in the words she was given', () => {
    const [renewal] = mine({ packets: [packet()] })
    expect(renewal.askedBy).toBe('Halcyon Staffing')
    expect(renewal.dueOn).toBe('2026-10-17T00:00:00.000Z')
    expect(renewal.why).toContain('Wisconsin Board of Nursing')
    expect(renewal.word).toBe('Asked for')
  })

  it('gives her the link the ask came with, so answering it is one click from her own page', () => {
    const [renewal] = mine({ packets: [packet()] })
    expect(renewal.link).toBe('/packet/tok-abc')
    expect(renewal.todo).toBe('open')
  })

  it('withholds the link where the ask was addressed to somebody else, because the link is the only credential on it', () => {
    const [renewal] = mine({ packets: [packet({ recipientEmail: 'hr@halcyon.example' })] })
    expect(renewal.link).toBeNull()
    expect(renewal.todo).toBeNull()
  })

  it('reads a packet item already answered as answered, and asks her for nothing further', () => {
    const [renewal] = mine({
      packets: [
        packet({
          items: [
            {
              id: 'item-1',
              label: 'professional license (RN 154-882, WI)',
              state: 'RECEIVED',
              required: true,
              receivedAt: new Date('2026-09-16T00:00:00Z'),
              position: 0,
            },
          ],
        }),
      ],
    })
    expect(renewal.word).toBe('On file')
    expect(renewal.todo).toBeNull()
    expect(renewal.doneAt).toBe('2026-09-16T00:00:00.000Z')
  })

  it('drops a withdrawn ask, because a cancelled packet is not still asking anybody for anything', () => {
    expect(mine({ packets: [packet({ cancelledAt: new Date('2026-09-16T00:00:00Z') })] })).toEqual([])
  })

  it('never asks her to sign a packet item, because a packet takes the file and no signature', () => {
    const [renewal] = mine({ packets: [packet()] })
    expect(renewal.needsSignature).toBe(false)
    expect(renewal.todo).not.toBe('sign')
  })

  it('puts what still needs doing above what is finished, so her work is the top of the page', () => {
    const papers = mine({
      documents: [sent({ id: 'done', status: 'SIGNED', signedAt: new Date('2026-09-11T00:00:00Z') })],
      packets: [packet()],
    })
    expect(papers.map((p) => p.id)).toEqual(['item-1', 'done'])
  })

  it('lists every item in a packet that asks for several, in the order they were asked', () => {
    const papers = mine({
      packets: [
        packet({
          label: 'Starting somebody in a licensed role',
          items: [
            { id: 'b', label: 'i-9 and e-verify', state: 'PENDING', required: true, receivedAt: null, position: 1 },
            { id: 'a', label: 'state license', state: 'PENDING', required: true, receivedAt: null, position: 0 },
          ],
        }),
      ],
    })
    expect(papers.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('names every state of an ask in words a person reads, never as the stored code', () => {
    expect(askWord('PENDING')).toBe('Asked for')
    expect(askWord('RECEIVED')).toBe('On file')
    expect(askWord('ACCEPTED')).toBe('Accepted')
    expect(askWord('REJECTED')).toBe('Sent back')
  })
})
