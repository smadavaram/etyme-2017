import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { COMPANY_CODE_HELP, COST_OBJECT_KIND_WORDS } from '@/lib/counterparty'

const read = (p: string) => readFileSync(p, 'utf8')

describe('the client’s code forms are drawn only where their routes will save', () => {
  it('the company code sentence says what it is for', () => {
    expect(COMPANY_CODE_HELP).toBe('Your accounting system’s company code. It goes on every line of the file you download.')
  })
  it('the four cost object kinds are offered by their plain names', () => {
    expect(COST_OBJECT_KIND_WORDS.map((k) => k.label)).toEqual(['Internal order', 'Project code', 'WBS element', 'Material code'])
  })
  it('the settings page draws the company code and profit center boxes only when the route says the seat may save them', () => {
    const page = read('src/app/dashboard/settings/page.tsx')
    expect(page).toContain('{data.canEditCodes && <ClientCodesPanel')
    expect(page).toContain('{data.canEditCodes && (\n              <input value={pc}')
  })
  it('the vendor number box asks the route before it draws anything', () => {
    const page = read('src/app/dashboard/companies/page.tsx')
    expect(page).toContain('?vendorNumberFor=')
    expect(page).toContain('if (!shown) return null')
  })
  it('every route that saves a client code asks for the paying company’s settings seat', () => {
    for (const f of ['src/app/api/settings/coding/route.ts', 'src/app/api/settings/internal-orders/route.ts']) {
      expect(read(f)).toContain('refuseUnlessPayerManager')
    }
    expect(read('src/app/api/counterparties/vendor-number.ts')).toContain("kind === 'CLIENT'")
  })
})
