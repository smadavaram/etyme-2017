import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { readsOnlyWhatItTyped, wordsAreTheFirms, typedOnly, nameItTyped } from '@/lib/consultant-portfolio/before-her-yes'
import { nothingNamed } from '@/lib/consultant-portfolio/bench-ask'

/**
 * Before her yes, a firm reads only what it typed (fix list A4, 2026-11-15).
 * Made-up people and firms only.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const asked = { isSubject: false, seatHere: false, listingState: 'INVITED', ownAccount: false, madeHere: false, otherFirmsEver: 0 }
const listing = { firmName: 'H. Okafor', firmHeadline: 'Study monitor', firmSkills: ['Site visits'], firmLocation: null, firmNotes: 'Met at a referral' }

describe('what a firm reads about somebody before she says yes', () => {
  it('a firm that has only asked somebody reads the name it typed and nothing of hers', () => {
    expect(readsOnlyWhatItTyped({ ...asked, ownAccount: true })).toBe(true)
    const read = typedOnly(listing, 'hana.okafor@example.test')
    expect(read).toMatchObject({ name: 'H. Okafor', headline: 'Study monitor', skills: ['Site visits'], notes: 'Met at a referral' })
    expect(read.own).toEqual({ headline: null, skills: [], location: null })
  })

  it('her own name, work authorization and education are not in the reply before her yes', () => {
    const read = typedOnly(listing, 'hana.okafor@example.test')
    expect(read.workAuth).toBeNull()
    expect(read.education).toBeNull()
    expect(read.availableFrom).toBeNull()
    expect(read.rateFloor).toBeNull()
    expect(read.visibility).toBeNull()
  })

  it('a listing from before the name was kept reads the address the firm asked at', () => {
    expect(nameItTyped({ firmName: null }, 'hana.okafor@example.test')).toBe('hana.okafor@example.test')
    expect(nameItTyped({ firmName: '  ' }, 'hana.okafor@example.test')).toBe('hana.okafor@example.test')
  })

  it('a record another firm made is read only by the asking firm’s listing before her yes', () => {
    expect(readsOnlyWhatItTyped({ ...asked, otherFirmsEver: 1 })).toBe(true)
  })

  it('the firm that made the record still reads what it typed', () => {
    expect(wordsAreTheFirms({ ownAccount: false, madeHere: true, otherFirmsEver: 2 })).toBe(true)
    expect(readsOnlyWhatItTyped({ ...asked, madeHere: true, otherFirmsEver: 2 })).toBe(false)
    // A record nobody else ever listed, with no account, holds only this firm's words.
    expect(readsOnlyWhatItTyped(asked)).toBe(false)
  })

  it('a record the firm made reads only its listing once she takes an account', () => {
    expect(readsOnlyWhatItTyped({ ...asked, madeHere: true, ownAccount: true })).toBe(true)
  })

  it('after her yes the firm reads her record as before', () => {
    expect(readsOnlyWhatItTyped({ ...asked, ownAccount: true, listingState: 'GRANTED' })).toBe(false)
  })

  it('somebody who works at the firm, or reads her own record, reads it whole', () => {
    expect(readsOnlyWhatItTyped({ ...asked, ownAccount: true, seatHere: true })).toBe(false)
    expect(readsOnlyWhatItTyped({ ...asked, ownAccount: true, isSubject: true })).toBe(false)
  })

  it('an ask still waiting, or a no, names the name the firm typed, and only a yes shows hers', () => {
    expect(nothingNamed({ path: 'ALREADY_ASKED', own: 'Hana Okafor', listed: 'H. Okafor', typed: 'Hana O.' })).toBe('H. Okafor')
    expect(nothingNamed({ path: 'SAID_NO', own: 'Hana Okafor', listed: null, typed: 'Hana O.' })).toBe('Hana O.')
    expect(nothingNamed({ path: 'ALREADY_ON', own: 'Hana Okafor', listed: 'H. Okafor', typed: 'Hana O.' })).toBe('Hana Okafor')
  })

  it('every ask writes the name the firm typed on its own listing', () => {
    expect(src('src/lib/consultant-portfolio/bench-ask.ts')).toContain('firmName: name || null')
    expect(src('src/app/api/bench/listings/route.ts').match(/firmName: consultant\.person\.name/g)?.length).toBe(2)
    expect(src('src/app/api/bench/share/route.ts').match(/firmName: source\.consultant\.person\.name/g)?.length).toBe(2)
    expect(src('src/app/api/rolloff/[id]/resolve/route.ts').match(/firmName: personName/g)?.length).toBe(2)
  })

  it('every read of a person by a firm in supply’s routes goes through the one reader', () => {
    for (const f of [
      'src/app/api/consultants/route.ts',
      'src/app/api/consultants/[id]/route.ts',
      'src/app/api/consultants/[id]/rate-progression/route.ts',
      'src/app/api/bench/route.ts',
      'src/app/api/bench/listings/[id]/route.ts',
      'src/app/api/bench/listings/[id]/nudge/route.ts',
    ]) {
      expect(src(f), f).toContain("from '@/lib/consultant-portfolio/before-her-yes'")
    }
  })

  it('a search never matches her own name, headline, skills or work authorization before her yes', () => {
    const route = src('src/app/api/consultants/route.ts')
    expect(route).toContain("{ ...hers, person: { name: { contains: q, mode: 'insensitive' } } }")
    expect(route).toContain("{ ...hers, headline: { contains: q, mode: 'insensitive' } }")
    expect(route).toContain('{ ...hers, skills: { hasSome: [q] } }')
    expect(route).toContain('{ ...hers, skills: { hasEvery: skills } }')
    expect(route).toContain('andClauses.push({ ...hers, workAuth })')
  })
})
