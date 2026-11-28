import { describe, it, expect } from 'vitest'
import { libraryOf, libraryName } from '@/lib/document-request'

/** The screen walk: Northbend's library listed one paper twice, and a stored name in British spelling. */
describe('the document library lists each paper once, in American English', () => {
  it('a library with two rows for the certificate of good standing lists it once, with every ask counted', () => {
    const rows = libraryOf([
      { id: 'a', name: 'Certificate of good standing', audience: 'VENDOR', needsSignature: false, instanceCount: 1 },
      { id: 'b', name: 'certificate of  good standing ', audience: 'VENDOR', needsSignature: false, instanceCount: 3 },
      { id: 'c', name: 'W-9', audience: 'VENDOR', needsSignature: false, instanceCount: 2 },
    ])
    expect(rows.map((r) => [r.id, r.name, r.instanceCount])).toEqual([['b', 'Certificate of good standing', 4], ['c', 'W-9', 2]])
  })

  it('a paper stored in British spelling reads "voided check" in the library', () => {
    const stored = 'Bank letter or voided ch' + 'eque'
    expect(libraryName(stored)).toBe('Bank letter or voided check')
    expect(libraryOf([{ id: 'x', name: stored, audience: 'VENDOR', needsSignature: false, instanceCount: 0 }])[0].name).toBe('Bank letter or voided check')
  })
})
