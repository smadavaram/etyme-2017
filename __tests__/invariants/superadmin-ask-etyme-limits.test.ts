import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The Superadmin screen for Ask Etyme's limits, and each person's free
 * trial (founder, 2026-11-11). Only what can lose money or trust: who may
 * open it, that every refusal and every change leaves a row, which number
 * wins, and when the trial ends.
 */

const h = vi.hoisted(() => ({
  caller: null as any,
  settings: new Map<string, any>(),
  changes: [] as any[],
  accessRows: [] as any[],
  company: [] as { id: string; slug: string; askEtymeModelOn: boolean }[],
  sums: { company: 0, person: 0 },
  /** The person's model-answered prompts: when each was asked. */
  firstAt: null as Date | null,
  firstWhere: null as any,
  /** Failed email notices, as the notification table holds them. */
  mail: [] as any[],
  /** Make the access log refuse a write. */
  logFails: false,
}))

vi.mock('@/lib/db', () => {
  const platformSetting = {
    findMany: async ({ where }: any) => [...h.settings.values()].filter((r) => where.key.in.includes(r.key)),
    upsert: async ({ where, create, update }: any) => {
      const row = h.settings.has(where.key) ? { ...h.settings.get(where.key), ...update } : { ...create }
      h.settings.set(where.key, row)
      return row
    },
    delete: async ({ where }: any) => { h.settings.delete(where.key) },
  }
  const platformSettingChange = {
    create: async ({ data }: any) => { h.changes.push(data); return data },
    findMany: async () => [...h.changes].reverse().map((c) => ({ ...c, changedBy: null })),
  }
  const prisma: any = {
    platformSetting,
    platformSettingChange,
    accessLog: {
      createMany: async ({ data }: any) => {
        if (h.logFails && data.some((r: any) => r.allowed !== false)) throw new Error('the log is down')
        h.accessRows.push(...data)
        return { count: data.length }
      },
    },
    company: {
      findUnique: async ({ where }: any) => h.company.find((c) => c.id === where.id) ?? null,
      findMany: async ({ where }: any) => [{ id: 'tp', name: 'Tapin' }].filter((c) => where.id.in.includes(c.id)),
    },
    person: {
      findMany: async ({ where }: any) => [{ id: 'p-vik', primaryEmail: 'vikash@gmail.com' }].filter((p) => where.id.in.includes(p.id)),
    },
    notification: {
      findMany: async ({ where, take }: any) =>
        h.mail.filter((n) => n.channel === where.channel && (where.OR ?? [where]).some((w: any) =>
          n.deliveryState === w.deliveryState && (!w.type || n.type === w.type)
          && (!w.title || String(n.title).includes(w.title.contains)))).slice(0, take),
    },
    modelPrompt: {
      aggregate: async ({ where }: any) => {
        const total = where.personId ? h.sums.person : h.sums.company
        return { _sum: { tokensIn: total, tokensOut: 0 } }
      },
      findFirst: async ({ where }: any) => { h.firstWhere = where; return h.firstAt ? { ts: h.firstAt } : null },
    },
  }
  prisma.$transaction = async (fn: any) => fn(prisma)
  return { prisma }
})
vi.mock('@/lib/alerts', () => ({ reportError: async () => undefined, staffAddresses: () => [] }))
vi.mock('@/lib/api-context', () => ({
  getCallerContext: async () => ({ caller: h.caller, error: null }),
  realPersonId: (c: any) => (c.isService ? null : c.person.id),
}))

import { GET, PATCH } from '@/app/api/superadmin/ask-etyme/route'
import {
  askEtymeAllowanceFor, currentAllowanceLimits, AT_THE_LINE, NOT_OPEN_YET, COUNTED_PURPOSES,
  PERSON_DAILY_ENV, COMPANY_MONTHLY_ENV, TRIAL_DAYS_KEY, DEFAULT_TRIAL_DAYS,
} from '@/lib/model-allowance'
import { checkLimit, LIMIT_SETTINGS, PERSON_DAILY_CEILING, limitsScreen } from '@/lib/ask-etyme-limits'

