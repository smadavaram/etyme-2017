import { describe, it, expect } from 'vitest'
import { oneMessageTonight, type FindingNote } from '@/lib/night-message'
import { NIGHT_LETTER, type LapseLetter } from '@/lib/notify/documents'

function paper(personId: string, n: number, over: Partial<LapseLetter['data']> = {}): LapseLetter {
  const saidKey = `doc${n}:0:OWES:${personId}`
  return {
    side: 'OWES', personId, companyId: 'brightmoor', audience: 'business', channel: 'EMAIL', type: 'SYSTEM',
    title: `The certificate of insurance ${n} has run out`, body: `Brightmoor Staffing’s certificate ${n} ran out. Send the renewal.`,
    short: `certificate ${n} has run out`, line: `Certificate ${n} ran out`, group: 'Brightmoor Staffing',
    ask: 'Send the renewal.', askMany: 'Send the renewals.', entityId: `doc${n}`, saidKey,
    logSummary: 'Told', logReason: 'It ran out',
    data: {
      documentId: `doc${n}`, documentKey: 'INSURANCE_GL', document: 'Certificate of insurance', milestone: -1,
      daysLeft: -2, lapsed: true, neverFiled: false, stopsWork: false, owedBy: 'SUPPLIER', lineId: null,
      side: 'OWES', saidKey, ...over,
    },
  }
}

function finding(personId: string, blocking = false): FindingNote {
  return {
    personId, companyId: 'brightmoor', type: 'SYSTEM',
    title: 'Order PO-1001 is nearly spent', body: '92% of the order’s ceiling is billed.',
    entityId: 'po1', channel: blocking ? 'EMAIL' : 'IN_APP',
    data: { kinds: ['PO_NEARLY_SPENT'], saidKey: `PO_NEARLY_SPENT:po1:IN_14:${personId}` },
    blocking, keys: [`PO_NEARLY_SPENT:po1:IN_14:${personId}`],
  }
}

describe('the nightly check writes each person once', () => {
  it('a person owed papers and findings the same night reads one message carrying both', () => {
    const plan = oneMessageTonight([paper('owner', 1), paper('owner', 2)], [finding('owner')])
    expect(plan.lettersAlone).toEqual([])
    expect(plan.notesAlone).toEqual([])
    expect(plan.together).toHaveLength(1)
    const { message, facts } = plan.together[0]
    expect(facts).toHaveLength(2)
    expect(message.channel).toBe('EMAIL')
    expect(message.body).toContain('Certificate 1 ran out')
    expect(message.body).toContain('Order PO-1001 is nearly spent')
    expect(message.title).toMatch(/and one more thing to look at$/)
  })

  it('every paper and every finding in the one message is remembered, so tomorrow says none of them again', () => {
    const { message } = oneMessageTonight([paper('owner', 1)], [finding('owner')]).together[0]
    const data = message.data as { letter: string; saidKey: string; alsoSaid: string[] }
    expect(data.letter).toBe(NIGHT_LETTER)
    expect([data.saidKey, ...data.alsoSaid].sort()).toEqual(['PO_NEARLY_SPENT:po1:IN_14:owner', 'doc1:0:OWES:owner'].sort())
  })

  it('a finding that stops work leads the message when no paper in it does', () => {
    const { message } = oneMessageTonight([paper('owner', 1)], [finding('owner', true)]).together[0]
    expect(message.title).toBe('Order PO-1001 is nearly spent, and one more paper')
    expect(message.body.startsWith('Order PO-1001 is nearly spent')).toBe(true)
  })

  it('a paper that stops work leads, whatever the finding says', () => {
    const { message } = oneMessageTonight([paper('owner', 1, { stopsWork: true })], [finding('owner', true)]).together[0]
    expect(message.title.startsWith('The certificate of insurance 1 has run out')).toBe(true)
  })

  it('a person owed only papers, or only findings, reads exactly what they read before', () => {
    const plan = oneMessageTonight([paper('hr', 1)], [finding('ap')])
    expect(plan.together).toEqual([])
    expect(plan.lettersAlone.map((l) => l.personId)).toEqual(['hr'])
    expect(plan.notesAlone.map((n) => n.personId)).toEqual(['ap'])
  })
})
