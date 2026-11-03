import { describe, it, expect } from 'vitest'
import { contractClearance, heldFrom } from '@/lib/contract-clearance'

/**
 * Whether somebody may start, on paperwork.
 *
 * A checklist rather than a signing workflow. The line that matters is
 * the one between what the law requires before a first day and what a
 * contract requires — the first blocks, the second warns and proceeds
 * with a reason. A system that blocks on everything gets switched off;
 * one that blocks on nothing is decoration.
 */

const on = new Date('2026-09-10T12:00:00Z')
const inDays = (n: number) => new Date(on.getTime() + n * 86_400_000)

const clear = (type: string, expiresAt: Date | null = null) => ({ type, status: 'CLEAR', expiresAt })
// Checked, not merely filed. The cover gate chases a valid certificate
// nobody has confirmed looking at — a deliberate rule — so "insured"
// here means somebody signed off on it.
const gl = (expiresAt: Date) => ({ type: 'INSURANCE_GL', status: 'CLEAR', expiresAt, verifiedAt: on })
const wc = (expiresAt: Date) => ({ type: 'INSURANCE_WC', status: 'CLEAR', expiresAt, verifiedAt: on })

/** A supplier whose cover is fine, so only the person side is under test. */
const insured = [gl(inDays(200)), wc(inDays(200))]
const signedNda = [{ key: 'NDA', expiresAt: null, accepted: true }]

const verdict = (
  personVerifications: { type: string; status: string; expiresAt: Date | null }[],
  supplierCertificates = insured,
  extraHeld = signedNda
) =>
  contractClearance({
    personName: 'Priya Raman',
    personVerifications,
    supplierName: 'Techpeple',
    supplierCertificates,
    clientName: 'Harlow Health',
    on,
    extraHeld,
  })

describe('what blocks a start', () => {
  it('a missing I-9 blocks — nobody may work without authorization', () => {
    const v = verdict([clear('BACKGROUND_CHECK', inDays(300))])
    expect(v.outcome).toBe('BLOCK')
    expect(v.blocking.map((b) => b.key)).toContain('I9_EVERIFY')
    expect(v.says).toMatch(/cannot start/)
  })

  it('a lapsed general liability certificate blocks, however complete the person is', () => {
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))], [gl(inDays(-3)), wc(inDays(200))])
    expect(v.outcome).toBe('BLOCK')
    expect(v.cover.outcome).toBe('BLOCK')
    expect(v.blocking).toEqual([]) // the person is fine; it is the supplier
  })

  it('cover that was never recorded warns and proceeds with a reason — unknown is not lapsed', () => {
    // The ratified wording is "lapsed supplier insurance". A firm
    // recording a contract that started last month, whose certificate
    // nobody has asked for yet, is chased — not stopped.
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))], [])
    expect(v.outcome).toBe('WARN')
    expect(v.cover.outcome).toBe('WARN')
    expect(v.cover.blocking).toEqual([])
    expect(v.cover.chasing.map((c) => c.key)).toEqual(expect.arrayContaining(['INSURANCE_GL', 'INSURANCE_WC']))
  })

  it('an expired background check does not block — it is contractual, not law', () => {
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(-10))])
    expect(v.outcome).toBe('WARN')
    expect(v.blocking).toEqual([])
    expect(v.chasing.map((c) => c.key)).toContain('BACKGROUND_CHECK')
  })
})

