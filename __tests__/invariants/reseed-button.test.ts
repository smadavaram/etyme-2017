import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The one fix on /ready that the page can carry out itself.
 *
 * /ready is public on purpose — it says a thing is configured or has
 * happened and never what its value is. A button that writes twenty
 * companies cannot sit on a public page without a gate of its own, and
 * the gate is the whole of this file.
 *
 * What it must hold:
 *
 *   · the button is drawn only when the server says the reader is staff
 *   · the CRON_SECRET path is untouched — a machine still gets in
 *   · a bad secret is refused, and told so plainly
 *   · with nobody named as staff, nobody gets in from a browser
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const route = read('src/app/api/seed-world/route.ts')
const staff = read('src/lib/staff.ts')
const button = read('src/components/reseed-button.tsx')
const page = read('src/app/ready/page.tsx')

describe('who may re-seed a deployment from the browser', () => {
  it('only somebody on the staff list, which is the same list that hears when it breaks', () => {
    expect(staff).toContain('staffAddresses')
    expect(staff).toContain('ETYME_STAFF_EMAILS')
  })

  it('with nobody named as staff, nobody gets in — and the refusal says which variable to set', () => {
    expect(staff).toContain('if (staff.length === 0)')
    expect(staff).toMatch(/Set ETYME_STAFF_EMAILS/)
  })

  it('somebody signed in who is not on the list is refused in a sentence, not a code', () => {
    expect(staff).toMatch(/is for Etyme staff, and you are not on that list/)
  })

  it('a caller who is not signed in at all is told to sign in first', () => {
    expect(staff).toMatch(/Sign in first/)
  })

  it('the check lives in a lib, because a Next route may export only handlers — and next build says so, not tsc', () => {
    expect(route).toContain("import { callerIsStaff } from '@/lib/staff'")
    expect(route).not.toContain('export async function callerIsStaff')
  })

  it('the staff path is only ever taken when no bearer token was offered, so a wrong secret can never fall through to it', () => {
    expect(route).toContain("const staff = offered === null ? await callerIsStaff() : { ok: false, says: '' }")
  })

  it('the machine path is untouched: a bearer token is still compared in constant time', () => {
    expect(route).toContain('timingSafeEqual')
    expect(route).toContain('sameSecret(offered, secret)')
  })

  it('a wrong secret is told it is wrong, rather than being given the staff sentence', () => {
    expect(route).toContain("'That is not the CRON_SECRET for this deployment.'")
  })
})

describe('the button itself', () => {
  it('asks the server whether it may be drawn, rather than deciding for itself', () => {
    expect(button).toContain("fetch('/api/seed-world')")
    expect(button).toContain('mayReseed')
  })

  it('draws nothing at all when the reader has no right to it — never a control that refuses on click', () => {
    expect(button).toContain('if (!may) return null')
  })

  it('says the work takes a minute, because a button that looks hung gets pressed twice', () => {
    expect(button).toMatch(/Up to a minute/)
    expect(button).toMatch(/Building the world/)
  })

  it('says pressing it twice is safe, which is true because the seed is idempotent by slug', () => {
    expect(button).toMatch(/never makes a second copy/)
  })

  it('a dropped connection is not reported as a failure, because the work may have finished', () => {
    expect(button).toMatch(/may have finished anyway/)
  })

  it('sits on the demo row and nowhere else', () => {
    expect(page).toContain("edge.key === 'demo' && <ReseedButton")
    expect(page.match(/<ReseedButton/g) ?? []).toHaveLength(1)
  })

  it('stays there when the row reads green, so a wrong assessment never leaves staff without the remedy', () => {
    expect(page).not.toContain("state !== 'PROVEN' && <ReseedButton")
    expect(button).toContain("proven ? 'Re-seed it anyway'")
  })
})
