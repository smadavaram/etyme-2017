import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/alerts', () => ({ reportError: vi.fn(async () => undefined) }))

import {
  GUARD_TRIGGERS, REMOVED, SECURITY_EVENTS, WRITTEN_BY, recordSecurityEvent, scrubFacts, securityEventRow,
} from '@/lib/identity/security-ledger'
import { reportError } from '@/lib/alerts'
import { assess, type ReadinessFacts } from '@/lib/readiness'

/**
 * Layer 7, slice S0 (record 86, answer 1): "A separate security log that
 * nothing can change." The rows are proved at the database in
 * __integration__/the-security-log-cannot-be-changed.test.ts; these are
 * the sentences that hold without one.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const SQL = read('prisma/sql/append-only.sql')
const SCHEMA = read('prisma/schema.prisma')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|mjs|js|sql|sh)$/.test(name)) out.push(full)
  }
  return out
}

describe('what a row of the security log never holds', () => {
  it('a row never keeps a secret, a one-time code, a token, a password or an email', () => {
    const kept = scrubFacts({
      secretSealed: 'v1.abc', code: '123456', otp: '654321', sessionToken: 't', password: 'p',
      email: 'someone@northwind-staffing.example', challenge: 'c', signature: 's',
      method: 'PASSKEY', targetKind: 'PaymentRun',
    })
    expect(kept).toEqual({ method: 'PASSKEY', targetKind: 'PaymentRun' })
  })

  it('a full account number or a six-digit code written into a sentence or a fact is removed', () => {
    const row = securityEventRow({
      event: 'BANK_CHANGE_ENTERED', surface: 'WEB',
      says: 'Northwind Staffing entered account 000123456789 and the code 482913.',
      facts: { note: 'typed 000123456789', nested: { line: 'code 482913' } },
    })
    expect(row.says).toBe(`Northwind Staffing entered account ${REMOVED} and the code ${REMOVED}.`)
    expect(JSON.stringify(row.facts)).not.toMatch(/\d{6,}/)
  })

  it('the last four digits of an account are kept, because that is all a payer checks against', () => {
    const row = securityEventRow({
      event: 'BANK_CHECKED', surface: 'WEB', says: 'Checked the account ending 6789.',
      facts: { accountLast4: '6789', routingLast4: '0021', bankName: 'Harborline Bank' },
    })
    expect(row.says).toBe('Checked the account ending 6789.')
    expect(row.facts).toEqual({ accountLast4: '6789', routingLast4: '0021', bankName: 'Harborline Bank' })
  })

  it('the security log has no tie to a person or a company, so erasing either never reaches it', () => {
    const model = SCHEMA.match(/^model SecurityEvent \{([\s\S]*?)^\}/m)![1]
    expect(model).not.toMatch(/@relation/)
    expect(model).not.toMatch(/\b(Person|Company)\b(?!Id)/)
  })
})

describe('the one writer', () => {
  it('a write that fails tells staff and never throws, so the act that called it decides', async () => {
    const broken = { securityEvent: { create: vi.fn(async () => { throw new Error('the database is gone') }) } }
    const id = await recordSecurityEvent(
      { event: 'SECOND_CHECK_FAILED', surface: 'WEB', says: 'A code was refused.', actorPersonId: 'p1', companyId: 'c1' },
      broken as never,
    )
    expect(id).toBeNull()
    expect(reportError).toHaveBeenCalledWith('security-log', expect.any(Error), { personId: 'p1', companyId: 'c1' })
  })

  it('the code writes to the security log only through its one writer, and never changes or deletes a row', () => {
    const offenders: string[] = []
    for (const f of walk(join(ROOT, 'src'))) {
      const text = readFileSync(f, 'utf8')
      if (/securityEvent\.(update|updateMany|delete|deleteMany|upsert)\b/.test(text)) offenders.push(`${f}: changes or deletes`)
      if (/securityEvent\.(create|createMany)\b/.test(text) && !f.endsWith('src/lib/identity/security-ledger.ts')) offenders.push(`${f}: writes around the writer`)
    }
    expect(offenders).toEqual([])
  })

  it('no event is said to be written by code that does not write it', () => {
    for (const e of SECURITY_EVENTS) {
      const by = WRITTEN_BY[e]
      if (by == null) continue
      expect(read(by), `${e} in ${by}`).toContain(`'${e}'`)
    }
  })
})

describe('the guard is the database’s, and the deploy puts it there', () => {
  it('the guard file refuses a change, a deletion and emptying the table, with every trigger /ready looks for', () => {
    expect(SQL).toMatch(/BEFORE UPDATE OR DELETE ON "SecurityEvent"\s+FOR EACH ROW/)
    expect(SQL).toMatch(/BEFORE TRUNCATE ON "SecurityEvent"\s+FOR EACH STATEMENT/)
    for (const t of GUARD_TRIGGERS) expect(SQL).toContain(`CREATE TRIGGER ${t}`)
  })

  it('the guard file can run on every deploy without a moment the table is unguarded', () => {
    expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION/)
    expect(SQL).not.toMatch(/DROP\s+TRIGGER/i)
    expect((SQL.match(/IF NOT EXISTS/g) ?? []).length).toBe(GUARD_TRIGGERS.length)
  })

  it('the deploy applies the guard right after every schema push, and fails the build where it cannot', () => {
    const sync = read('scripts/db-sync.mjs')
    const push = sync.indexOf("execSync('npx prisma db push")
    const guard = sync.indexOf("execSync('npx prisma db execute --file prisma/sql/append-only.sql")
    expect(push).toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(push)
    // Behind the same flag as the push: nothing runs on a build nobody asked to touch the database.
    expect(sync.indexOf('if (!asked)')).toBeLessThan(push)
    expect(sync.slice(guard)).toMatch(/process\.exit\(1\)/)
  })

  it('every test database carries the same guard as the deploy', () => {
    const templates = read('__integration__/templates.ts')
    expect(templates).toMatch(/psqlFile\(GUARD_SQL, building\)/)
    expect(templates).toMatch(/hashFiles\(\[schema, GUARD_SQL/)
  })

  it('no file in the product turns the security log’s guard off', () => {
    const offenders: string[] = []
    for (const dir of ['src', 'scripts', 'prisma']) {
      for (const f of walk(join(ROOT, dir))) {
        const text = readFileSync(f, 'utf8')
        if (/DISABLE\s+TRIGGER|session_replication_role|DROP\s+TRIGGER|DROP\s+FUNCTION\s+etyme_security/i.test(text)) offenders.push(f)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('/ready says whether the security log is guarded', () => {
  const BASE: ReadinessFacts = {
    env: { database: true, nextauthSecret: true, cronSecret: true, microsoft: true, google: true, emailLink: false, emailSender: true, anthropic: true },
    db: { reachable: true, schemaCurrent: true, ms: 10 },
    realCompanies: 1, realSignIns: 1, imports: { total: 1, committed: 1 }, email: { sent: 1, unsent: 0 },
    teams: { workflowsChannels: 1, retiredChannels: 0, postedByWorkflows: 1 },
    cron: { tracked: true, lastRunAt: new Date('2026-11-16T06:00:00Z'), lastBroke: 0 },
    watch: { staffConfigured: true, alertsSent: 1, incidentsToday: 0 },
    demo: { seeded: true, current: true }, privacyContact: true,
  }
  const NOW = new Date('2026-11-16T12:00:00Z')
  const edge = (f: ReadinessFacts) => assess(f, NOW).edges.find((e) => e.key === 'security-log')

  it('the deploy says the security log is protected only when its guard is present in the database', () => {
    expect(edge({ ...BASE, securityLog: { guarded: true } })).toMatchObject({
      state: 'PROVEN', required: true,
      says: 'The database refuses to change, delete or empty a row of the security log.',
    })
  })

  it('a missing guard keeps the deployment from reading ready, and says how to put it back', () => {
    const v = assess({ ...BASE, securityLog: { guarded: false } }, NOW)
    expect(v.ready).toBe(false)
    expect(v.edges.find((e) => e.key === 'security-log')).toMatchObject({
      state: 'MISSING',
      says: 'The database does not guard the security log, so a row could be changed or deleted.',
      fix: 'Set DB_PUSH_ON_BUILD=1 and redeploy: the build applies prisma/sql/append-only.sql after the schema. Then unset it.',
    })
  })
})
