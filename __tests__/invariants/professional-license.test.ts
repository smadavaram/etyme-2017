/**
 * A license to practice, and what a lapse does.
 *
 * `VerificationType.PROFESSIONAL_LICENSE` and the BUILT_IN document type
 * behind it shipped on 2026-09-16 with `blocks: true` and nothing reading
 * it — no packet asked for one, and no gate refused one. A travel nurse
 * seeded the same day, whose whole demo is that her state license runs out
 * inside her assignment, read as a warning on her own page and stopped
 * nothing anywhere. That is the compliance answer being wrong in the one
 * demo built to show compliance working.
 *
 * Decided BLOCK on 2026-09-17, against CLAUDE.md's own rule: BLOCK where
 * legally grounded, WARN and capture a reason everywhere else. A
 * registered nurse practicing on a lapsed state registration is
 * practicing without a license. The law says the work stops, no client
 * can waive it, and the board disciplines the worker before it reaches
 * anybody else — the same shape as lapsed supplier insurance, which
 * Addendum E already names.
 *
 * What is NOT a block, and the line is the point of this file: a license
 * that is in date today and runs out before the last day of the
 * assignment. She is licensed today. Refusing a start three weeks early
 * would stop work the law permits, which is the workaround trap. It warns
 * with the date named, and the nightly chase asks for the renewal.
 */

import { describe, it, expect } from 'vitest'
import {
  licenseGate,
  credentialsToChase,
  standingOf,
  nameCredential,
  type HeldCredential,
} from '@/lib/document-stages'
import { contractClearance, credentialKeys } from '@/lib/contract-clearance'
import { licensedOccupation, startPacketFor, packetByKey } from '@/lib/packets'
import type { DefinedType } from '@/lib/document-type'

const on = new Date('2026-09-17T00:00:00Z')
const inDays = (n: number) => new Date(on.getTime() + n * 86_400_000)

/** Colleen's row as the world seeds it: a WI RN license, dated. */
const rnLicense = (over: Partial<HeldCredential> = {}): HeldCredential => ({
  type: 'PROFESSIONAL_LICENSE',
  label: 'Professional license',
  status: 'CLEAR',
  issuedAt: inDays(-706),
  validFrom: inDays(-706),
  expiresAt: inDays(24),
  verifiedAt: inDays(-60),
  number: 'RN 154-882',
  state: 'WI',
  issuer: 'Wisconsin Board of Nursing',
  ...over,
})

const goodCover = [
  { type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: inDays(300), verifiedAt: on },
  { type: 'INSURANCE_WC', status: 'CLEAR', expiresAt: inDays(300), verifiedAt: on },
]

/** The person-side paperwork a start needs, so nothing else is blocking. */
const cleanPapers = [
  { type: 'I9_EVERIFY', status: 'CLEAR', issuedAt: inDays(-60), verifiedAt: inDays(-59) },
  { type: 'BACKGROUND_CHECK', status: 'CLEAR', expiresAt: inDays(300) },
]

const startFor = (role: string | null, verifications: any[], extra: Record<string, unknown> = {}) =>
  contractClearance({
    personName: 'Colleen Byrne',
    personVerifications: verifications,
    supplierName: 'Halcyon Health Staffing',
    supplierCertificates: goodCover,
    clientName: 'Harlow Health',
    role,
    on,
    extraHeld: [{ key: 'NDA', expiresAt: null, accepted: true }],
    ...extra,
  })

