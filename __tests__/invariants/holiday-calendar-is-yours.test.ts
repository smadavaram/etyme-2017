import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CALENDAR_PERMISSION, mayEditCalendar } from '@/app/api/holidays/who'

/**
 * A holiday calendar is the company's own, and now it is payroll.
 *
 * `POST /api/holidays` read `companyId` out of the request body and wrote
 * to it. `DELETE` took a holiday id and removed the row wherever it
 * lived. Both were cross-tenant writes from the day they were written;
 * since cycle dates began shifting off a company's own calendar they are
 * also a way to move another firm's pay day — add a Friday to a
 * supplier's calendar and everybody that supplier pays is paid on the
 * Thursday, take one away and they are paid back on the Friday.
 *
 * The GET on the same route always did it correctly, which is what makes
 * this worth a test rather than a fix: one verb of three was checked.
 */

const ANOTHER_FIRM = 'company-cavanaugh'

function caller(over: Partial<{ companyId: string | null; companyName: string; permissions: string[] }> = {}) {
  return {
    companyId: 'company-veritan',
    companyName: 'Veritan Talent',
    permissions: [CALENDAR_PERMISSION],
    ...over,
  }
}

describe('whose calendar a person may change', () => {

  it('somebody at one firm cannot write a holiday onto another firm’s calendar', () => {
    const verdict = mayEditCalendar(caller(), ANOTHER_FIRM)
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.status).toBe(403)
    expect(verdict.says).toContain('another company')
  })

  it('the refusal says why it matters, in a sentence, rather than naming a code', () => {
    const verdict = mayEditCalendar(caller(), ANOTHER_FIRM)
    if (verdict.ok) throw new Error('should have been refused')
    expect(verdict.says).toContain('pay days')
    expect(verdict.says).not.toContain('FORBIDDEN')
    expect(verdict.says).toContain('Veritan Talent')
  })

  it('a person may change their own company’s calendar, named or not named in the request', () => {
    expect(mayEditCalendar(caller(), null)).toEqual({ ok: true, companyId: 'company-veritan' })
    expect(mayEditCalendar(caller(), 'company-veritan')).toEqual({ ok: true, companyId: 'company-veritan' })
  })

  it('a calendar change needs the same permission as every other company setting', () => {
    expect(CALENDAR_PERMISSION).toBe('settings.manage')
    const verdict = mayEditCalendar(caller({ permissions: ['timesheets.read'] }), null)
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.says).toContain('Ask an owner or an admin')
  })

  it('a signed-in person who is at no company at all has no calendar to change', () => {
    const verdict = mayEditCalendar(caller({ companyId: null }), null)
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.says).toContain('belongs to a company')
  })
})

// ── The route itself, not only the rule ──────────────────────────────
//
// The rule above is pure and the route is where it was missing, so the
// handlers are called with a session and a database that are stand-ins.

vi.mock('@/lib/api-context', () => ({
  getCallerContext: async () => ({
    caller: {
      person: { id: 'person-1', name: 'Dana Whitfield', primaryEmail: 'dana@veritan.example', timezone: null },
      context: { id: 'ctx-1', type: 'EMPLOYEE', companyId: 'company-veritan', roleId: 'role-1' },
      company: { id: 'company-veritan', name: 'Veritan Talent', slug: 'veritan', kind: 'VENDOR', outsideAccess: 'ALLOWED', accountWalls: false, isDemo: false },
      permissions: ['settings.manage'],
    },
    error: null,
  }),
}))

const holidaysCreated: any[] = []
const holidaysDeleted: any[] = []
const logged: any[] = []
/** Every holiday in the world, across two firms. */
const world = [
  { id: 'hol-ours', name: 'Founders Day', companyId: 'company-veritan', date: new Date('2026-07-06') },
  { id: 'hol-theirs', name: 'Plant shutdown', companyId: ANOTHER_FIRM, date: new Date('2026-07-06') },
]

vi.mock('@/lib/db', () => ({
  prisma: {
    company: { findUnique: async ({ where }: any) => ({ id: where.id, name: 'Veritan Talent' }) },
    holiday: {
      findFirst: async ({ where }: any) =>
        world.find((h) => h.id === where.id && (!where.companyId || h.companyId === where.companyId)) ?? null,
      findUnique: async ({ where }: any) => world.find((h) => h.id === where.id) ?? null,
      delete: async ({ where }: any) => { holidaysDeleted.push(where.id); return world[0] },
      create: async ({ data }: any) => { holidaysCreated.push(data); return { id: 'new', ...data } },
    },
    automationLog: { create: async ({ data }: any) => { logged.push(data); return data } },
    $transaction: async (fn: any) => fn({
      holiday: { create: async ({ data }: any) => { holidaysCreated.push(data); return { id: 'new', ...data } } },
      automationLog: { create: async ({ data }: any) => { logged.push(data); return data } },
    }),
  },
}))

const { POST, DELETE } = await import('@/app/api/holidays/route')

function body(payload: unknown) {
  return new Request('http://localhost/api/holidays', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  }) as any
}

describe('the route refuses the same way the rule does', () => {

  beforeEach(() => {
    holidaysCreated.length = 0
    holidaysDeleted.length = 0
    logged.length = 0
  })

  it('a holiday posted against another firm’s id is refused and nothing is written to their calendar', async () => {
    const res = await POST(body({ companyId: ANOTHER_FIRM, holidays: [{ date: '2026-12-24', name: 'Shutdown' }] }))
    expect(res.status).toBe(403)
    expect(holidaysCreated).toHaveLength(0)
  })

  it('a holiday posted with no company at all goes on the caller’s own calendar', async () => {
    const res = await POST(body({ holidays: [{ date: '2026-12-24', name: 'Shutdown' }] }))
    expect(res.status).toBe(200)
    expect(holidaysCreated).toHaveLength(1)
    expect(holidaysCreated[0].companyId).toBe('company-veritan')
  })

  it('somebody at one firm cannot delete a day off another firm’s calendar', async () => {
    const res = await DELETE(body({ id: 'hol-theirs' }))
    expect(res.status).toBe(404)
    expect(holidaysDeleted).toHaveLength(0)
    expect((await res.json()).error.message).toContain('No such day on this calendar')
  })

  it('a person removing a day from their own calendar is told the dates already generated do not move', async () => {
    const res = await DELETE(body({ id: 'hol-ours' }))
    expect(res.status).toBe(200)
    expect(holidaysDeleted).toEqual(['hol-ours'])
    expect((await res.json()).data.note).toContain('already generated keep their dates')
  })

  it('a refusal leaves no row anywhere, and the route says why rather than passing over it', async () => {
    // CLAUDE.md asks that refusals be recorded and neither ledger will
    // take this one: AccessLog's subject is a required Person and a
    // calendar has none, and a new AutomationLog action needs a rung in
    // lib/autonomy.ts, which is the architect's file. Three names are
    // asked for in the route rather than invented here.
    await POST(body({ companyId: ANOTHER_FIRM, holidays: [{ date: '2026-12-24', name: 'Shutdown' }] }))
    expect(logged).toHaveLength(0)
    const route = readFileSync(join(process.cwd(), 'src/app/api/holidays/route.ts'), 'utf8')
    expect(route).toContain('HOLIDAY_ADD_REFUSED')
    expect(route).toContain('a fabricated row is worse than a missing one')
  })
})
