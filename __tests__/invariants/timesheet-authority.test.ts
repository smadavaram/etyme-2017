import { describe, it, expect } from 'vitest'
import { mayEnter, mayApprove, approvingOwnHours } from '@/lib/timesheet-authority'

/**
 * An approved timesheet is the goods receipt. The invoice, the three-way
 * match, the payment and the margin all rest on it — and approving it
 * required nothing but being signed in, so any account on the platform
 * could approve any timesheet at any company.
 *
 * Three parties, wanting three different things: the person enters their
 * hours, and nobody else does — their agency's allowance to enter on their
 * behalf was withdrawn by the founder on 2026-09-28 — and the buyer
 * approves.
 */

const CONTRACT = {
  personId: 'anita',
  vendorCompanyId: 'techpeple',
  clientCompanyId: 'terumo',
  endClientCompanyId: null,
}

const THREE_PARTY = { ...CONTRACT, clientCompanyId: 'globalstaff-msp', endClientCompanyId: 'terumo' }

function actor(over: Partial<Parameters<typeof mayEnter>[0]> = {}) {
  return {
    personId: 'somebody',
    companyId: 'terumo',
    permissions: ['timesheets.approve'] as readonly string[],
    ...over,
  }
}

describe('entering hours', () => {
  it('lets the person who worked them enter them', () => {
    expect(mayEnter(actor({ personId: 'anita', companyId: null, permissions: [] }), CONTRACT).ok).toBe(true)
  })

  it('refuses their agency, which is paid on the week and so does not file it for them', () => {
    // Was allowed until 2026-09-28. The founder: "worker files their own
    // week only". A week typed in by the firm paid on it is the firm
    // vouching for its own invoice.
    const v = mayEnter(
      actor({ companyId: 'techpeple', permissions: ['*'] }),
      { ...CONTRACT, personName: 'Anita Rao' }
    )
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('Only Anita Rao can file their week. Ask them to file it from their own page.')
  })

  it('refuses a stranger signed in at another company', () => {
    // What this used to allow: anybody at all submitting anybody's week.
    expect(mayEnter(actor({ companyId: 'rival', permissions: ['timesheets.read'] }), CONTRACT).ok).toBe(false)
  })

  it('refuses the client, who receives the work rather than reports it', () => {
    expect(mayEnter(actor({ companyId: 'terumo' }), CONTRACT).ok).toBe(false)
  })

  it('says who may, rather than just refusing', () => {
    const v = mayEnter(actor({ companyId: 'rival' }), CONTRACT)
    expect(v.reason).toBe('Only the person who worked these hours can file them. Ask them to file the week from their own page.')
  })
})

describe('approving hours', () => {
  it('lets the client approve work done for them', () => {
    expect(mayApprove(actor({ companyId: 'terumo' }), CONTRACT).ok).toBe(true)
  })

  it('lets the end client approve where somebody else is billed', () => {
    // The layer cake: an MSP is invoiced, the work happens at the
    // enterprise, and it is the enterprise that knows whether it happened.
    expect(mayApprove(actor({ companyId: 'terumo' }), THREE_PARTY).ok).toBe(true)
  })

  it('needs the permission, not merely the right company', () => {
    expect(mayApprove(actor({ companyId: 'terumo', permissions: [] }), CONTRACT).ok).toBe(false)
  })

  it('refuses a company with nothing to do with the contract', () => {
    const v = mayApprove(actor({ companyId: 'rival' }), CONTRACT)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/only the company being billed/i)
  })

  it('lets the agency approve, and says so, where the buyer is not on Etyme', () => {
    // Refusing would stop billing altogether for every vendor whose client
    // has not joined. Allowed, and recorded as what it is.
    const v = mayApprove(actor({ companyId: 'techpeple' }), CONTRACT)
    expect(v.ok).toBe(true)
    expect(v.reason).toMatch(/because the buyer is not on Etyme/i)
  })

  it('never lets anybody approve their own hours', () => {
    // Whatever else they hold. A consultant with a role at the client
    // would otherwise sign off their own week.
    expect(approvingOwnHours(actor({ personId: 'anita', companyId: 'terumo' }), CONTRACT)).toBe(true)
  })

  it('treats a wildcard permission as holding the permission', () => {
    expect(mayApprove(actor({ companyId: 'terumo', permissions: ['*'] }), CONTRACT).ok).toBe(true)
  })
})

describe('a seat on a public address is told its address is why it may not sign hours', () => {
  it('a seat invited on a public address is told its address, not its role, is why it may not sign hours off', () => {
    const v = mayApprove({ ...actor({ companyId: 'terumo', permissions: [] }), companyName: 'Tapin', publicSeat: true }, CONTRACT)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/^You were invited to Tapin on a public address/)
  })

  it('a seat on its company’s own address that cannot sign hours is still told who at the firm does', () => {
    const v = mayApprove({ ...actor({ companyId: 'terumo', permissions: [] }), companyName: 'Tapin', publicSeat: false }, CONTRACT)
    expect(v.ok).toBe(false)
    expect(v.reason).not.toMatch(/public address/)
  })

  it('every route that asks who may sign hours passes whether the seat is on a public address', () => {
    for (const f of ['src/app/api/timesheets/route.ts', 'src/app/api/timesheets/[id]/approve/route.ts', 'src/app/api/timesheets/[id]/reject/route.ts']) {
      expect(require('node:fs').readFileSync(f, 'utf8')).toContain('publicSeat: caller.publicSeat ?? false,')
    }
  })
})
