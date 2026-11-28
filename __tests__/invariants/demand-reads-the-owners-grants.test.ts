import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rateOnEndingSoon } from '@/lib/releasing-soon'
import { grantedPermissions, NARROWED_AT_THE_QUERY } from '@/lib/permission-grants/rules'

const route = readFileSync(join(process.cwd(), 'src/app/api/decisions/route.ts'), 'utf8')
const SUPPLIER = 'brightmoor'
const line = (id: string) => ({ id, billRate: 14_500, companyId: SUPPLIER, clientCompanyId: 'northbend' })

describe('a team grant of margin.read prices only that team’s lines on the queue’s roll-offs', () => {
  it('the queue reads which lines this seat may price from supply’s billRateReach, as Rolloff does', () => {
    expect(route).toContain("import { billRateReach } from '@/lib/consultant-portfolio/margin-reach'")
    expect(route).toContain("hasPermission(caller.permissions, 'margin.read') ? await billRateReach(caller) : null")
    expect(route).toContain('permissions: caller.permissions, lines: priceReach }')
  })

  it('a roll-off on the Dayton team’s line shows its price to a seat granted margin for the Dayton team', () => {
    const reader = { companyId: SUPPLIER, permissions: ['margin.read'], lines: { all: false, ids: new Set(['dayton-line']) } }
    expect(rateOnEndingSoon(reader, line('dayton-line'))).toBe(14_500)
  })

  it('a roll-off on another team’s line shows that seat no price', () => {
    const reader = { companyId: SUPPLIER, permissions: ['margin.read'], lines: { all: false, ids: new Set(['dayton-line']) } }
    expect(rateOnEndingSoon(reader, line('belfast-line'))).toBeNull()
  })
})

describe('jobs and submissions are opened by a grant only for the whole company', () => {
  const seat = { companyId: SUPPLIER, roleId: 'recruiter', contextId: 'ctx' }
  const grant = (permission: string, scope: 'COMPANY' | 'UNIT' | 'PERSON') => ({
    companyId: SUPPLIER, permission, roleId: null, contextId: 'ctx', scope, orgUnitId: scope === 'UNIT' ? 'dayton' : null, revokedAt: null,
  })

  it('no permission that opens jobs or submissions is read narrowed at the query, so none is narrowed there', () => {
    for (const p of ['requirements.read', 'requirements.write', 'submissions.read', 'submissions.create']) {
      expect(NARROWED_AT_THE_QUERY.has(p)).toBe(false)
    }
  })

  it('a team or own-work grant of a job or submission permission never opens the firm’s jobs or submissions', () => {
    for (const p of ['requirements.read', 'submissions.read', 'submissions.create']) {
      expect(grantedPermissions([], seat, [grant(p, 'UNIT')])).toEqual([])
      expect(grantedPermissions([], seat, [grant(p, 'PERSON')])).toEqual([])
    }
  })

  it('a company-wide grant of a job or submission permission opens them as the role would', () => {
    expect(grantedPermissions([], seat, [grant('submissions.read', 'COMPANY')])).toEqual(['submissions.read'])
  })
})
