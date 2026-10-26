import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dashboardReads, NOT_YOURS } from '@/lib/dashboard-reads'
import {
  todayReads, NOT_YOURS_TODAY, rollOffSays, lastDaySays, benchSays, pictureLine, byClient,
  weeksByPerson, queueRowView, type QueueRowIn, type RollingOffIn,
} from '@/lib/today-page'
import { rolesFor } from '@/lib/company-defaults'

/**
 * The dashboard asks only for what the seat may read.
 *
 * Found by a tester on 2026-09-30: every client desk's dashboard visit
 * sent `GET /api/automation?limit=5` and got a 403, the AP clerk and an
 * integrator's engineer got a 403 from `GET /api/bench`, and nothing on
 * the screen said anything was missing.
 */

const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/page.tsx'), 'utf8')
const role = (kind: Parameters<typeof rolesFor>[0], name: string) => rolesFor(kind).find((r) => r.name === name)!.permissions

describe('the dashboard calls no route the seat cannot read', () => {
  it('an integrator’s engineer holding two read permissions is not asked for the bench or the automation log', () => {
    expect(dashboardReads(['assignments.read', 'timesheets.read'])).toEqual({ bench: false, automation: false, target: false, pipeline: false })
  })

  it('a supplier’s AP & Payroll desk, which reads no consultants, does not ask for the bench', () => {
    expect(dashboardReads(role('VENDOR', 'AP & Payroll')).bench).toBe(false)
  })

  it('the owner of a firm reads both panels', () => {
    expect(dashboardReads(['*'])).toEqual({ bench: true, automation: true, target: true, pipeline: true })
  })

  it('a recruiter who reads consultants is asked for the bench, as the menu offers it', () => {
    expect(dashboardReads(role('VENDOR', 'Recruiter')).bench).toBe(true)
  })

  it('before the seat is known nothing is asked for', () => {
    expect(dashboardReads(null)).toEqual({ bench: false, automation: false, target: false, pipeline: false })
  })

  it('a reader sent on to a console of their own is sent before anything is fetched', () => {
    expect(PAGE).toMatch(/if \(sendingOn\) return\s*\n\s*fetchDashboard\(\)/)
  })
})

/**
 * A selling firm's Today page (founder, 2026-10-19, "Nine links, no flip,
 * and every first screen names a person"): what a firm asks on a Tuesday,
 * each figure with the names, and none of the machine's own numbers.
 */
const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/today/route.ts'), 'utf8')

describe('a firm’s Today page reads each part only for the roles that read it', () => {
  it('the owner reads billing, bills, who is where and the bench', () => {
    expect(todayReads(['*'], 'VENDOR')).toEqual({ billing: true, bills: true, people: true, bench: true })
  })

  it('a recruiter reads who is where, who rolls off and the bench, and no money', () => {
    expect(todayReads(role('VENDOR', 'Recruiter'), 'VENDOR')).toEqual({ billing: false, bills: false, people: true, bench: true })
  })

  it('accounts receivable reads the bills and no bill rates, so no monthly billing figure', () => {
    const ar = todayReads(role('VENDOR', 'Accounts Receivable'), 'VENDOR')
    expect(ar.bills).toBe(true)
    expect(ar.billing).toBe(false)
  })

  it('a program office reads no bench, whatever its seat holds', () => {
    expect(todayReads(['*'], 'MSP').bench).toBe(false)
  })

  it('before the seat is known nothing is read', () => {
    expect(todayReads(null)).toEqual({ billing: false, bills: false, people: false, bench: false })
  })

  it('a part the seat may not read says so in a sentence, never a zero', () => {
    for (const says of Object.values(NOT_YOURS_TODAY)) expect(says).toMatch(/^Not yours to see: /)
    expect(PAGE).toContain('NOT_YOURS_TODAY.billing')
    expect(PAGE).toContain('NOT_YOURS_TODAY.bills')
    expect(PAGE).toContain('NOT_YOURS_TODAY.people')
    expect(PAGE).toContain('NOT_YOURS_TODAY.bench')
  })
})

