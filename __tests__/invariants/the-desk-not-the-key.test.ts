import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
import { askTheDesk, desksHolding, inWords, PERMISSION_WORDS, PERMISSIONS } from '@/lib/permissions'
import { rolesFor } from '@/lib/company-defaults'

/**
 * A refusal names the desk. It never hands somebody a permission key.
 *
 * Found by a release walk across 1,181 screens as 38 seats. Verbatim,
 * off three different screens:
 *
 *   "Approving hours needs the timesheets.approve permission."
 *   "Extending a placement needs the assignments.write permission."
 *   "You need consultants.read permission"
 *
 * CLAUDE.md: "Explain in a sentence, not a code. A refusal says what is
 * missing and what to do… The code is for the machine; the sentence is
 * the product." A permission key is a code. It is also, and worse, an
 * answer to a question nobody asked: the reader wants to know who to go
 * to, and `timesheets.approve` does not say.
 */

describe('a refusal names the desk, not the key', () => {
  it('tells somebody at a client who signs hours off', () => {
    const says = askTheDesk({
      doing: 'Approving hours',
      needs: 'timesheets.approve',
      kind: 'CLIENT',
      companyName: 'Northbend Athletic',
    })
    expect(says).toContain('Hiring Manager')
    expect(says).toContain('Northbend Athletic')
    expect(says).not.toContain('timesheets.approve')
  })

  it('tells somebody at a staffing supplier who writes and extends a placement', () => {
    const says = askTheDesk({
      doing: 'Extending a placement',
      needs: 'assignments.write',
      kind: 'VENDOR',
      companyName: 'Brightmoor Staffing',
    })
    expect(says).toContain('Resource Manager')
    expect(says).toContain('Contract Manager')
    expect(says).not.toContain('assignments.write')
  })

  it('names the account owner only where nobody else holds it', () => {
    // settings.manage is the Owner's and the Admin's and nobody else's,
    // so "ask the owner" IS the answer here and is not noise.
    expect(desksHolding('settings.manage', 'VENDOR')).toEqual(['Owner', 'Admin'])
    // Where real desks hold it, the owner is left out: a sentence that
    // ends "ask the owner" on every screen teaches nobody anything.
    expect(desksHolding('timesheets.approve', 'CLIENT')).not.toContain('Owner')
  })

  it('says plainly that nobody here does it, rather than inventing a desk', () => {
    // A one-person nursing corporation has exactly one role. Ask it for
    // a desk that does not exist and it must not make one up.
    const solo = rolesFor('CONSULTANT_CORP')
    expect(solo.length).toBe(1)
    const says = askTheDesk({
      doing: 'Reading the approval rules',
      needs: 'governance.read',
      kind: 'CONSULTANT_CORP',
      companyName: 'Byrne Critical Care LLC',
    })
    // The owner holds everything, so here the honest answer names them.
    expect(says).toContain('Owner')
  })

  it('falls back to a supplier\'s desks when the company kind is unknown', () => {
    const says = askTheDesk({ doing: 'Doing that', needs: 'consultants.read', kind: null })
    expect(says).toContain('your company')
    expect(says).not.toContain('consultants.read')
  })

  it('stops listing desks before the sentence stops being a sentence', () => {
    // consultants.read is held by nine desks at a systems integrator.
    const many = desksHolding('consultants.read', 'GSI')
    expect(many.length).toBeGreaterThan(4)
    const says = askTheDesk({ doing: 'Seeing the people on the books', needs: 'consultants.read', kind: 'GSI' })
    expect(says).toContain('among other desks there')
    expect((says.match(/’s/g) ?? []).length).toBeLessThanOrEqual(4)
  })

  it('says what a permission lets somebody do, for every permission there is', () => {
    for (const p of PERMISSIONS) {
      expect(PERMISSION_WORDS[p], `${p} has no words`).toBeTruthy()
      expect(PERMISSION_WORDS[p]).not.toContain('.')
    }
    expect(inWords(['consultants.cost', 'margin.read'])).toBe(
      'see what each of them costs and see the margin on a placement'
    )
  })
})

/**
 * ── The sweep ────────────────────────────────────────────────────────
 *
 * The allow-list below is the state of the product on 2026-09-21, and it
 * is a list of files in other domains' boundaries. `etyme-regulatory`
 * may not edit them — `src/lib/domains.ts` says so and
 * `__tests__/invariants/domains.test.ts` enforces it — so naming them
 * here is how the work is handed over rather than done badly across a
 * boundary. Each line says who owns it.
 *
 * The list may only shrink. A new file joining it is a regression, which
 * is the whole point: the fix (`askTheDesk` in `src/lib/permissions.ts`)
 * is one import away from any of them.
 */
