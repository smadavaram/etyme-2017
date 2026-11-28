import { describe, it, expect } from 'vitest'
import {
  checkBranding, checkPages, brandingFingerprint, brandingChanged, approvalHolds, brandingIsStored,
  contrastWarnings, contrastRatio, NO_BRANDING, isSiteTemplate, SITE_TEMPLATES,
} from '@/lib/site-settings'
import { saidYesToUpdates } from '@/lib/updates-consent'

const B = { logoRef: 'https://x.example/l.png', primaryColor: '#1B2A4A', secondaryColor: '#1F9E8F', fontPairing: 'SERIF_SANS' }
const d = (s: string) => new Date(s)

describe('the template choice', () => {
  it('a template is one of three layouts and nothing else', () => {
    expect([...SITE_TEMPLATES]).toEqual(['ASK_FIRST', 'FEED', 'BOARD'])
    expect(isSiteTemplate('FEED')).toBe(true)
    expect(isSiteTemplate('GRID')).toBe(false)
  })
})

describe('the branding as typed', () => {
  it('a colour is accepted only as a hash and six digits, and is stored in capitals', () => {
    expect(checkBranding({ primaryColor: '#1b2a4a' })).toMatchObject({ ok: true, value: { primaryColor: '#1B2A4A' } })
    expect(checkBranding({ primaryColor: 'blue' }).ok).toBe(false)
  })
  it('a logo is an https address, and an http address or a script is refused', () => {
    expect(checkBranding({ logoRef: 'https://x.example/l.png' }).ok).toBe(true)
    expect(checkBranding({ logoRef: 'http://x.example/l.png' }).ok).toBe(false)
    expect(checkBranding({ logoRef: 'javascript:alert(1)' }).ok).toBe(false)
  })
  it('a font pairing outside the list is refused and the sentence lists the choices', () => {
    const r = checkBranding({ fontPairing: 'COMIC' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.says).toContain('Serif headlines')
  })
  it('empty branding is the neutral default, every field null', () => {
    expect(checkBranding({})).toEqual({ ok: true, value: NO_BRANDING })
  })
})

describe('the Owner’s yes is tied to what is stored', () => {
  it('a yes holds over the values it was given over', () => {
    expect(approvalHolds(d('2026-11-27'), brandingFingerprint(B), B)).toBe(true)
  })
  it('a change to any one stored value ends the yes', () => {
    for (const change of [{ logoRef: 'https://x.example/m.png' }, { primaryColor: '#000000' }, { secondaryColor: '#FFFFFF' }, { fontPairing: 'SANS_SANS' }]) {
      const now = { ...B, ...change }
      expect(brandingChanged(B, now)).toBe(true)
      expect(approvalHolds(d('2026-11-27'), brandingFingerprint(B), now)).toBe(false)
    }
  })
  it('a colour written in lower case is the same value, so it does not end the yes', () => {
    expect(brandingChanged(B, { ...B, primaryColor: '#1b2a4a' })).toBe(false)
  })
  it('the bare dated yes of before values were stored never counts', () => {
    expect(approvalHolds(d('2026-11-20'), null, B)).toBe(false)
  })
  it('a yes cannot be given over nothing stored', () => {
    expect(brandingIsStored(NO_BRANDING)).toBe(false)
    expect(brandingIsStored(B)).toBe(true)
  })
})

describe('contrast', () => {
  it('white on black is the maximum contrast of 21', () => { expect(Math.round(contrastRatio('#FFFFFF', '#000000'))).toBe(21) })
  it('a pale colour is warned about and a dark one is not', () => {
    expect(contrastWarnings({ ...NO_BRANDING, primaryColor: '#FFEE88' })).toHaveLength(1)
    expect(contrastWarnings({ ...NO_BRANDING, primaryColor: '#1B2A4A' })).toEqual([])
  })
})

describe('the page list', () => {
  it('two pages with the same address are refused', () => {
    expect(checkPages([{ slug: 'about', title: 'A', body: '' }, { slug: 'about', title: 'B', body: '' }]).ok).toBe(false)
  })
  it('a page address is lowercase words joined by dashes', () => {
    expect(checkPages([{ slug: 'About Us', title: 'A', body: '' }]).ok).toBe(false)
    expect(checkPages([{ slug: 'about-us', title: 'About us', body: 'Words.' }]).ok).toBe(true)
  })
  it('a site has at most twelve pages', () => {
    expect(checkPages(Array.from({ length: 13 }, (_, i) => ({ slug: `p${i}`, title: 't', body: '' }))).ok).toBe(false)
  })
})

describe('a candidate’s yes to updates', () => {
  it('no day on her record is no yes', () => {
    expect(saidYesToUpdates({ updatesYesAt: null, updatesRevokedAt: null })).toBe(false)
  })
  it('a yes with no revoke is a yes', () => {
    expect(saidYesToUpdates({ updatesYesAt: d('2026-11-01'), updatesRevokedAt: null })).toBe(true)
  })
  it('a revoke after the yes ends it', () => {
    expect(saidYesToUpdates({ updatesYesAt: d('2026-11-01'), updatesRevokedAt: d('2026-11-02') })).toBe(false)
  })
  it('a yes after an earlier revoke restores it', () => {
    expect(saidYesToUpdates({ updatesYesAt: d('2026-11-03'), updatesRevokedAt: d('2026-11-02') })).toBe(true)
  })
})
