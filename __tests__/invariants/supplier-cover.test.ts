/**
 * A lapse blocks new submissions. L3.2.3.3.
 *
 * The certificate was already collected and already checked at award. The
 * gap this closes is the fifteen steps in between: a client reads a CV,
 * runs two interviews and makes an offer against a supplier who could not
 * lawfully have put anybody on their site on the day the CV arrived.
 */

import { describe, it, expect } from 'vitest'
import { supplierCoverGate, COVER_THAT_STOPS_WORK } from '@/lib/document-stages'

const ON = new Date('2026-08-29T00:00:00Z')
const d = (s: string) => new Date(`${s}T00:00:00Z`)

const inDate = [
  { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: d('2026-01-01'), expiresAt: d('2027-01-01'), verifiedAt: d('2026-01-02') },
  { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: d('2026-01-01'), expiresAt: d('2027-01-01'), verifiedAt: d('2026-01-02') },
]

describe('A lapsed certificate stops a supplier putting anybody forward', () => {

  it('a supplier whose general liability certificate has lapsed cannot submit anybody', () => {
    const gate = supplierCoverGate({
      supplierName: 'Cloudepa',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: d('2025-01-01'), expiresAt: d('2026-08-17') },
        ...inDate.slice(1),
      ],
      on: ON,
    })

    expect(gate.outcome).toBe('BLOCK')
    expect(gate.blocking).toHaveLength(1)
    expect(gate.blocking[0].key).toBe('INSURANCE_GL')
  })

  it('the refusal names the certificate, the day it lapsed, and what the broker has to do', () => {
    const gate = supplierCoverGate({
      supplierName: 'Cloudepa',
      clientName: 'Terumo BCT',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: d('2025-01-01'), expiresAt: d('2026-08-17') },
        ...inDate.slice(1),
      ],
      on: ON,
    })

    expect(gate.says).toContain('Cloudepa')
    expect(gate.says).toContain('general liability')
    expect(gate.says).toContain('12 days ago')
    expect(gate.fix).toContain('broker')
    expect(gate.fix).toContain('Terumo BCT')
  })

  it('a supplier with both certificates on file and in date may submit', () => {
    const gate = supplierCoverGate({ supplierName: 'Cloudepa', certificates: inDate, on: ON })
    expect(gate.outcome).toBe('PASS')
    expect(gate.blocking).toEqual([])
    expect(gate.chasing).toEqual([])
    expect(gate.says).toContain('on file and in date')
    expect(gate.fix).toBeNull()
  })

  it('a certificate expiring next week warns and does not stop a submission today', () => {
    const gate = supplierCoverGate({
      supplierName: 'Cloudepa',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: d('2026-09-05'), verifiedAt: d('2026-01-02') },
        ...inDate.slice(1),
      ],
      on: ON,
    })

    expect(gate.outcome).toBe('WARN')
    expect(gate.chasing[0].standing).toBe('EXPIRING')
    expect(gate.says).toContain('7 days')
  })

  it('a certificate on file with no expiry date recorded warns rather than passing quietly', () => {
    // The fourth state. In 2017 this passed every check until an auditor
    // asked, because an unknown expiry looked exactly like a valid one.
    const gate = supplierCoverGate({
      supplierName: 'Cloudepa',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: null, expiresAt: null, verifiedAt: d('2026-01-02') },
        ...inDate.slice(1),
      ],
      on: ON,
    })

    expect(gate.outcome).toBe('WARN')
    expect(gate.chasing[0].standing).toBe('NO_EXPIRY_RECORDED')
    expect(gate.chasing[0].says).toContain('Add the date')
  })

  it('a supplier with nothing on file is chased, not blocked — which cover is required is the client’s rule, not ours', () => {
    // Refusing every supplier who has not yet been asked would make Etyme
    // the party deciding what cover a client requires, which is a screening
    // judgement and not ours to take.
    const gate = supplierCoverGate({ supplierName: 'Cloudepa', certificates: [], on: ON })

    expect(gate.outcome).toBe('WARN')
    expect(gate.blocking).toEqual([])
    expect(gate.chasing.map(c => c.standing)).toEqual(['MISSING', 'MISSING'])
  })

  it('a client that insists on general liability turns a missing certificate into a block', () => {
    const gate = supplierCoverGate({
      supplierName: 'Cloudepa',
      certificates: [],
      requiredTypes: ['INSURANCE_GL'],
      on: ON,
    })

    expect(gate.outcome).toBe('BLOCK')
    expect(gate.blocking.map(b => b.key)).toEqual(['INSURANCE_GL'])
  })

  it('a certificate the supplier’s own record marks expired blocks even where no date was given', () => {
    const gate = supplierCoverGate({
      supplierName: 'Cloudepa',
      certificates: [
        { type: 'INSURANCE_GL', status: 'EXPIRED', issuedAt: null, expiresAt: null },
        ...inDate.slice(1),
      ],
      on: ON,
    })

    expect(gate.outcome).toBe('BLOCK')
    expect(gate.blocking[0].says).toContain('own record')
  })

  it('a certificate still being processed is not yet a certificate', () => {
    const gate = supplierCoverGate({
      supplierName: 'Cloudepa',
      certificates: [
        { type: 'INSURANCE_GL', status: 'PENDING', expiresAt: d('2027-01-01') },
        ...inDate.slice(1),
      ],
      requiredTypes: ['INSURANCE_GL'],
      on: ON,
    })

    expect(gate.outcome).toBe('BLOCK')
    expect(gate.blocking[0].standing).toBe('MISSING')
  })

  it('the newest certificate of a kind is the one that counts, so a renewal replaces the lapsed one', () => {
    const gate = supplierCoverGate({
      supplierName: 'Cloudepa',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: d('2025-01-01'), expiresAt: d('2026-01-01') },
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: d('2026-01-01'), expiresAt: d('2027-01-01'), verifiedAt: d('2026-01-02') },
        ...inDate.slice(1),
      ],
      on: ON,
    })

    expect(gate.outcome).toBe('PASS')
  })

  it('errors and omissions lapsing does not stop a submission unless the client asked for it', () => {
    const lapsedEo = {
      type: 'INSURANCE_EO', status: 'CLEAR', issuedAt: d('2025-01-01'), expiresAt: d('2026-06-01'),
    }

    const quiet = supplierCoverGate({
      supplierName: 'Cloudepa',
      certificates: [...inDate, lapsedEo],
      on: ON,
    })
    expect(quiet.outcome).toBe('WARN')

    const asked = supplierCoverGate({
      supplierName: 'Cloudepa',
      certificates: [...inDate, lapsedEo],
      requiredTypes: ['INSURANCE_EO'],
      on: ON,
    })
    expect(asked.outcome).toBe('BLOCK')
  })

  it('a block is never returned without something the vendor can actually do about it', () => {
    const gate = supplierCoverGate({
      supplierName: 'Cloudepa',
      certificates: [{ type: 'INSURANCE_WC', status: 'EXPIRED', expiresAt: d('2026-02-01') }],
      on: ON,
    })

    expect(gate.outcome).toBe('BLOCK')
    expect(gate.fix).toBeTruthy()
    expect(gate.fix).toContain('replacement certificate')
  })

  it('the two that stop work by default are general liability and workers’ compensation', () => {
    expect([...COVER_THAT_STOPS_WORK]).toEqual(['INSURANCE_GL', 'INSURANCE_WC'])
  })
})
