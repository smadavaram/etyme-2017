/**
 * The word for another firm of each kind, beside its name, lives in
 * lib/parties beside the firm's own word (2026-11-02), so demand's
 * picker word (`firmWord` in dashboard/submissions/words) can fold into it
 * and no two screens call one firm two things.
 */
import { describe, it, expect } from 'vitest'
import { kindWord, otherFirmWord } from '@/lib/parties'
import { firmWord } from '@/app/dashboard/submissions/words'

const KINDS = ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP'] as const

describe('What another firm is called beside its name', () => {
  it('another firm reads its kind in lower case beside its name, an acronym keeping its capitals', () => {
    expect(KINDS.map(otherFirmWord)).toEqual(['supplier', 'client', 'MSP', 'integrator', 'one-person firm'])
  })

  it('a one-person corporation is "Own company" to itself and a one-person firm to everybody else', () => {
    expect(kindWord('CONSULTANT_CORP')).toBe('Own company')
    expect(otherFirmWord('CONSULTANT_CORP')).toBe('one-person firm')
  })

  it('a kind nobody knows says nothing rather than its code', () => {
    expect([otherFirmWord('BENCH_VENDOR'), otherFirmWord(null), otherFirmWord(''), otherFirmWord('toString')]).toEqual(['', '', '', ''])
  })

  it('the word is the one the Send on picker already prints, so demand folds its own into it with no label changing', () => {
    for (const k of [...KINDS, 'SOMETHING', null]) expect(otherFirmWord(k), String(k)).toBe(firmWord(k))
  })
})
