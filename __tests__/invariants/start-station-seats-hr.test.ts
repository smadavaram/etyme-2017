import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hrInviteFor, hrRoleOf, hrSeatAt, isHrRefusal } from '../../scripts/simulate/stages/regulatory/hr-seat'

/**
 * The founder-scale run of 2026-11-01: the start station was refused 500
 * times "Clearing somebody to start is HR's work here", because 148 of
 * 160 generated suppliers seat nobody in HR. The refusal is right; the
 * station learns the way a firm would.
 */

const HR_REFUSAL = 'Clearing somebody to start is HR’s work here. Ask whoever runs Users & permissions for the HR seat, or have them raise it.'

/** A firm's seats, as the run's cast holds them, and what its Owner presses. */
function world(opts: { hr: boolean; roles: { id: string; name: string }[] }) {
  const calls: { method: string; path: string; body?: any }[] = []
  let hrSeated = opts.hr
  const actor = (key: string) => ({ key, name: key, company: { slug: 'world-sx-bramblewood' } }) as any
  const owner = {
    ...actor('world-sx-bramblewood/owner'),
    name: 'Yorick Larkspur',
    get: async (path: string) => { calls.push({ method: 'GET', path }); return { ok: true, status: 200, sentence: null, json: { data: { roles: opts.roles } } } },
    post: async (path: string, body: any) => { calls.push({ method: 'POST', path, body }); hrSeated = true; return { ok: true, status: 201, sentence: null, json: {} } },
  }
  const ctx = {
    log: () => {},
    cast: {
      at: (_slug: string, desk: string) => (desk === 'owner' ? owner : desk === 'hr' && hrSeated ? actor('world-sx-bramblewood/hr') : null),
      refresh: async () => { calls.push({ method: 'REFRESH', path: '' }); return [] },
    },
  } as any
  return { ctx, calls }
}

describe('the start station clears a start from HR, and seats HR where nobody holds it', () => {
  it('the clearance route’s refusal to a seat that is not HR is read as nobody holding HR, and no other refusal is', () => {
    expect(isHrRefusal({ status: 403, sentence: HR_REFUSAL })).toBe(true)
    expect(isHrRefusal({ status: 403, sentence: 'Only the account owner or an admin can invite somebody.' })).toBe(false)
    expect(isHrRefusal({ status: 422, sentence: HR_REFUSAL })).toBe(false)
  })

  it('the firm’s HR role is found among its own roles by name, and a firm with none gets no guess', () => {
    expect(hrRoleOf([{ id: 'r1', name: 'Compliance Officer' }, { id: 'r2', name: 'HR' }])).toEqual({ id: 'r2', name: 'HR' })
    expect(hrRoleOf([{ id: 'r1', name: 'Compliance Officer' }])).toBeNull()
  })

  it('the person the Owner invites into HR is the same each run, on a reserved address, with the reason', () => {
    const firm = { slug: 'world-sx-prime-02-bramblewood-partners', name: 'Bramblewood Partners' }
    const a = hrInviteFor(firm)
    expect(hrInviteFor(firm)).toEqual(a)
    expect(a.email).toBe('hr.sx-prime-02-bramblewood-partners@people.scale.invalid')
    expect(a.reason).toContain('Nobody at Bramblewood Partners holds HR, and clearing somebody to start is HR’s work')
  })

  it('a firm with an HR seat clears its starts from that seat, and its Owner is asked for nothing', async () => {
    const { ctx, calls } = world({ hr: true, roles: [] })
    const seat = await hrSeatAt(ctx, { id: 'f-with-hr', slug: 'world-sx-bramblewood', name: 'Bramblewood Partners' })
    expect(seat?.key).toBe('world-sx-bramblewood/hr')
    expect(calls).toEqual([])
  })

  it('where nobody holds HR, the Owner seats somebody there through Users & permissions, once per firm, and HR is the seat that asks', async () => {
    const { ctx, calls } = world({ hr: false, roles: [{ id: 'role-hr', name: 'HR' }] })
    const firm = { id: 'f-no-hr', slug: 'world-sx-bramblewood', name: 'Bramblewood Partners' }
    const [one, two] = await Promise.all([hrSeatAt(ctx, firm), hrSeatAt(ctx, firm)])
    expect(one?.key).toBe('world-sx-bramblewood/hr')
    expect(two?.key).toBe('world-sx-bramblewood/hr')
    const invites = calls.filter((c) => c.path === '/api/access/invite')
    expect(invites).toHaveLength(1)
    expect(invites[0].body.roleId).toBe('role-hr')
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST', 'REFRESH'])
  })

  it('a firm with no HR role keeps the refusal and nobody is invited', async () => {
    const { ctx, calls } = world({ hr: false, roles: [{ id: 'r1', name: 'Compliance Officer' }] })
    expect(await hrSeatAt(ctx, { id: 'f-no-role', slug: 'world-sx-bramblewood', name: 'Bramblewood Partners' })).toBeNull()
    expect(calls.some((c) => c.path === '/api/access/invite')).toBe(false)
  })

  it('the start walk asks again as HR after the Owner seats somebody there', () => {
    const walk = readFileSync(join(process.cwd(), 'scripts/simulate/stages/regulatory/paperwork-and-start.ts'), 'utf8')
    expect(walk).toContain('if (isHrRefusal(asked)) {')
    expect(walk).toContain("walk.hit.push('nobody seated in HR')")
    expect(walk).toContain("asked = await hr.post('/api/compliance/clearance', { contractId: p.id })")
  })
})