describe('a license to practice is the law talking, not the client', () => {
  it('a nurse whose license lapses inside the assignment cannot be started until it is renewed', () => {
    // The day after it ran out — which inside a thirteen-week assignment
    // is a day that arrives while she is still on shift.
    const v = startFor('ICU travel nurse — 13 weeks', [
      ...cleanPapers,
      { type: 'PROFESSIONAL_LICENSE', status: 'CLEAR', issuedAt: inDays(-730), expiresAt: inDays(-3), result: { license: 'RN 154-882', state: 'WI' }, provider: 'Wisconsin Board of Nursing' },
    ])
    expect(v.outcome).toBe('BLOCK')
    expect(v.says).toContain('cannot start')
    expect(v.says).toContain('unlicensed practice')
    expect(v.fix).toContain('renewal')
  })

  it('a license that starts next month does not cover a shift this week', () => {
    const gate = licenseGate({
      personName: 'Colleen Byrne',
      credentials: [rnLicense({ validFrom: inDays(21), issuedAt: inDays(14), expiresAt: inDays(750) })],
      keys: ['PROFESSIONAL_LICENSE'],
      on,
    })
    expect(gate.outcome).toBe('BLOCK')
    expect(gate.blocking[0].standing).toBe('NOT_YET_VALID')
    expect(gate.says).toContain('licenses nobody')
    expect(gate.fix).toContain('nobody starts before the license does')
  })

  it('a license that is in date today and runs out before the last day lets her start and names the day she stops being licensed', () => {
    const gate = licenseGate({
      personName: 'Colleen Byrne',
      credentials: [rnLicense()],
      keys: ['PROFESSIONAL_LICENSE'],
      on,
      through: inDays(49),
    })
    expect(gate.outcome).toBe('WARN')
    expect(gate.blocking).toHaveLength(0)
    expect(gate.lapsingInside).toHaveLength(1)
    expect(gate.says).toContain('inside the assignment')
    expect(gate.says).toContain('25 days of it fall after the license does')
  })

  it('says nothing about the end of an assignment nobody told it the end of', () => {
    // A warning about a date the caller never supplied would be invented.
    const gate = licenseGate({
      personName: 'Colleen Byrne',
      credentials: [rnLicense({ expiresAt: inDays(200) })],
      keys: ['PROFESSIONAL_LICENSE'],
      on,
    })
    expect(gate.outcome).toBe('PASS')
    expect(gate.says).toBeNull()
  })

  it('a license on file with no expiry date against it is not treated as good forever', () => {
    const s = standingOf(
      { key: 'PROFESSIONAL_LICENSE', label: 'professional license', issuedAt: inDays(-400) },
      { key: 'PROFESSIONAL_LICENSE', label: 'professional license', validMonths: null, expires: true },
      on
    )
    expect(s.standing).toBe('NO_EXPIRY_RECORDED')
    expect(s.says).toContain('passes every check until the')
  })

  it('the refusal names the license number and the state that issued it', () => {
    const gate = licenseGate({
      personName: 'Colleen Byrne',
      credentials: [rnLicense({ expiresAt: inDays(-3) })],
      keys: ['PROFESSIONAL_LICENSE'],
      on,
    })
    expect(gate.says).toContain('RN 154-882')
    expect(gate.says).toContain('WI')
    expect(nameCredential(rnLicense())).toBe('professional license (RN 154-882, WI)')
  })

  it('a nurse who filed the renewal early is not refused for being organized', () => {
    // Two licenses: the current one, three weeks left, and the renewal
    // that begins when it ends. Reading the longest-dated one's start
    // date alone would have blocked the person who did the right thing.
    const gate = licenseGate({
      personName: 'Colleen Byrne',
      credentials: [
        rnLicense({ expiresAt: inDays(21) }),
        rnLicense({ validFrom: inDays(21), issuedAt: inDays(-2), expiresAt: inDays(751) }),
      ],
      keys: ['PROFESSIONAL_LICENSE'],
      on,
    })
    expect(gate.outcome).not.toBe('BLOCK')
  })

  it('a license check still running is not a license', () => {
    const gate = licenseGate({
      personName: 'Colleen Byrne',
      credentials: [rnLicense({ status: 'PENDING' })],
      keys: ['PROFESSIONAL_LICENSE'],
      on,
      through: inDays(49),
    })
    // Nothing produced, so nothing is judged here — the packet is what
    // asks for it, and claiming a verdict off a check that has not come
    // back is how somebody is waved onto a ward.
    expect(gate.outcome).toBe('PASS')
    expect(gate.blocking).toHaveLength(0)
  })
})

describe('which roles cannot be worked without a license', () => {
  it('reads a travel nurse as licensed and a validation engineer as not', () => {
    expect(licensedOccupation('ICU travel nurse — 13 weeks')?.key).toBe('NURSE')
    expect(licensedOccupation('Validation engineer')).toBeNull()
  })

  it('does not ask a software engineer for a state license', () => {
    expect(startPacketFor('Senior software engineer')).toBe('CONTRACT_START_W2')
    expect(packetByKey('CONTRACT_START_W2')!.items.map((i) => i.key)).not.toContain('PROFESSIONAL_LICENSE')
  })

  it('starting a nurse asks for the state license and starting a developer does not', () => {
    expect(startPacketFor('ICU travel nurse — 13 weeks')).toBe('CONTRACT_START_LICENSED')
    const licensed = packetByKey('CONTRACT_START_LICENSED')!
    const license = licensed.items.find((i) => i.key === 'PROFESSIONAL_LICENSE')!
    expect(license.required).toBe(true)
    // Everything the W-2 start asks for is still asked for.
    for (const item of packetByKey('CONTRACT_START_W2')!.items) {
      expect(licensed.items.map((i) => i.key)).toContain(item.key)
    }
  })

  it('a nurse with no license on file at all cannot be started', () => {
    const v = startFor('ICU travel nurse — 13 weeks', cleanPapers)
    expect(v.outcome).toBe('BLOCK')
    expect(v.blocking.map((b) => b.key)).toContain('PROFESSIONAL_LICENSE')
  })

  it('covers trades and engineering too, so nothing here reads as a healthcare product', () => {
    expect(licensedOccupation('Professional engineer — bridges')?.key).toBe('PROFESSIONAL_ENGINEER')
    expect(licensedOccupation('CDL driver, regional')?.key).toBe('COMMERCIAL_DRIVER')
    expect(licensedOccupation('Journeyman electrician')?.key).toBe('TRADES')
  })

  it('names the more specific occupation when two match, so the right board is named', () => {
    expect(licensedOccupation('Nurse practitioner — primary care')?.key).toBe('ADVANCED_PRACTICE')
  })
})

