import { describe, it, expect } from 'vitest'
import { findingFor, isCredential, CREDENTIAL_FINDING_NEEDS } from '@/lib/credential-chase'
import { credentialsToChase, type HeldCredential } from '@/lib/document-stages'
import { credentialKeys } from '@/lib/contract-clearance'
import { packetByKey } from '@/lib/packets'

/**
 * What the nightly chase asks for, of whom, and in whose words.
 *
 * The arithmetic that decides whether it is time to ask is regulation's
 * (`credentialsToChase`) and is tested beside it. What is tested here is
 * the half that was missing until today: the chase turning that answer
 * into something a desk reads and a person can act on, and knowing which
 * rows count as a license in the first place.
 */

const on = new Date('2026-09-17T09:00:00Z')
const inDays = (n: number) => new Date(on.getTime() + n * 86_400_000)

function license(over: Partial<HeldCredential> = {}): HeldCredential {
  return {
    type: 'PROFESSIONAL_LICENSE',
    label: 'Professional license',
    status: 'CLEAR',
    issuedAt: inDays(-700),
    validFrom: inDays(-700),
    expiresAt: inDays(24),
    verifiedAt: inDays(-60),
    number: 'RN 154-882',
    state: 'WI',
    issuer: 'Wisconsin Board of Nursing',
    ...over,
  }
}

const her = { id: 'person_colleen', name: 'Colleen Byrne' }
const chaseFor = (over: Partial<HeldCredential> = {}) =>
  credentialsToChase([license(over)], credentialKeys(), on)[0]

describe('The nightly chase for a license somebody practices on', () => {
  it('tells the desk that a license running out in twenty-four days is worth knowing about, and does not call it blocking', () => {
    const finding = findingFor(her, 'company_halcyon', chaseFor())
    expect(finding.kind).toBe('CREDENTIAL_EXPIRING')
    expect(finding.urgency).toBe('WORTH_KNOWING')
    expect(finding.daysUntil).toBe(24)
  })

  it('calls a license lapsing inside a fortnight soon, because a board takes weeks and a fortnight is not weeks', () => {
    expect(findingFor(her, 'company_halcyon', chaseFor({ expiresAt: inDays(9) })).urgency).toBe('SOON')
  })

  it('calls a license that has already lapsed blocking, because nobody can be started on it', () => {
    const finding = findingFor(her, 'company_halcyon', chaseFor({ expiresAt: inDays(-3) }))
    expect(finding.kind).toBe('CREDENTIAL_EXPIRED')
    expect(finding.urgency).toBe('BLOCKING')
    expect(finding.detail).toContain('unlicensed practice')
  })

  it('names the license, its number and the state it was issued in, so a compliance officer can check it against a register', () => {
    const finding = findingFor(her, 'company_halcyon', chaseFor())
    expect(finding.headline).toContain('RN 154-882')
    expect(finding.detail).toContain('WI')
    expect(finding.headline).toContain('Colleen Byrne')
  })

  it('says to the desk what will happen, rather than repeating the sentence written to the person', () => {
    const chase = chaseFor()
    const finding = findingFor(her, 'company_halcyon', chase)
    // The chase's own sentence is second person — "Your license runs
    // out" — and goes to whoever holds the license. The desk is a third
    // party to it and reads about her.
    expect(chase.says).toContain('Your')
    expect(finding.detail).toContain("Colleen Byrne's")
    expect(finding.detail).not.toContain('Your ')
  })

  it('chases a license on file with no expiry date against it, and says nobody can tell whether she is licensed today', () => {
    const finding = findingFor(her, 'company_halcyon', chaseFor({ expiresAt: null }))
    expect(finding.kind).toBe('CREDENTIAL_UNDATED')
    expect(finding.daysUntil).toBeNull()
    expect(finding.detail).toContain('licensed today')
  })

  it('raises the finding against the person rather than against the document, because a renewal is a new row', () => {
    const finding = findingFor(her, 'company_halcyon', chaseFor())
    expect(finding.subjectType).toBe('Person')
    expect(finding.subjectId).toBe('person_colleen')
  })

  it('asks the watcher to act rather than only to speak', () => {
    expect(findingFor(her, 'company_halcyon', chaseFor()).action).toBe('REOPEN_PACKET')
  })

  it('sends the finding to the firm that places her, which is the company the caller resolved', () => {
    expect(findingFor(her, 'company_halcyon', chaseFor()).companyId).toBe('company_halcyon')
  })

  it('tells whoever looks after contractors, not the desk that chases suppliers for their insurance', () => {
    expect(CREDENTIAL_FINDING_NEEDS).toBe('consultants.write')
  })

  it('treats a state professional license as a license to practice', () => {
    expect(isCredential({ type: 'PROFESSIONAL_LICENSE' })).toBe(true)
  })

  it('does not treat a background check or an I-9 as a license to practice', () => {
    expect(isCredential({ type: 'BACKGROUND_CHECK' })).toBe(false)
    expect(isCredential({ type: 'I9_EVERIFY' })).toBe(false)
  })

  it('chases a credential a client defined itself, where the client says it blocks and the candidate supplies it', () => {
    expect(
      isCredential({
        type: 'OTHER',
        documentType: { purpose: 'COMPLIANCE', blocks: true, suppliedBy: 'CANDIDATE' },
      })
    ).toBe(true)
  })

  it('leaves a client credential alone where the client says it does not stop work', () => {
    expect(
      isCredential({
        type: 'OTHER',
        documentType: { purpose: 'COMPLIANCE', blocks: false, suppliedBy: 'CANDIDATE' },
      })
    ).toBe(false)
  })

  it('leaves a document the supplier owes alone, because a license is issued to a person and not to a firm', () => {
    expect(
      isCredential({
        type: 'OTHER',
        documentType: { purpose: 'COMPLIANCE', blocks: true, suppliedBy: 'SUPPLIER' },
      })
    ).toBe(false)
  })

  it('asks with the packet regulation wrote, which asks for one thing and says why', () => {
    const spec = packetByKey('CREDENTIAL_RENEWAL')!
    expect(spec.subject).toBe('PERSON')
    expect(spec.items).toHaveLength(1)
    expect(spec.items[0].key).toBe('PROFESSIONAL_LICENSE')
    expect(spec.preamble).toContain('lapsed license')
  })
})