const person = (id: string, email: string) => ({ id, name: id, primaryEmail: email, timezone: null })
const SUPERADMIN = { person: person('sa', 'ops@etyme.com'), company: null, context: { id: 'staff:sa' }, permissions: [], staff: true }
const OWNER = {
  person: person('own', 'owner@northbend.example'), company: { id: 'nb', name: 'Northbend Athletic' },
  context: { id: 'ctx-own' }, permissions: ['settings.manage', 'access.manage'], staff: false,
}
const req = (body?: unknown) => ({ json: async () => body } as any)

const LIMITS = { [PERSON_DAILY_ENV]: '20000', [COMPANY_MONTHLY_ENV]: '500000' }
const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  h.caller = null
  h.settings = new Map()
  h.changes = []
  h.accessRows = []
  h.company = [{ id: 'nb', slug: 'northbend', askEtymeModelOn: true }, { id: 'tp', slug: 'tapin', askEtymeModelOn: true }]
  h.sums = { company: 0, person: 0 }
  h.firstAt = null
  h.firstWhere = null
  h.mail = []
  h.logFails = false
})

describe('only Etyme’s Superadmin opens or changes Ask Etyme’s limits', () => {
  it('a seat that is not on the staff list is refused in a sentence, and the refusal is in the access log before the answer goes out', async () => {
    h.caller = { ...OWNER, permissions: [] }
    const res = await GET(req())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.message).toContain("Etyme's Superadmin only")
    expect(body.data).toBeUndefined()
    // Written and waited for: the row is there the moment the response is.
    expect(h.accessRows).toHaveLength(1)
    expect(h.accessRows[0]).toMatchObject({ allowed: false, subjectId: 'own', actorPersonId: 'own', actorCompanyId: 'nb' })
  })

  it('an Owner of any company can neither open nor change the limits, and nothing is written but the refusals', async () => {
    h.caller = OWNER
    expect((await GET(req())).status).toBe(403)
    expect((await PATCH(req({ personDailyTokens: 999 }))).status).toBe(403)
    expect(h.settings.size).toBe(0)
    expect(h.changes).toEqual([])
    expect(h.accessRows.map((r) => r.allowed)).toEqual([false, false])
  })

  it('a change by the Superadmin is recorded with who and when, the number before and after', async () => {
    h.caller = SUPERADMIN
    const res = await PATCH(req({ personDailyTokens: '20,000', companyMonthlyTokens: 500000 }))
    expect(res.status).toBe(200)
    expect(h.settings.get(PERSON_DAILY_ENV)).toMatchObject({ value: '20000', setById: 'sa', setByEmail: 'ops@etyme.com' })
    expect(h.changes).toHaveLength(2)
    expect(h.changes[0]).toMatchObject({ key: PERSON_DAILY_ENV, oldValue: null, newValue: '20000', changedById: 'sa', changedByEmail: 'ops@etyme.com' })
    expect(h.changes[0].changedAt).toBeInstanceOf(Date)
    // Lowered later: the row says what it was.
    await PATCH(req({ personDailyTokens: 10000 }))
    expect(h.changes[2]).toMatchObject({ oldValue: '20000', newValue: '10000' })
    // The screen's last changes name who, with no company and no usage on it.
    const screen = (await (await GET(req())).json()).data
    expect(screen.history[0].says).toContain('ops@etyme.com changed "Each person, per day" from 20,000 tokens to 10,000 tokens.')
    expect(JSON.stringify(screen)).not.toMatch(/Northbend|\$/)
  })

  it('a number that is not a whole number, is below zero or is above the ceiling is refused and nothing changes', async () => {
    h.caller = SUPERADMIN
    for (const bad of ['lots', '-5', '12.5', PERSON_DAILY_CEILING + 1]) {
      const res = await PATCH(req({ personDailyTokens: bad }))
      expect(res.status, String(bad)).toBe(422)
    }
    expect(h.changes).toEqual([])
    const person = LIMIT_SETTINGS.find((s) => s.field === 'personDailyTokens')!
    expect(checkLimit(PERSON_DAILY_CEILING, person)).toEqual({ ok: true, value: String(PERSON_DAILY_CEILING) })
  })
})