describe('a client extends the dictionary and gets the same block', () => {
  const ownType: DefinedType[] = [
    {
      key: 'STATE_CONTRACTOR_REG',
      label: 'State contractor registration',
      purpose: 'COMPLIANCE',
      validityShape: 'END_ONLY',
      suppliedBy: 'CANDIDATE',
      blocks: true,
    },
  ]

  it('a client that adds a license requirement to its own document types gets the same block', () => {
    const v = startFor('Site supervisor', [
      ...cleanPapers,
      { type: 'STATE_CONTRACTOR_REG', status: 'CLEAR', issuedAt: inDays(-500), expiresAt: inDays(-10), result: { number: 'CR-9921', state: 'OR' } },
    ], { documentTypes: ownType })
    expect(v.outcome).toBe('BLOCK')
    expect(v.says).toContain('CR-9921')
    expect(v.says).toContain('OR')
  })

  it('a client that says its own credential does not stop work gets a warning instead, with a reason recorded', () => {
    const soft: DefinedType[] = [{ ...ownType[0], blocks: false }]
    const v = startFor('Site supervisor', [
      ...cleanPapers,
      { type: 'STATE_CONTRACTOR_REG', status: 'CLEAR', issuedAt: inDays(-500), expiresAt: inDays(-10), result: { number: 'CR-9921', state: 'OR' } },
    ], { documentTypes: soft })
    expect(v.outcome).not.toBe('BLOCK')
    expect(credentialKeys(soft)).not.toContain('STATE_CONTRACTOR_REG')
  })

  it('a passport that ran out does not stop a start, because a passport is not a license to practice', () => {
    expect(credentialKeys()).toEqual(['PROFESSIONAL_LICENSE'])
    const v = startFor('Senior software engineer', [
      ...cleanPapers,
      { type: 'PASSPORT', status: 'CLEAR', issuedAt: inDays(-3000), expiresAt: inDays(-40) },
    ])
    expect(v.outcome).not.toBe('BLOCK')
  })

  it('a lapsed license stops a start and a missing background check still only warns', () => {
    const v = startFor('ICU travel nurse — 13 weeks', [
      { type: 'I9_EVERIFY', status: 'CLEAR', issuedAt: inDays(-60), verifiedAt: inDays(-59) },
      { type: 'PROFESSIONAL_LICENSE', status: 'CLEAR', issuedAt: inDays(-730), expiresAt: inDays(-3), result: { license: 'RN 154-882', state: 'WI' } },
    ])
    expect(v.outcome).toBe('BLOCK')
    expect(v.blocking.map((b) => b.key)).not.toContain('BACKGROUND_CHECK')
    expect(v.chasing.map((c) => c.key)).toContain('BACKGROUND_CHECK')
  })
})

describe('the renewal is asked for before the license runs out', () => {
  it('the renewal is asked for before the license runs out, and the ask names the state', () => {
    const [chase] = credentialsToChase([rnLicense()], ['PROFESSIONAL_LICENSE'], on)
    expect(chase).toBeTruthy()
    expect(chase.daysLeft).toBe(24)
    expect(chase.state).toBe('WI')
    expect(chase.says).toContain('runs out in 24 days')
    expect(chase.says).toContain('Wisconsin Board of Nursing')
    expect(chase.says).toContain('RN 154-882')
  })

  it('what the renewal ask actually asks for is the number and the new expiry date', () => {
    const packet = packetByKey('CREDENTIAL_RENEWAL')!
    expect(packet.subject).toBe('PERSON')
    expect(packet.items).toHaveLength(1)
    expect(packet.items[0].key).toBe('PROFESSIONAL_LICENSE')
    expect(packet.items[0].required).toBe(true)
    expect(packet.items[0].hint).toContain('new expiry date')
  })

  it('a license already renewed is not asked for again', () => {
    const chase = credentialsToChase(
      [rnLicense({ expiresAt: inDays(21) }), rnLicense({ validFrom: inDays(21), expiresAt: inDays(751) })],
      ['PROFESSIONAL_LICENSE'],
      on
    )
    expect(chase).toHaveLength(0)
  })

  it('a license nobody has dated is chased for the date, not passed as permanent', () => {
    const [chase] = credentialsToChase([rnLicense({ expiresAt: null })], ['PROFESSIONAL_LICENSE'], on)
    expect(chase.daysLeft).toBeNull()
    expect(chase.says).toContain('Tell us the day it runs out')
  })

  it('a license with nine months left is left alone, because a chase that always fires is a click', () => {
    expect(credentialsToChase([rnLicense({ expiresAt: inDays(270) })], ['PROFESSIONAL_LICENSE'], on)).toHaveLength(0)
  })

  it('a lapsed license is chased in words that say the work has already stopped', () => {
    const [chase] = credentialsToChase([rnLicense({ expiresAt: inDays(-3) })], ['PROFESSIONAL_LICENSE'], on)
    expect(chase.says).toContain('lapsed 3 days ago')
    expect(chase.says).toContain('the work stops')
  })
})
