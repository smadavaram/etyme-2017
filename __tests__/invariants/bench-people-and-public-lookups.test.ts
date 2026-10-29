import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { benchNote } from '@/app/api/blacklist/known'

/**
 * Two follow-ups to supply's one bench ask (d14da4753, 2026-10-29):
 * a person asked onto a bench is no longer seated at the firm before her
 * yes, so the do-not-return picker reads the listing; and an address
 * looked up from a public page has an access-log name of its own.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the do-not-return picker reads the bench the bench page reads', () => {
  it('the do-not-return picker names a person asked onto the bench and not yet answered', () => {
    expect(benchNote({ state: 'INVITED', revokedAt: null })).toEqual({ note: 'Asked onto this firm’s bench, no answer yet', rank: 2 })
    const src = read('src/app/api/blacklist/known.ts')
    expect(src).toMatch(/prisma\.benchListing\.findMany\(/)
    expect(src).toMatch(/state: \{ in: \['INVITED', 'GRANTED', 'DECLINED'\] \}/)
  })

  it('names a person on the bench, and one who said no, each in a sentence of how the firm knows them', () => {
    expect(benchNote({ state: 'GRANTED', revokedAt: null })?.note).toBe('On this firm’s bench')
    expect(benchNote({ state: 'DECLINED', revokedAt: null })?.note).toBe('Said no to this firm’s bench')
  })

  it('offers nobody from a listing that was withdrawn or is in a state it does not know', () => {
    expect(benchNote({ state: 'GRANTED', revokedAt: new Date('2026-10-01') })).toBeNull()
    expect(benchNote({ state: 'SOMETHING_ELSE', revokedAt: null })).toBeNull()
  })
})

describe('an address looked up from a public page has a name of its own in the access log', () => {
  it('lists "looked up an address from a public page" as its own access-log action', () => {
    expect(read('src/lib/access-log.ts')).toMatch(/\| 'PUBLIC_PAGE_ADDRESS_LOOKUP'/)
  })

  it('says in the security posture that the lookup is written before the reply, with no actor', () => {
    const posture = read('docs/security-posture.md')
    expect(posture).toContain('`PUBLIC_PAGE_ADDRESS_LOOKUP`')
    expect(posture).toMatch(/written before the reply goes out/)
    expect(posture).toMatch(/names no actor/)
  })
})

describe('a twin read names which twin made it, for both twins', () => {
  it('the supplier’s twin logs its reads as the supplier’s twin under the role it acts for', async () => {
    const { actorColumns } = await import('@/lib/access-log')
    expect(actorColumns({ actorKind: 'TWIN', actorTwinKind: 'SUPPLIER' })).toEqual({ actorKind: 'TWIN', actorTwinKind: 'SUPPLIER' })
    expect(actorColumns({ actorKind: 'TWIN', actorTwinKind: 'PROGRAM_MANAGER' })).toEqual({ actorKind: 'TWIN', actorTwinKind: 'PROGRAM_MANAGER' })
  })

  it('a twin row that names no twin is still refused, whichever twin it would have been', async () => {
    const { actorColumns } = await import('@/lib/access-log')
    expect(() => actorColumns({ actorKind: 'TWIN' })).toThrow(/must name which twin/)
    expect(() => actorColumns({ actorKind: 'TWIN', actorTwinKind: '' as never })).toThrow(/must name which twin/)
  })
})
