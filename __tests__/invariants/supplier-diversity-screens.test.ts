import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getNavForKind } from '@/lib/nav-table'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the supplier-diversity screens (record 132)', () => {
  const page = read('src/app/dashboard/proposals/page.tsx')
  it('the Certifications panel and the Registrations list are drawn only after the page has been let in, so a firm with the plugin off sees the route’s sentence and nothing else', () => {
    const refusal = page.indexOf('if (refused) return <RefusedState')
    expect(refusal).toBeGreaterThan(0)
    expect(page.indexOf('<CertificationsPanel />')).toBeGreaterThan(refusal)
    expect(page.indexOf('<RegistrationsList />')).toBeGreaterThan(refusal)
  })
  it('the panels live on the Proposals page and the Proposals link is the one that lists their routes, so no second menu link exists for them', () => {
    const jobs = JSON.stringify(getNavForKind('VENDOR', false, { plugins: ['PUBLIC_SECTOR'] } as never))
    expect(jobs).toContain('/dashboard/proposals')
    expect(jobs).not.toMatch(/dashboard\/(diversity|certifications|registrations)/)
    const nav = read('src/lib/nav-table.ts')
    expect(nav).toContain("'governance/certifications'")
    expect(nav).toContain("'diversity/**'")
  })
  it('the panels offer Owner buttons only where the route said she may write, and never a button that submits, signs or attests for the firm', () => {
    const panels = read('src/app/dashboard/proposals/diversity-panels.tsx')
    expect(panels).toContain('{mayWrite && ')
    expect(panels).toContain('I attest this is true of the firm')
    expect(panels).toContain('I submitted it on the portal')
    expect(panels).not.toMatch(/Submit to the portal|Submit for me|Sign for/i)
  })
  it('no screen text says desk or program office', () => {
    for (const f of ['src/app/dashboard/proposals/diversity-panels.tsx', 'src/app/dashboard/proposals/page.tsx']) expect(read(f)).not.toMatch(/\b(desk|program office)\b/i)
  })
})