const STILL_SAYING_A_KEY: Record<string, string> = {
  // etyme-architect
  'src/app/api/clients/route.ts': 'etyme-architect',
  'src/app/api/companies/[id]/template-pack/route.ts': 'etyme-architect',
  'src/app/api/imports/sheets/route.ts': 'etyme-architect',
  'src/app/api/integrations/keys/route.ts': 'etyme-architect',
  'src/app/api/integrations/webhooks/route.ts': 'etyme-architect',
  'src/app/api/settings/address/route.ts': 'etyme-architect',
  'src/app/api/settings/approval-rules/route.ts': 'etyme-architect',
  'src/app/api/settings/cost-centers/route.ts': 'etyme-architect',
  'src/app/api/settings/holidays/route.ts': 'etyme-architect',
  'src/app/api/settings/locations/route.ts': 'etyme-architect',
  'src/app/api/settings/remit-to/route.ts': 'etyme-architect',
  'src/app/api/settings/roles/route.ts': 'etyme-architect',
  'src/app/api/settings/site/route.ts': 'etyme-architect',
  // etyme-money
  'src/app/api/ap/bills/route.ts': 'etyme-money',
  'src/app/api/ap/payment-runs/route.ts': 'etyme-money',
  'src/app/api/ar/credit-limit/route.ts': 'etyme-money',
  'src/app/api/ar/credit-notes/route.ts': 'etyme-money',
  'src/app/api/ar/dunning/route.ts': 'etyme-money',
  'src/app/api/ar/payments/route.ts': 'etyme-money',
  'src/app/api/contracts/[id]/activate/route.ts': 'etyme-money',
  'src/app/api/contracts/[id]/exempt/route.ts': 'etyme-money',
  'src/app/api/contracts/[id]/extend/route.ts': 'etyme-money',
  'src/app/api/contracts/[id]/master-contract/route.ts': 'etyme-money',
  'src/app/api/contracts/[id]/rolloff/route.ts': 'etyme-money',
  'src/app/api/contracts/route.ts': 'etyme-money',
  'src/app/api/expenses/actions/route.ts': 'etyme-money',
  'src/app/api/invoices/[id]/payments/route.ts': 'etyme-money',
  'src/app/api/invoices/[id]/submit/route.ts': 'etyme-money',
  'src/app/api/invoices/route.ts': 'etyme-money',
  'src/app/api/invoices/submit/route.ts': 'etyme-money',
  'src/app/api/payroll/off-cycle/route.ts': 'etyme-money',
  'src/app/api/payroll/reserve/route.ts': 'etyme-money',
  'src/app/api/payroll/statutory/route.ts': 'etyme-money',
  'src/app/api/profitability/master-contracts/route.ts': 'etyme-money',
  'src/app/api/purchase-orders/[id]/discounts/route.ts': 'etyme-money',
  'src/app/api/purchase-orders/route.ts': 'etyme-money',
  'src/app/api/rate-history/[id]/approve/route.ts': 'etyme-money',
  // etyme-supply
  'src/app/api/bench/burn/route.ts': 'etyme-supply',
  'src/app/api/bench/listings/route.ts': 'etyme-supply',
  'src/app/api/bench/route.ts': 'etyme-supply',
  'src/app/api/bench/share/route.ts': 'etyme-supply',
  'src/app/api/consultants/[id]/route.ts': 'etyme-supply',
  'src/app/api/consultants/route.ts': 'etyme-supply',
  'src/app/api/releasing-soon/route.ts': 'etyme-supply',
}

/**
 * Comments quote the old string on purpose; only what ships is checked.
 * And a sentence that runs over two source lines is still one sentence —
 * `'…needs the assignments.write ' + 'permission.'` reads as one thing
 * on a screen, so the adjacent literals are joined before the match.
 */
function whatShips(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/['"`]\s*\+\s*['"`]/g, '')
}

/**
 * The shapes a key takes when it reaches a person. The last of the three
 * is a template — `activate/route.ts` builds "needs the ${needs}
 * permission" — which a literal search would miss entirely.
 */
const SAYS_A_KEY = [
  /\b(needs?|Requires|requires)\s+(the\s+)?[a-z]+\.[a-z]+\b/,
  /\b(needs?|Requires|requires)\s+(the\s+)?\$\{[^}]+\}\s+permission/,
]

function routes(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) routes(full, found)
    else if (entry.endsWith('.ts')) found.push(full)
  }
  return found
}

describe('no refusal under the API hands somebody a permission key', () => {
  const root = join(process.cwd(), 'src/app/api')
  const offenders = routes(root)
    .map((f) => ({ file: relative(process.cwd(), f).split(sep).join('/'), src: whatShips(readFileSync(f, 'utf8')) }))
    .filter(({ src }) => SAYS_A_KEY.some((r) => r.test(src)))
    .map(({ file }) => file)

  it('has no route saying one that is not already written down as owed', () => {
    const fresh = offenders.filter((f) => !(f in STILL_SAYING_A_KEY))
    expect(
      fresh,
      `these hand a person a permission key in a sentence — import askTheDesk from @/lib/permissions:\n  ${fresh.join('\n  ')}`
    ).toEqual([])
  })

  it('keeps the owed list honest: every file on it still says one', () => {
    // A file fixed by its owner and left on the list makes the list a
    // lie, and the next agent trusts it.
    const fixed = Object.keys(STILL_SAYING_A_KEY).filter((f) => !offenders.includes(f))
    expect(
      fixed,
      `these have been fixed and can come off STILL_SAYING_A_KEY:\n  ${fixed.join('\n  ')}`
    ).toEqual([])
  })

  it('leaves regulation\'s own routes saying none', () => {
    const mine = offenders.filter((f) =>
      /^src\/app\/api\/(access|roles|blacklist|packets|outbound-pack|compliance|documents|document-shares|governance|tenure|bar|data-requests|legal-holds|breaches|shared|packet)\b/.test(f)
    )
    expect(mine).toEqual([])
  })
})
