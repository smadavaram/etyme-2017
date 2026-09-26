import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PERMISSIONS, hasPermission } from '@/lib/permissions'
import { mayRecommend, mayActAt } from '@/lib/supplier-onboarding'

/**
 * The owner of a company holds `['*']`, and a literal match never sees it.
 *
 * ── The bug this is named after ──────────────────────────────────────
 *
 * The founder opened Suppliers as Northbend Athletic's account owner and asked how to
 * add one. The page said, in its own subtitle, that anybody who raises a
 * requirement can recommend a firm — and showed no button, because the
 * gate behind it read `permissions.includes('requirements.write')`.
 * An owner's permissions are `['*']`. The string is not in the array.
 *
 * So the one person who set the company up was the one person who could
 * not recommend a supplier, act as the program office at the lead desk,
 * qualify at Procurement, or approve at Finance. Six checks, all on the
 * same chain, all with the same hole — and every one of them invisible
 * to the tests, which had always passed explicit permission lists.
 *
 * `hasPermission` has honored the wildcard since it was written. The
 * rule is to use it, and the scan below is what makes the rule hold:
 * a raw `.includes('<a real permission>')` anywhere under src/ fails,
 * on the commit that adds it.
 */

const SRC = join(process.cwd(), 'src')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return files(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

describe('a company owner can do everything, including the things named one at a time', () => {
  it('the owner of a client can recommend a supplier — the gate that hid the button', () => {
    expect(mayRecommend(['*'])).toBe(true)
    expect(mayRecommend(['requirements.write'])).toBe(true)
    expect(mayRecommend(['timesheets.read'])).toBe(false)
  })

  it('the owner stands in at every desk of the supplier chain, the way the program office does', () => {
    const base = {
      callerId: 'p-owner', recommendedById: 'p-manager', decisions: [],
      desks: { leadId: null, hrId: null, procurementId: null }, firmName: 'Harbor Staffing',
    }
    for (const stage of ['LEAD', 'PROCUREMENT', 'HR', 'FINANCE'] as const) {
      const v = mayActAt({ ...base, stage, permissions: ['*'] })
      expect(v.ok, `${stage}: ${v.ok === false ? v.message : ''}`).toBe(true)
    }
  })

  it('and segregation still beats the wildcard — an owner who recommended the firm cannot decide it', () => {
    const v = mayActAt({
      stage: 'LEAD', permissions: ['*'], callerId: 'p-owner', recommendedById: 'p-owner',
      decisions: [], desks: { leadId: null, hrId: null, procurementId: null }, firmName: 'Harbor Staffing',
    })
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.code).toBe('OWN_RECOMMENDATION')
  })

  it('nobody asks what a caller may do with a raw includes, which is how all ten got there', () => {
    // Aimed at the actual mistake: asking a *caller's own permissions*
    // whether they hold one, by name. A role editor asking which
    // permissions were removed from a list is a different question
    // about a different array, and is allowed — so the scan matches
    // only identifiers that hold somebody's permissions.
    //
    // The helper itself is where the wildcard is read, so it is the one
    // place allowed to compare the strings directly.
    const allowed = [join(SRC, 'lib', 'permissions.ts')]
    const offenders: string[] = []
    for (const file of files(SRC)) {
      if (allowed.includes(file)) continue
      const source = readFileSync(file, 'utf8')
      for (const permission of PERMISSIONS) {
        const asking = new RegExp(
          String.raw`(\w*([Pp]ermissions|perms))\??\.includes\(\s*['"\`]` + permission + String.raw`['"\`]`
        )
        if (asking.test(source)) offenders.push(`${file.slice(SRC.length + 1)} → ${permission}`)
      }
    }
    expect(offenders, 'use hasPermission — a raw includes cannot see an owner’s ["*"]').toEqual([])
  })

  it('the helper is what the rule rests on, so it is checked here too', () => {
    expect(hasPermission(['*'], 'payments.record')).toBe(true)
    expect(hasPermission(['payments.record'], 'payments.record')).toBe(true)
    expect(hasPermission(['invoices.read'], 'payments.record')).toBe(false)
  })
})