describe('the screen first, the deployment second', () => {
  it('a number set on the Superadmin screen beats the deployment’s variable, and the variable decides where the screen sets none', async () => {
    h.settings.set(PERSON_DAILY_ENV, { key: PERSON_DAILY_ENV, value: '5000' })
    expect(await currentAllowanceLimits(LIMITS)).toEqual({ personDailyTokens: 5000, companyMonthlyTokens: 500000 })
    h.settings.clear()
    expect(await currentAllowanceLimits(LIMITS)).toEqual({ personDailyTokens: 20000, companyMonthlyTokens: 500000 })
  })

  it('with neither the screen nor the deployment setting the numbers, free text stays off for every company but Tapin', async () => {
    expect(await askEtymeAllowanceFor('nb', 'p1', new Date(), {})).toMatchObject({ may: false, why: 'NOT_OPEN', says: NOT_OPEN_YET })
    expect(await askEtymeAllowanceFor('tp', 'p1', new Date(), {})).toEqual({ may: true, limited: false })
  })

  it('the Superadmin screen names the company free text stays open for as Tapin, never its address tapin', () => {
    const { note } = limitsScreen([], [], {})
    expect(note).toContain('every company but Tapin.')
    expect(note).toContain('Tapin has no trial end.')
    expect(note).not.toMatch(/\btapin\b/)
  })
})

describe('every person’s free trial', () => {
  const NOW = new Date('2026-11-14T12:00:00Z')

  it('the trial starts at the person’s first free-text question and ends the set number of days after it, then the plan’s sentence is said', async () => {
    expect(DEFAULT_TRIAL_DAYS).toBe(3)
    // First asked three days less a minute ago: still inside.
    h.firstAt = new Date(NOW.getTime() - 3 * DAY + 60_000)
    expect(await askEtymeAllowanceFor('nb', 'p1', NOW, LIMITS)).toEqual({ may: true, limited: true })
    // Three whole days ago: over.
    h.firstAt = new Date(NOW.getTime() - 3 * DAY)
    expect(await askEtymeAllowanceFor('nb', 'p1', NOW, LIMITS)).toEqual({
      may: false, why: 'TRIAL_OVER', says: AT_THE_LINE, links: [{ text: 'Talk to us', href: '/contact' }], upgrade: null,
    })
    expect(AT_THE_LINE).not.toMatch(/\bAI\b|\bmodel\b|\$|\d|\bpro\b|\bpremium\b/i)
    // The Superadmin sets five days: the same person is inside again.
    h.settings.set(TRIAL_DAYS_KEY, { key: TRIAL_DAYS_KEY, value: '5' })
    expect(await askEtymeAllowanceFor('nb', 'p1', NOW, LIMITS)).toEqual({ may: true, limited: true })
  })

  it('a question the rules answer never starts the trial: only model-answered rows in the prompt log are read', async () => {
    h.firstAt = null
    expect(await askEtymeAllowanceFor('nb', 'p1', new Date('2027-06-01T00:00:00Z'), LIMITS)).toEqual({ may: true, limited: true })
    expect(h.firstWhere).toEqual({ personId: 'p1', purpose: { in: [...COUNTED_PURPOSES] } })
  })

  it('the token limits still hold inside the trial', async () => {
    h.firstAt = new Date(NOW.getTime() - DAY)
    h.sums = { company: 0, person: 20_000 }
    expect(await askEtymeAllowanceFor('nb', 'p1', NOW, LIMITS)).toMatchObject({ may: false, why: 'PERSON_DAY' })
    h.sums = { company: 500_000, person: 0 }
    expect(await askEtymeAllowanceFor('nb', 'p1', NOW, LIMITS)).toMatchObject({ may: false, why: 'COMPANY_MONTH' })
  })

  it('Tapin is exempt from the trial’s end, and its token limits still hold once they are set', async () => {
    h.firstAt = new Date(NOW.getTime() - 30 * DAY)
    expect(await askEtymeAllowanceFor('tp', 'p1', NOW, LIMITS)).toEqual({ may: true, limited: true })
    h.sums = { company: 0, person: 20_000 }
    expect(await askEtymeAllowanceFor('tp', 'p1', NOW, LIMITS)).toMatchObject({ may: false, why: 'PERSON_DAY' })
  })
})

