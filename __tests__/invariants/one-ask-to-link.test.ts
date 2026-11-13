import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mayNameCounterparty, mayWriteOrder, notYoursToNameSays, type CompanyStanding } from '@/lib/off-system'
import { onEtymeAskToLinkSays } from '@/lib/supplier-list'

/**
 * One ask to link, said one way, and a company named by id that the
 * caller has nothing to do with answered as an id that is not there
 * (review of the neutral Company wave, 2026-11-13).
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const ME = 'co-veritan'
const shell = (id: string, name: string, listedById: string | null): CompanyStanding =>
  ({ id, name, kind: 'CLIENT', claimedAt: null, listedById }) as CompanyStanding
const onEtyme = (id: string, name: string): CompanyStanding =>
  ({ id, name, kind: 'VENDOR', claimedAt: new Date(), listedById: null }) as CompanyStanding

describe('a firm already on Etyme is answered the same way at every door that adds a company', () => {
  it('the Companies, Clients and Suppliers doors say a firm is on Etyme already from one sentence, never a copy of it', () => {
    for (const file of ['src/app/api/companies/route.ts', 'src/app/api/clients/route.ts', 'src/app/api/suppliers/route.ts']) {
      const s = src(file)
      expect(s, file).toContain('onEtymeAskToLinkSays(')
      expect(s, file).not.toContain('That company is on Etyme already, so no copy')
    }
    expect(onEtymeAskToLinkSays('customer')).toBe(
      'That company is on Etyme already, so no copy of it was made. Ask them to link, as your customer: they are asked, and nothing is on either list until they say yes.'
    )
  })

  it('an ask to link is written and heard in one place, and the ask under Companies goes through it', () => {
    const route = src('src/app/api/trade-links/route.ts')
    expect(route).toContain('askToLink(')
    expect(route).not.toContain('tradeLinkRequest.create')
    expect(route).not.toContain('async function answerersAt')
    expect(src('src/app/api/trade-links/ask.ts')).toContain('tradeLinkRequest.create')
  })
})

describe('a yes to link is a yes to link and nothing more', () => {
  it('the answer to an ask to link never writes an agreement, signed or not', () => {
    const route = src('src/app/api/trade-links/[id]/route.ts')
    expect(route).not.toContain('masterAgreement')
    expect(route).not.toContain('signedAt')
  })

  it('what stands behind an ask never reads the client’s own checklist for a signature', () => {
    const ask = src('src/app/api/trade-links/ask.ts')
    expect(ask).not.toContain('signedOnFile')
    expect(ask).not.toContain('checklist')
  })

  it('every refusal to answer an ask is written to the access log before it is sent', () => {
    const route = src('src/app/api/trade-links/[id]/route.ts')
    expect(route).toContain('await recordRefusal(')
  })
})

describe('a company named by id that you have nothing to do with', () => {
  const said = 'We could not find that client. Add them from Companies first; they do not need to be on Etyme.'

  it('naming another firm’s record as your client is refused as an id that is not there, and never says the name or whose record it is', () => {
    const v = mayNameCounterparty({ callerCompanyId: ME, other: shell('co-h', 'Halvard Industries', 'co-tapin'), relationshipExists: false, as: 'client' })
    expect(v.ok).toBe(false)
    expect(v.says).toBe(said)
    expect(v.says).not.toMatch(/Halvard|another firm|register/)
  })

  it('naming a firm on Etyme you have nothing with is refused in the same sentence', () => {
    const v = mayNameCounterparty({ callerCompanyId: ME, other: onEtyme('co-q', 'Quillon Staffing'), relationshipExists: false, as: 'supplier' })
    expect(v.says).toBe(notYoursToNameSays('supplier'))
    expect(v.says).not.toContain('Quillon')
  })

  it('naming another firm’s record that has not been classified is refused in the same sentence, never its name', () => {
    const v = mayNameCounterparty({
      callerCompanyId: ME,
      other: { ...shell('co-r', 'Rivermark Partners', 'co-tapin'), kind: 'UNCLASSIFIED' } as CompanyStanding,
      relationshipExists: false,
      as: 'client',
      held: { positions: [], notClassified: true, recorded: false },
    })
    expect(v.says).toBe(said)
  })

  it('a firm may still name its own record and a firm it works with, as before', () => {
    expect(mayNameCounterparty({ callerCompanyId: ME, other: shell('co-h', 'Halvard Industries', ME), relationshipExists: false, as: 'client' }).ok).toBe(true)
    expect(mayNameCounterparty({ callerCompanyId: ME, other: onEtyme('co-q', 'Quillon Staffing'), relationshipExists: true, as: 'client' }).ok).toBe(true)
  })

  it('a purchase order to another firm’s record is refused as a supplier that is not there, never naming it', () => {
    const v = mayWriteOrder({
      callerCompanyId: ME,
      buyer: onEtyme(ME, 'Veritan Talent'),
      seller: { ...shell('co-h', 'Halvard Industries', 'co-tapin'), kind: 'VENDOR' } as CompanyStanding,
      sellerStanding: 'NONE',
    })
    expect(v.ok).toBe(false)
    expect(v.says).toBe('We could not find that supplier. Add them from Companies first; they do not need to be on Etyme.')
  })

  it('a purchase order to a firm on Etyme you do not buy from still says to recommend them first, as before', () => {
    const v = mayWriteOrder({ callerCompanyId: ME, buyer: onEtyme(ME, 'Veritan Talent'), seller: onEtyme('co-b', 'Brightmoor Staffing'), sellerStanding: 'NONE' })
    expect(v.says).toContain('Recommend them as a supplier first')
  })
})