describe('what warns and proceeds', () => {
  it('a missing background check warns and can proceed with a reason', () => {
    const v = verdict([clear('I9_EVERIFY')])
    expect(v.outcome).toBe('WARN')
    expect(v.chasing.map((c) => c.key)).toContain('BACKGROUND_CHECK')
    expect(v.says).toMatch(/with a reason/)
  })

  it('a required item nothing here can hold yet is listed, not chased — a warning that always fires is noise', () => {
    // Nothing in the system records a signed NDA today. Warning on it
    // would force a reason onto every activation, forever, which is how a
    // warning becomes a click. It is on the list, marked needed, and it
    // starts counting the day something can hold one.
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))], insured, [])
    expect(v.outcome).toBe('PASS')
    expect(v.chasing).toEqual([])
    expect(v.items.find((i) => i.key === 'NDA')?.state).toBe('NEEDED')
  })

  it('the moment a signed NDA can be held, a missing one is chased — never blocked', () => {
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))], insured, [
      { key: 'NDA', expiresAt: null, accepted: false },
    ])
    expect(v.outcome).toBe('WARN')
    expect(v.chasing.map((c) => c.key)).toEqual(['NDA'])
    expect(v.blocking).toEqual([])
  })

  it('an optional item that is missing neither blocks nor warns', () => {
    // Drug screening is required: false in the packet.
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))])
    expect(v.outcome).toBe('PASS')
    expect(v.items.find((i) => i.key === 'DRUG_SCREENING')?.state).toBe('NEEDED')
  })
})

describe('what is already on file', () => {
  it('with everything required on file the person is cleared to start', () => {
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))])
    expect(v.outcome).toBe('PASS')
    expect(v.blocking).toEqual([])
    expect(v.chasing).toEqual([])
    expect(v.fix).toBeNull()
    expect(v.says).toMatch(/cleared to start/)
  })

  it('a held I-9 satisfies the right-to-work item too, so it is not asked for twice', () => {
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))])
    expect(v.items.find((i) => i.key === 'RIGHT_TO_WORK')?.state).toBe('ALREADY_HELD')
  })

  it('a check still running does not count as held', () => {
    const held = heldFrom([{ type: 'I9_EVERIFY', status: 'PENDING' }])
    expect(held.every((h) => !h.accepted)).toBe(true)
    const v = verdict([{ type: 'I9_EVERIFY', status: 'PENDING', expiresAt: null }])
    expect(v.outcome).toBe('BLOCK')
  })

  it('every item on the checklist is listed, held or not, so a screen can show all of it', () => {
    const v = verdict([clear('I9_EVERIFY')])
    const keys = v.items.map((i) => i.key)
    for (const k of ['RIGHT_TO_WORK', 'I9_EVERIFY', 'BACKGROUND_CHECK', 'DRUG_SCREENING', 'NDA']) {
      expect(keys).toContain(k)
    }
  })
})

describe('what it says', () => {
  it('the verdict names what is missing and what to do, in one sentence', () => {
    const v = verdict([])
    expect(v.says).toMatch(/Priya Raman cannot start without/)
    expect(v.fix).toMatch(/on file, then activate/)
  })

  it('a warning says the contract can start with a reason recorded', () => {
    const v = verdict([clear('I9_EVERIFY')])
    expect(v.says).toMatch(/can start with a reason recorded/)
    expect(v.fix).toMatch(/or activate with a reason/)
  })
})

describe('a checklist never reports a check as verified without the provider’s name on it', () => {
  // The founder, 2026-09-22: "background check companies are the ones
  // that confirm background pass or fail — the risk is passed there to
  // background check companies." `Verification.provider` has existed
  // since the table did and nothing in production writes it, so a green
  // row on a placement checklist could be Sterling's report or a desk
  // that clicked a button. The row now says which.
  const rendered = (over: Record<string, unknown> = {}) => ({
    type: 'BACKGROUND_CHECK',
    status: 'CLEAR',
    expiresAt: inDays(300),
    provider: 'Sterling',
    referenceId: '4471',
    verifiedAt: new Date('2026-03-12T00:00:00Z'),
    ...over,
  })

  it('names the screening company, the day and the reference on a background check that is on file', () => {
    const v = verdict([clear('I9_EVERIFY'), rendered() as never])
    const item = v.items.find((i) => i.key === 'BACKGROUND_CHECK')!
    expect(item.renderedBy).toBe('Sterling')
    expect(item.note).toBe('Sterling reported clear on Mar 12, 2026, reference 4471.')
  })

  it('says a background check with nobody named on it is this firm’s own note rather than a provider’s report', () => {
    const v = verdict([clear('I9_EVERIFY'), rendered({ provider: null, referenceId: null }) as never])
    const item = v.items.find((i) => i.key === 'BACKGROUND_CHECK')!
    expect(item.renderedBy).toBeNull()
    expect(item.note).toContain('No screening company is named on it')
  })

  it('moves no verdict either way, because a background check warns and has always warned', () => {
    const named = verdict([clear('I9_EVERIFY'), rendered() as never])
    const unnamed = verdict([clear('I9_EVERIFY'), rendered({ provider: null }) as never])
    expect(named.outcome).toBe(unnamed.outcome)
    expect(named.blocking.map((b) => b.key)).toEqual(unnamed.blocking.map((b) => b.key))
    expect(named.chasing.map((c) => c.key)).toEqual(unnamed.chasing.map((c) => c.key))
  })

  it('leaves a document nobody renders a verdict on saying what it always said', () => {
    const v = verdict([clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(300))])
    const i9 = v.items.find((i) => i.key === 'I9_EVERIFY')!
    expect(i9.renderedBy).toBeUndefined()
    expect(i9.renderedSays).toBeUndefined()
  })

  it('says a background check nobody has filed is not on file, rather than claiming somebody rendered nothing', () => {
    const v = verdict([clear('I9_EVERIFY')])
    const item = v.items.find((i) => i.key === 'BACKGROUND_CHECK')!
    expect(item.renderedBy).toBeUndefined()
    expect(item.note).not.toContain('reported')
  })
})