describe('every figure on a firm’s Today page names the people behind it', () => {
  it('a roll-off says the client, the days left and the last day, never “Rolloff in 14d”', () => {
    expect(rollOffSays({ client: 'Northbend Athletic', days: 14, lastDay: '2026-11-02' }))
      .toBe('rolls off Northbend Athletic in 14 days · last day Nov 2, 2026')
    expect(rollOffSays({ client: 'Northbend Athletic', days: 1, lastDay: '2026-10-20', started: true }))
      .toBe('rolls off Northbend Athletic tomorrow · last day Oct 20, 2026 · roll-off started')
    expect(lastDaySays({ name: 'Felix Brenner', lastDay: '2026-11-06' }, '2026-10-19')).toBe('Felix Brenner, last day Nov 6')
  })

  it('somebody on the bench is said with the day they joined it, never a count of days in a chip', () => {
    expect(benchSays({ name: 'Karthik Menon', since: '2026-09-30' }, '2026-10-19')).toBe('Karthik Menon, since Sep 30')
    expect(benchSays({ name: 'Rajesh Iyer', since: '2025-12-01' }, '2026-10-19')).toBe('Rajesh Iyer, since Dec 1, 2025')
    expect(PAGE).not.toMatch(/daysSince|\}d`/)
  })

  it('the line under the headline counts people, clients, roll-offs, the bench and unbilled weeks in plain words', () => {
    expect(pictureLine({ onSite: { people: 5, clients: 2 }, rollingOff: 2, bench: 1, signedWeeks: 3 }))
      .toBe('5 people billing at 2 clients. 2 roll off within 30 days. 1 on the bench. 3 weeks signed and not yet billed.')
    expect(pictureLine({ onSite: { people: 1, clients: 1 }, rollingOff: 1, bench: 0, signedWeeks: 0 }))
      .toBe('1 person billing at 1 client. 1 rolls off within 30 days. Nobody on the bench. Every signed week is billed.')
  })

  it('a part the seat may not read is left out of that line rather than said as nothing', () => {
    expect(pictureLine({ onSite: { people: 3, clients: 2 }, rollingOff: 0, bench: 3, signedWeeks: null }))
      .toBe('3 people billing at 2 clients. Nobody rolls off within 30 days. 3 on the bench.')
  })

  it('who is where groups people by client in the order of the client’s name, and each client’s weeks name each person once', () => {
    const groups = byClient(
      [{ at: 'Northbend Athletic', n: 'Omar Haddad' }, { at: 'Nordway Retail', n: 'Ravi Subramanian' }, { at: 'Northbend Athletic', n: 'Rosa Delgado' }],
      (r) => r.at
    )
    expect(groups.map((g) => [g.client, g.rows.map((r) => r.n)])).toEqual([
      ['Nordway Retail', ['Ravi Subramanian']],
      ['Northbend Athletic', ['Omar Haddad', 'Rosa Delgado']],
    ])
    expect(weeksByPerson([{ personName: 'Karthik Menon' }, { personName: 'Marcus Whitfield' }, { personName: 'Karthik Menon' }]))
      .toBe('Karthik Menon, 2 weeks · Marcus Whitfield, 1 week')
  })
})

describe('Yours to decide on a firm’s Today page names each row and offers its act plainly', () => {
  const rolling = new Map<string, RollingOffIn>([
    ['sc1', { contractId: 'sc1', client: 'Northbend Athletic', days: 14, lastDay: '2026-11-02', started: false }],
    ['sc2', { contractId: 'sc2', client: 'Northbend Athletic', days: 25, lastDay: '2026-11-13', started: true }],
  ])
  const rolloff = (id: string): QueueRowIn => ({
    type: 'ROLLOFF_ACTION', title: 'Rolls off in 14 days — Felix Brenner', subtitle: 'Northbend Athletic · $132/hr · Nobody has acted yet',
    entityId: id, actionUrl: '/dashboard/rolloff', named: { whose: 'Felix Brenner', what: 'last day' },
  })

  it('a roll-off nobody has started offers Start roll-off through the one route that starts it, by name and in words', () => {
    const v = queueRowView(rolloff('sc1'), rolling, { terminate: true })
    expect(v.who).toBe('Felix Brenner')
    expect(v.says).toBe('rolls off Northbend Athletic in 14 days · last day Nov 2, 2026')
    expect(v.act).toEqual({ label: 'Start roll-off', url: '/api/contracts/sc1/rolloff', busy: 'Starting…' })
  })

  it('a roll-off already started, or a seat that may not end placements, gets Look and no button', () => {
    expect(queueRowView(rolloff('sc2'), rolling, { terminate: true }).act).toBeNull()
    expect(queueRowView(rolloff('sc1'), rolling, { terminate: false }).act).toBeNull()
  })

  it('a week offers Approve or Accept only where nothing about it needs a reason or a decision first', () => {
    const week = (over: Partial<QueueRowIn>): QueueRowIn => ({
      type: 'TIMESHEET_APPROVAL', title: 'Approve timesheet — Omar Haddad', subtitle: '40 hours · Northbend Athletic · Oct 4 – Oct 10',
      entityId: 'ts1', actionUrl: '/dashboard/timesheets?id=ts1', named: { whose: 'Omar Haddad', what: 'week' }, ...over,
    })
    expect(queueRowView(week({}), rolling, { terminate: false }).act?.label).toBe('Approve')
    expect(queueRowView(week({ title: 'Accept timesheet — Omar Haddad' }), rolling, { terminate: false }).act?.label).toBe('Accept')
    expect(queueRowView(week({ flag: { says: 'More hours than the job runs' } }), rolling, { terminate: false }).act).toBeNull()
    expect(queueRowView(week({}), rolling, { terminate: false }).says).toBe('week to approve · 40 hours · Northbend Athletic · Oct 4 – Oct 10')
  })

  it('the page prints the queue’s own words, which say days and hours in full, and rewords nothing', () => {
    // The queue writes "3 days since submitted" itself (app/api/decisions/words);
    // a second rewording on this page was a second text for one row.
    const row: QueueRowIn = {
      type: 'SUBMISSION_REVIEW', title: 'Review Java developer — Ana Lima', subtitle: 'Java developer · $95/hr · 3 days since submitted',
      entityId: 's1', actionUrl: '/dashboard/submissions', named: { whose: 'Ana Lima', what: 'candidate' },
    }
    expect(queueRowView(row, rolling, { terminate: false }).says).toBe('Java developer · $95/hr · 3 days since submitted')
    expect(readFileSync(join(process.cwd(), 'src/lib/today-page.ts'), 'utf8')).not.toContain('plainUnits')
  })

  it('no button on the page is drawn in the attention color', () => {
    expect(PAGE).not.toMatch(/chip--danger|chip--attention|text-etyme-attention|bg-etyme-attention/)
  })
})

describe('a firm’s Today page shows the firm’s people and money, not the machine’s numbers', () => {
  it('the headline is the decision queue’s own sentence, word for word', () => {
    // Through Needs attention's own address, so a seat in a client's
    // program reads that program's sentence and a seat at home its own.
    expect(PAGE).toContain('fetch(decisionsAddress(search))')
    expect(PAGE).toMatch(/q\?\.data\?\.says/)
    expect(PAGE).toContain('{queue.says}')
  })

  it('the page asks two routes, the queue and the Today read, and nothing else', () => {
    // The two reads, then the one act a row's button sends (`fetch(url, …)`).
    const asked = [...PAGE.matchAll(/fetch\(([^,)]+(?:\)[^,)]*)?)[,)]/g)].map((m) => m[1].trim())
    expect(asked.filter((a) => a !== 'url')).toEqual([
      'decisionsAddress(search)',
      "client ? `/api/today?clientCompanyId=${encodeURIComponent(client)}` : '/api/today'",
    ])
  })

  it('the Number, cost per submission, the pipeline and its bars, the revenue estimate and the system activity log are gone, and the ledger is one link', () => {
    for (const gone of ['The number', 'Cost per submission', 'Contract Pipeline', 'PipelineRow', 'est. monthly', 'System activity', '/api/bar', '/api/automation', 'Event created']) {
      expect(PAGE, gone).not.toContain(gone)
    }
    expect(PAGE).toContain('Everything Etyme did, in the ledger')
    expect(PAGE).toContain('href="/dashboard/twin"')
  })

  it('every figure is read from the service that computes it, never worked out on the page', () => {
    expect(ROUTE).toContain('firmTuesday(company.id, now)')
    expect(ROUTE).toContain('rollingOffAt(company.id, now)')
    expect(ROUTE).toContain('benchAt(company.id, now)')
    expect(ROUTE).toContain('unpaidBills(company.id, now)')
    expect(PAGE).not.toMatch(/\* 160|billRate|reduce\(/)
  })

  it('the route logs every person it names before the answer leaves, the reader’s own line excepted', () => {
    expect(ROUTE).toMatch(/logBulkAccess\(placed,/)
    expect(ROUTE).toMatch(/logBulkAccess\(benched,/)
    expect(ROUTE).toContain('id !== caller.person.id')
  })

  it('a date on the page goes through the one date formatter', () => {
    expect(PAGE).toContain("from '@/lib/format-date'")
    expect(PAGE).not.toMatch(/toLocaleDateString|toLocaleString/)
  })
})
