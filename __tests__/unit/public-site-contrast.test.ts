import { describe, it, expect } from 'vitest'
import { readContrast, contrastRatio, parseHex } from '@/lib/public-site/contrast'

describe('a tenant’s colors are warned about when they fail contrast, never changed', () => {
  it('black on white reads 21 to 1 and passes with no warning', () => {
    const r = readContrast('#000000', '#FFFFFF')
    expect(r.ratio).toBe(21)
    expect(r.passes).toBe(true)
    expect(r.warns).toBeNull()
  })
  it('pale grey on white fails and the warning says the colors are kept as chosen', () => {
    const r = readContrast('#CCCCCC', '#FFFFFF')
    expect(r.passes).toBe(false)
    expect(r.warns).toMatch(/kept as you chose/)
  })
  it('a three-digit color reads the same as its six-digit form', () => {
    expect(parseHex('#fff')).toEqual(parseHex('#FFFFFF'))
    expect(contrastRatio('#000', '#fff')).toBe(contrastRatio('#000000', '#ffffff'))
  })
  it('a color that is not a color gives no number and a sentence, never a pass', () => {
    const r = readContrast('navy', '#FFFFFF')
    expect(r.ratio).toBeNull()
    expect(r.passes).toBe(false)
    expect(r.warns).toMatch(/cannot check/)
  })
  it('the answer carries no replacement color, so nothing can be silently changed', () => {
    expect(Object.keys(readContrast('#CCCCCC', '#FFFFFF')).sort()).toEqual(['passes', 'ratio', 'warns'])
  })
})