// ── Where the work is done (founder, 2026-11-03) ──────────────────────
//
// "Especially for the onsite jobs — offshore jobs is fine." The start asks
// for the work-authorization paper of the country the line's work is done
// in, read through lib/work-country.
import { workCountryOf } from '@/lib/work-country'
import { workAuthorizationFor } from '@/lib/document-stages/countries'
import { whereWorkIsDone } from '@/lib/document-stages/where-work-is-done'
import { startPreview } from '@/lib/contract-clearance'

describe('the start reads the country where the work is done', () => {
  const at = (country: string, offshore = country !== 'US') => ({ country, offshore })
  const lineSet = (keys: string[]) => ({
    side: 'BUY' as const,
    shape: 'W2' as const,
    order: null,
    says: 'This line asks for the start packet.',
    items: keys.map((key) => ({ key, label: key, required: true, blocks: true, owedBy: 'WORKER' as const, from: 'DEFAULT' as const })) as never,
  })
  const offshoreStart = (personVerifications: { type: string; status: string; expiresAt: Date | null }[], extraHeld = signedNda) =>
    contractClearance({
      personName: 'Ananya Iyer', personVerifications, supplierName: 'Pune Talent', supplierCertificates: insured,
      clientName: 'Harlow Health', on, extraHeld, workCountry: at('IN'),
    })

  it('a W2 line worked from India asks for no I-9 and says India’s set is not confirmed', () => {
    const v = offshoreStart([clear('BACKGROUND_CHECK', inDays(300))])
    const keys = v.items.map((i) => i.key)
    expect(keys).not.toContain('I9_EVERIFY')
    expect(keys).not.toContain('RIGHT_TO_WORK')
    expect(v.outcome).toBe('PASS')
    expect(v.says).toContain('No work-authorization paper is enforced for work done in India yet: India’s paper set is not confirmed.')
    expect(v.workAuthorization?.enforced).toBe(false)
    // And the line's set on screen says it at its top.
    const set = whereWorkIsDone(lineSet(['I9_EVERIFY', 'RIGHT_TO_WORK', 'NDA']), at('IN'))
    expect(set.items.map((i) => i.key)).toEqual(['NDA'])
    expect(set.says).toBe('This line asks for the start packet. No work-authorization paper is enforced for work done in India yet: India’s paper set is not confirmed.')
  })

  it('a W2 line at a US site asks for the I-9 as before', () => {
    const v = contractClearance({
      personName: 'Priya Raman', personVerifications: [clear('BACKGROUND_CHECK', inDays(300))], supplierName: 'Techpeple',
      supplierCertificates: insured, clientName: 'Harlow Health', on, extraHeld: signedNda, workCountry: at('US'),
    })
    expect(v.outcome).toBe('BLOCK')
    expect(v.blocking.map((b) => b.key)).toContain('I9_EVERIFY')
    expect(v.workAuthorization?.enforced).toBe(true)
    expect(v.says).not.toMatch(/not confirmed/)
    // Nothing named about the country is the US set, unchanged.
    expect(verdict([clear('BACKGROUND_CHECK', inDays(300))]).blocking.map((b) => b.key)).toContain('I9_EVERIFY')
  })

  it('a line worked from the UK asks for the right-to-work check and never an I-9', () => {
    for (const country of ['GB', 'GB-NIR']) {
      expect(workAuthorizationFor(country).keys, country).toEqual(['RIGHT_TO_WORK'])
      const v = contractClearance({
        personName: 'Siobhan Kerr', personVerifications: [clear('BACKGROUND_CHECK', inDays(300))], supplierName: 'Lagan Talent',
        supplierCertificates: insured, clientName: 'Harlow Health', on, extraHeld: signedNda, workCountry: at(country),
      })
      expect(v.items.map((i) => i.key), country).not.toContain('I9_EVERIFY')
      expect(v.blocking.map((b) => b.key), country).toEqual(['RIGHT_TO_WORK'])
      expect(v.outcome, country).toBe('BLOCK')
    }
  })

  it('a remote line worked from the site’s own country asks for the site’s set', () => {
    const wc = workCountryOf({ workMode: 'REMOTE', siteCountry: 'US', personCountry: 'US' })
    expect(wc).toMatchObject({ country: 'US', offshore: false })
    const v = contractClearance({
      personName: 'Dana Ruiz', personVerifications: [clear('BACKGROUND_CHECK', inDays(300))], supplierName: 'Techpeple',
      supplierCertificates: insured, clientName: 'Harlow Health', on, extraHeld: signedNda, workCountry: wc,
    })
    expect(v.blocking.map((b) => b.key)).toContain('I9_EVERIFY')
  })

  it('an offshore line’s start is not held for authorization and still holds for the papers the set does ask', () => {
    // No NDA signed, and the line's order asked for one: still warned.
    const v = contractClearance({
      personName: 'Ananya Iyer', personVerifications: [clear('BACKGROUND_CHECK', inDays(300))], supplierName: 'Pune Talent',
      supplierCertificates: insured, clientName: 'Harlow Health', on, extraHeld: [], workCountry: at('IN'),
      requirements: [
        { key: 'I9_EVERIFY', label: 'I-9 and E-Verify', required: true, blocks: true, owedBy: 'WORKER', from: 'DEFAULT' },
        { key: 'NDA', label: 'Signed non-disclosure agreement', required: true, blocks: false, owedBy: 'WORKER', from: 'ORDER' },
      ] as never,
    })
    expect(v.blocking).toEqual([])
    expect(v.items.map((i) => i.key)).not.toContain('I9_EVERIFY')
    expect(v.chasing.map((c) => c.key)).toContain('NDA')
    expect(v.outcome).toBe('WARN')
    // A missing background check on an offshore line is still asked.
    expect(offshoreStart([]).chasing.map((c) => c.key)).toContain('BACKGROUND_CHECK')
  })

  it('the nightly chase never asks an offshore worker for an I-9', () => {
    // The nightly letter is drawn from the clearance's items still needed
    // (lib/notify/documents) and the start's ask from `startPreview`; an
    // offshore line carries no I-9 in either.
    const v = offshoreStart([])
    expect(v.items.filter((i) => i.required && i.state === 'NEEDED').map((i) => i.key)).not.toContain('I9_EVERIFY')
    const preview = startPreview({
      personName: 'Ananya Iyer', personVerifications: [], supplierName: 'Pune Talent', supplierCertificates: insured,
      clientName: 'Harlow Health', on, extraHeld: signedNda, workCountry: at('IN'),
    } as never)
    expect(preview.askOfPerson.map((a) => a.key)).not.toContain('I9_EVERIFY')
    expect(preview.askOfPerson.map((a) => a.key)).not.toContain('RIGHT_TO_WORK')
  })
})
