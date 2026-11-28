import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { pageFraming } from '@/lib/page-framing'

/**
 * The fifth screen walk (2026-11-04) saw "NETWORK / Consultants" on the
 * page a supplier reaches from Network's Candidates group: the eyebrow
 * followed the menu and the heading was typed. The heading is now the
 * menu's own word, read through the same framing the other pages use.
 */

const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/consultants/page.tsx'), 'utf8')
const OWNER = { permissions: ['*'] as string[] }

describe('The people a supplier keeps are headed by the link it reached them from', () => {
  it('the page a supplier reaches from Network\'s Candidates group is headed by that link, never a typed "Consultants"', () => {
    const f = pageFraming('VENDOR', 'consultants', null, OWNER)
    expect(`${f.eyebrow} · ${f.title}`).toBe('Network · Candidates')
    expect(PAGE).toContain("pageFraming(readerKind, 'consultants'")
    expect(PAGE).toContain('<h1>{framing?.title ?? \'\'}</h1>')
    expect(PAGE).not.toContain('<h1>Consultants</h1>')
  })

  it('the line under the heading still says what the list is: the people on your bench, kept to you or shown to your partners', () => {
    expect(PAGE).toContain('The people on your bench, kept to you or shown to your partners')
  })
})
