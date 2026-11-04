import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({ notify: vi.fn(async () => ({ id: 'n1' })) }))
vi.mock('@/lib/notify', () => ({ notify: h.notify }))
vi.mock('@/lib/db', () => ({ prisma: {} }))

import { degreeToldToYou, tellTheWorkerAboutHerDegree, DEGREE_TOLD_TITLE } from '@/lib/document-stages/degree-told'
import { degreeReading } from '@/lib/document-stages/degree'
import { DEGREE_DOORS } from '@/lib/notify/degree-and-start'

/**
 * The fifth screen walk, 2026-11-04: Rosa Delgado put a 2016 degree on
 * file against a 2014 résumé line, HR read the sentence and the three
 * doors, and she was told nothing: `degreeCheckForYou` was called only by
 * its own test. These sentences hold the call sites.
 */
const on = new Date('2026-11-04T00:00:00Z')
const rosa = (year: number, verifiedBy: { provider: string; reference: string; on: Date } | null = null) =>
  degreeReading({
    paper: { institution: 'Oregon State University', qualification: 'B.S. Industrial Engineering', nameOnDocument: 'Rosa Delgado', year },
    personName: 'Rosa Delgado',
    resume: [{ school: 'Oregon State University', qualification: 'B.S. Industrial Engineering', year: 2014 }],
    sameFileFor: [],
    verifiedBy,
    on,
  })
const BRIGHTMOOR = { id: 'co-brightmoor', name: 'Brightmoor Staffing' }

const db = (already: boolean) => ({ notification: { findFirst: vi.fn(async () => (already ? { id: 'old' } : null)) } }) as never

beforeEach(() => h.notify.mockClear())

describe('the worker is told about her degree the moment HR is warned', () => {
  it('a worker whose degree year contradicts her résumé is told in words what was asked and why, the moment HR is warned', async () => {
    const said = await tellTheWorkerAboutHerDegree({ personId: 'p-rosa', firms: [BRIGHTMOOR], reading: rosa(2016), entityId: 'v1' }, db(false))
    expect(h.notify).toHaveBeenCalledTimes(1)
    const sent = (h.notify.mock.calls[0] as unknown as [{ personId: string; title: string; body: string; companyId: string }])[0]
    expect(sent.personId).toBe('p-rosa')
    expect(sent.companyId).toBe('co-brightmoor')
    expect(sent.title).toBe(DEGREE_TOLD_TITLE)
    expect(sent.body).toContain('Brightmoor Staffing is checking your degree certificate: the year on it is not the year on your résumé.')
    expect(said).toEqual([sent.body])
  })

  it('what she is told never carries what HR was told: no doors, no years as HR reads them', () => {
    const [s] = degreeToldToYou(rosa(2016), [BRIGHTMOOR])
    expect(s.body).not.toContain(DEGREE_DOORS)
    expect(s.body).not.toContain('2016')
    expect(s.body).not.toContain('2014')
  })

  it('the same sentence from the same firm is not said to her twice when the paper is read again on accept', async () => {
    await tellTheWorkerAboutHerDegree({ personId: 'p-rosa', firms: [BRIGHTMOOR], reading: rosa(2016) }, db(true))
    expect(h.notify).not.toHaveBeenCalled()
  })

  it('a degree whose year agrees with her résumé tells her nothing', () => {
    expect(degreeToldToYou(rosa(2014), [BRIGHTMOOR])).toEqual([])
  })

  it('a degree a provider verified tells her nothing, because nothing is being checked', () => {
    expect(degreeToldToYou(rosa(2016, { provider: 'National Student Clearinghouse', reference: 'NSC-1', on }), [BRIGHTMOOR])).toEqual([])
  })

  it('a firm named twice tells her once', () => {
    expect(degreeToldToYou(rosa(2016), [BRIGHTMOOR, BRIGHTMOOR])).toHaveLength(1)
  })

  it('every door that reads a degree against the record also tells the worker: her own upload, her answer to a request, HR’s accept on Paperwork and on a document request', () => {
    const root = join(__dirname, '..', '..', 'src', 'app', 'api')
    for (const f of ['me/papers/route.ts', 'documents/[id]/act.ts', 'documents/[id]/examine/route.ts', 'packets/[id]/review/route.ts']) {
      const src = readFileSync(join(root, f), 'utf8')
      expect(src, f).toContain('degreeOnRecord(')
      expect(src, f).toContain('tellTheWorkerAboutHerDegree(')
    }
  })
})