describe('the Superadmin reads the email that did not go', () => {
  const failed = () => ({
    id: 'n1', channel: 'EMAIL', deliveryState: 'FAILED', createdAt: new Date('2026-11-12T15:40:00Z'),
    type: 'SYSTEM', title: 'Sharath invited you to Tapin', companyId: 'tp', personId: 'p-vik',
    deliveryNote: 'Resend answered 403: The etyme.com domain is not verified. Please add and verify your domain.',
  })

  it('the list shows when, the kind of notice, the company, the provider’s status and its own words, and the recipient masked', async () => {
    h.caller = SUPERADMIN
    h.mail = [failed()]
    const mail = (await (await GET(req())).json()).data.mail
    expect(mail.rows).toHaveLength(1)
    expect(mail.rows[0]).toMatchObject({
      at: 'Thu, Nov 12, 3:40 PM UTC', kind: 'Invitation', company: 'Tapin', provider: 'Resend', status: 403,
      failureKind: 'REFUSED', recipient: 'v…@gmail.com',
    })
    expect(mail.rows[0].words).toContain('domain is not verified')
  })

  it('an invitation held back because no email sender is set up is listed, and a demo address’s skipped send is not', async () => {
    h.caller = SUPERADMIN
    h.mail = [
      { ...failed(), id: 'n2', deliveryState: 'NOT_CONFIGURED', deliveryNote: 'No email provider set up, so this was recorded and not sent.' },
      { ...failed(), id: 'n3', deliveryState: 'DEMO_SKIPPED', deliveryNote: 'A demo address' },
    ]
    const mail = (await (await GET(req())).json()).data.mail
    expect(mail.rows).toHaveLength(1)
    expect(mail.rows[0]).toMatchObject({ id: 'n2', kind: 'Invitation', failureKind: 'NOT_SET_UP', provider: null, words: null, recipient: 'v…@gmail.com' })
  })

  it('the list never carries a notice’s title, its body, a person’s name or a full address', async () => {
    h.caller = SUPERADMIN
    h.mail = [failed()]
    const text = JSON.stringify((await (await GET(req())).json()).data.mail)
    expect(text).not.toContain('vikash@gmail.com')
    expect(text).not.toContain('invited you to')
    expect(text).not.toContain('Sharath')
  })

  it('reading the list writes an access-log row, waited for before the list is sent', async () => {
    h.caller = SUPERADMIN
    h.mail = [failed()]
    await GET(req())
    const read = h.accessRows.filter((r) => r.action === 'SUPERADMIN_EMAIL_FAILURES_READ')
    expect(read).toHaveLength(1)
    expect(read[0]).toMatchObject({ allowed: true, subjectId: 'sa', actorPersonId: 'sa' })
    expect(read[0].reason).toContain('did not go')
  })

  it('where the read cannot be logged, the list is not sent and the screen says so in a sentence', async () => {
    h.caller = SUPERADMIN
    h.mail = [failed()]
    h.logFails = true
    const mail = (await (await GET(req())).json()).data.mail
    expect(mail.rows).toBeNull()
    expect(mail.says).toBe('The list of email that did not go could not be read just now. Reload to try again.')
  })

  it('a person who is not on the staff list is refused the list in the screen’s own sentence, and the refusal is logged before it is sent', async () => {
    h.caller = OWNER
    h.mail = [failed()]
    const res = await GET(req())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.data).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('Tapin')
    expect(h.accessRows).toHaveLength(1)
    expect(h.accessRows[0].allowed).toBe(false)
  })

  it('with email set up and nothing failed or held back, the screen says every email left', async () => {
    h.caller = SUPERADMIN
    vi.stubEnv('NOTIFY_FROM_EMAIL', 'notices@etyme.example')
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    try {
      const mail = (await (await GET(req())).json()).data.mail
      expect(mail).toEqual({ rows: [], says: 'Every email sent from here has left. Nothing failed or was held back.' })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('with no email sender set up and nothing listed, the screen says no email can leave, never that every email left', async () => {
    h.caller = SUPERADMIN
    vi.stubEnv('NOTIFY_FROM_EMAIL', '')
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('SENDGRID_API_KEY', '')
    try {
      const mail = (await (await GET(req())).json()).data.mail
      expect(mail).toEqual({ rows: [], says: 'No email sender is set up on this deployment, so no email can leave from here yet.' })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

