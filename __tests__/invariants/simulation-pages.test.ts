/**
 * The pages pass (scripts/simulate/pages.ts, founder 2026-11-01: "Do load
 * and performance testing for 100000 transactions on each page").
 *
 * The pass itself needs a built app and a kept simulation database; these
 * are the parts that do not, held so its report can be trusted: which
 * seats are read, which pages and reads each opens (off the real menu),
 * how a page is opened, and the arithmetic and words of the report.
 */
import { describe, it, expect } from 'vitest'
import { createServer } from 'node:http'
import { getNavForKind, type NavSection } from '@/lib/nav-table'
import { DEMO_COOKIE } from '@/lib/demo-session'
import { Actor, type SeatSpec } from '../../scripts/simulate/actors'
import { Ledger } from '../../scripts/simulate/ledger'
import { routeOf } from '../../scripts/simulate/routes'
import {
  PARTIES, PROBES, GREETING_READS, SHELL_READS, behindThePages, kindOf, menuFor, pageFaults, pageStats, pagesOf,
  pagesReportMarkdown, parsePagesArgs, pickSeats, readsOf, roundOf, type Busy, type Hit, type PagesRecord,
} from '../../scripts/simulate/pages-plan'

function seat(key: string, over: Partial<SeatSpec> = {}): SeatSpec {
  const [slug] = key.split('/')
  return {
    key, door: { as: slug }, personName: key, email: `${key.replace(/\W/g, '.')}@seed.invalid`, personId: `p-${key}`, role: 'Owner',
    company: { id: `c-${slug}`, slug, name: slug, kind: 'CLIENT' }, ...over,
  }
}
const noBusy: Busy = { firms: new Map(), people: new Map(), seated: new Set() }

function hit(over: Partial<Hit>): Hit {
  return { party: 'client', seat: 'world-nike/hiring', kind: 'page', label: 'Jobs', path: '/dashboard/requisitions', status: 200, ms: 100, owner: 'DEMAND', ...over }
}

function record(over: Partial<PagesRecord> = {}): PagesRecord {
  return {
    stamp: '20261101120000', startedAt: new Date(0), finishedAt: new Date(60_000), db: 'etyme_sim_20261101110000', base: 'http://localhost:1',
    build: 'the existing build was reused', args: { concurrency: 40, rounds: 3, warmup: 1, firms: 2, timeoutMs: 60_000 },
    seats: [{ party: 'client', role: 'hiring manager', key: 'world-nike/hiring', personName: 'Dana Whitfield', firm: 'Northbend Athletic', why: 'named', pages: 23, reads: 26, seatedAt: null, region: null }],
    countsBefore: { Requirement: 10, Timesheet: 50 }, countsAfter: { Requirement: 10, Timesheet: 50, AccessLog: 7 },
    hits: [hit({}), hit({ kind: 'read', label: '/api/requisitions', path: '/api/requisitions', status: 403, sentence: 'Only HR reads this.' })],
    warmupErrors: [], ...over,
  }
}

describe('The pages pass is told what to read in flags', () => {
  it('reads only a database a simulation kept, and says where to find its name', () => {
    expect(() => parsePagesArgs([])).toThrow(/--db etyme_sim_<stamp>/)
    expect(() => parsePagesArgs(['--db', 'etyme_tpl_world_20261101_abc'])).toThrow(/not a simulation database/)
    expect(() => parsePagesArgs(['--db', 'etyme_sim_1; drop database x'])).toThrow(/not a simulation database/)
  })

  it('defaults to forty calls at once, one untimed and three timed rounds, and two firms per role', () => {
    const a = parsePagesArgs(['--db', 'etyme_sim_20261101180424'])
    expect([a.concurrency, a.warmup, a.rounds, a.firms, a.build]).toEqual([40, 1, 3, 2, 'auto'])
    expect(parsePagesArgs(['--db=etyme_sim_1', '--concurrency', '8', '--rounds=5', '--no-build']).rounds).toBe(5)
    expect(() => parsePagesArgs(['--db', 'etyme_sim_1', '--rounds', '0'])).toThrow(/whole number of 1 or more/)
  })
})

describe('Who the pages are read as', () => {
  it('every party the founder named is read: client, supplier, integrator, MSP, one-person firm and worker', () => {
    expect(new Set(PROBES.map((p) => p.party))).toEqual(new Set(PARTIES))
  })

  it('each role is read at the firm the demo names first, then at the busiest other firm of the same kind', () => {
    const seats = [seat('world-quiet/hiring'), seat('world-busy/hiring'), seat('world-nike/hiring'), seat('world-acme/hiring', { company: { id: 'c-acme', slug: 'world-acme', name: 'Acme', kind: 'VENDOR' } })]
    const busy: Busy = { ...noBusy, firms: new Map([['c-busy', 900], ['c-quiet', 3], ['c-acme', 5000]]) }
    const picked = pickSeats(seats, PROBES.filter((p) => p.role === 'hiring manager'), busy, 2)
    expect(picked.map((p) => [p.seat.key, p.why])).toEqual([['world-nike/hiring', 'named'], ['world-busy/hiring', 'busiest']])
  })

  it('an MSP is read only where it holds a live seat in a client’s program', () => {
    const msp = (slug: string) => seat(`${slug}/owner`, { company: { id: `c-${slug}`, slug, name: slug, kind: 'MSP' } })
    const probes = PROBES.filter((p) => p.party === 'MSP')
    expect(pickSeats([msp('world-aptiva'), msp('world-maren')], probes, noBusy, 2)).toEqual([])
    const seated: Busy = { ...noBusy, seated: new Set(['c-world-maren']) }
    expect(pickSeats([msp('world-aptiva'), msp('world-maren')], probes, seated, 2).map((p) => p.seat.key)).toEqual(['world-maren/owner'])
  })

  it('workers are read as the named people first, then the worker who filed the most weeks', () => {
    const people = [
      seat('worker/a@x.invalid', { company: null, personId: 'pa' }), seat('worker/b@x.invalid', { company: null, personId: 'pb' }),
      seat('person/helena-marsh', { company: null, personId: 'ph' }),
    ]
    const busy: Busy = { ...noBusy, people: new Map([['pa', 2], ['pb', 40]]) }
    expect(pickSeats(people, PROBES.filter((p) => p.party === 'worker'), busy, 2).map((p) => p.seat.key)).toEqual(['person/helena-marsh', 'worker/b@x.invalid'])
  })

  it('one seat is read once, whichever roles it would answer for', () => {
    const seats = [seat('world-nike/ap'), seat('world-nike/compliance')]
    const probes = [PROBES.find((p) => p.role === 'AP clerk')!, { ...PROBES.find((p) => p.role === 'AP clerk')!, role: 'the same seat again' }]
    expect(pickSeats(seats, probes, noBusy, 2).map((p) => p.seat.key)).toEqual(['world-nike/ap'])
  })
})

describe('What each seat opens is its own menu, never a hand list', () => {
  const hrefs = (sections: NavSection[]) => sections.flatMap((s) => s.items.map((i) => i.href))

  it('every page a seat’s menu offers is opened, tabs included, each once', () => {
    const menu = getNavForKind('VENDOR', false, { permissions: ['*'] })
    const pages = pagesOf(menu).map((p) => p.href)
    expect(new Set(pages)).toEqual(new Set(hrefs(menu)))
    expect(pages.length).toBe(new Set(pages).size)
    expect(pagesOf(menu).find((p) => p.href === '/dashboard/bench')?.label).toBe('Network › Bench')
  })

  it('a page the menu does not offer this role is not opened', () => {
    const pages = pagesOf(menuFor({ kind: 'CLIENT', isConsultant: false, worker: false, permissions: ['requirements.read'], seatedAtClient: null, region: null }))
    expect(pages.some((p) => p.href === '/dashboard/settings')).toBe(false)
    expect(pages.some((p) => p.href === '/dashboard/requisitions')).toBe(true)
  })

  it('a firm seated in a client’s program opens the client’s pages, and a region seat opens its region’s alone', () => {
    const seated = pagesOf(menuFor({ kind: 'MSP', isConsultant: false, worker: false, permissions: ['*'], seatedAtClient: 'Cavanaugh Glassworks', region: null }))
    expect(seated.some((p) => p.href === '/dashboard/program')).toBe(true)
    const region = pagesOf(menuFor({ kind: 'CLIENT', isConsultant: false, worker: false, permissions: ['*'], seatedAtClient: null, region: 'Belgium' }))
    expect(region.map((p) => p.href)).toEqual(hrefs(getNavForKind('CLIENT', false, { region: 'Belgium', permissions: ['*'] })))
  })

  it('every page on every party’s menu has a page file, so a page is never timed against nothing', () => {
    const kinds = ['CLIENT', 'VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP'] as const
    const all = new Set([...kinds.flatMap((k) => hrefs(getNavForKind(k, false, {}))), ...hrefs(getNavForKind(null, true, {}))])
    const missing = [...all].filter((h) => !routeOf(h.split('?')[0]).file?.endsWith('page.tsx'))
    expect(missing).toEqual([])
  })

  it('a page is owned by whoever owns its page file', () => {
    const ref = routeOf('/dashboard/requirements')
    expect(ref.file).toBe('src/app/dashboard/requirements/page.tsx')
    expect(ref.owner).not.toBeNull()
  })

  it('a firm’s kind is read the way the session reads it, and a person with no firm reads the worker’s menu', () => {
    expect([kindOf('CLIENT'), kindOf('GSI'), kindOf('SOMETHING_OLD'), kindOf(null)]).toEqual(['CLIENT', 'GSI', 'VENDOR', null])
  })
})

describe('What each page reads on load', () => {
  const ask: NavSection = { label: 'Ask Etyme', tabbed: true, items: [{ label: 'Ask Etyme', href: '/dashboard/conversations/etyme', icon: '', api: ['conversations/twin'] }] }
  const tabs: NavSection = {
    label: 'Contractors', tabbed: true, items: [
      { label: 'Contracts', href: '/dashboard/contracts?side=sell', icon: '' },
      { label: 'Paperwork', href: '/dashboard/my-work', icon: '', api: ['me', 'documents/*/sign'] },
      { label: 'Nothing behind it', href: '/dashboard/x', icon: '', api: ['no-such-route'] },
    ],
  }
  const answers = new Set(['contracts', 'contracts/**', 'me', 'conversations/twin'])
  const hasGet = (r: string) => answers.has(r)

  it('every page reads who you are and the number on the mark; the greeting’s reads come only with Ask Etyme', () => {
    expect(readsOf([tabs], hasGet).slice(0, SHELL_READS.length)).toEqual([...SHELL_READS])
    expect(readsOf([tabs], hasGet).some((r) => GREETING_READS.includes(r))).toBe(false)
    for (const g of GREETING_READS) expect(readsOf([ask, tabs], hasGet)).toContain(g)
  })

  it('a page’s own route is read only where a GET answers there, never one with an id in it, and with the page’s own query', () => {
    const reads = readsOf([tabs], hasGet)
    expect(reads).toContain('/api/contracts?side=sell')
    expect(reads).toContain('/api/me')
    expect(reads.some((r) => r.includes('*') || r.includes('no-such-route'))).toBe(false)
    expect(reads.length).toBe(new Set(reads).size)
  })
})

describe('The calls at once are many people on many pages', () => {
  const seats = [
    { party: 'supplier' as const, seat: 'owner', pages: Array.from({ length: 40 }, (_, i) => ({ label: `P${i}`, href: `/p/${i}` })), reads: Array.from({ length: 40 }, (_, i) => `/api/r${i}`) },
    { party: 'worker' as const, seat: 'helena', pages: [{ label: 'Q1', href: '/q' }], reads: ['/api/me'] },
  ]

  it('a round keeps every page and read of every seat, once each', () => {
    const round = roundOf(seats)
    expect(round).toHaveLength(82)
    expect(new Set(round.map((v) => `${v.seat}${v.path}`)).size).toBe(82)
    expect(round.find((v) => v.path === '/api/me')?.kind).toBe('read')
  })

  it('a page\u2019s place on the menu does not decide how busy the server is when it is opened', () => {
    const round = roundOf(seats)
    const lastSection = round.map((v, i) => ({ v, i })).filter(({ v }) => v.kind === 'page' && Number(v.path.split('/').pop()) >= 30)
    const mean = lastSection.reduce((n, x) => n + x.i, 0) / lastSection.length
    expect(mean / round.length).toBeGreaterThan(0.25)
    expect(mean / round.length).toBeLessThan(0.75)
  })

  it('every round is mixed the same way on every run, and two rounds differently', () => {
    expect(roundOf(seats, 2)).toEqual(roundOf(seats, 2))
    expect(roundOf(seats, 1).map((v) => v.path)).not.toEqual(roundOf(seats, 2).map((v) => v.path))
  })
})

describe('The figures are computed from the calls, on the simulation’s own line', () => {
  it('half and 95% of a page’s calls are its p50 and p95, and two tabs on one route stay two rows', () => {
    const hits = Array.from({ length: 20 }, (_, i) => hit({ ms: (i + 1) * 10 }))
    hits.push(hit({ path: '/dashboard/contracts?side=sell', label: 'Sell' }), hit({ path: '/dashboard/contracts?side=buy', label: 'Buy' }))
    const stats = pageStats(hits)
    const jobs = stats.find((s) => s.path === '/dashboard/requisitions')!
    expect([jobs.calls, jobs.p50, jobs.p95, jobs.max]).toEqual([20, 100, 190, 200])
    expect(stats.filter((s) => s.path.startsWith('/dashboard/contracts')).length).toBe(2)
  })

  it('a page whose p95 passes two seconds is a fault, and one at exactly two seconds is not', () => {
    const at = (ms: number) => [hit({ ms })]
    expect(pageFaults(pageStats(at(2000)), at(2000))).toEqual([])
    expect(pageFaults(pageStats(at(2001)), at(2001))[0].why).toMatch(/over the 2s line/)
  })

  it('a page that answered a server error is a fault named for its owner, with the sentence it said, and a refusal is not', () => {
    const hits = [hit({ status: 500, sentence: 'The server did not answer: boom', owner: 'MONEY', path: '/dashboard/invoices' }), hit({ status: 403, path: '/api/x', kind: 'read' })]
    const faults = pageFaults(pageStats(hits), hits)
    expect(faults.map((f) => [f.path, f.owner])).toEqual([['/dashboard/invoices', 'MONEY']])
    expect(faults[0].sample).toBe('The server did not answer: boom')
    expect(pageStats(hits).find((s) => s.path === '/api/x')?.not200).toBe(1)
  })
})

describe('The report is read by the founder', () => {
  it('says how many transactions were behind the pages, and whether that reached the hundred thousand asked for', () => {
    expect(behindThePages({ Timesheet: 60_000, AccessLog: 40_000 }).says).toMatch(/100,000 transactions, past the 100,000 asked for/)
    const short = behindThePages({ Timesheet: 1_200 })
    expect(short.total).toBe(1_200)
    expect(short.says).toMatch(/short of the 100,000 asked for/)
  })

  it('names every seat, every page with its owner, the refused reads in their own words, and the counts before and after', () => {
    const md = pagesReportMarkdown(record())
    expect(md).toContain('Dana Whitfield')
    expect(md).toContain('| Jobs `/dashboard/requisitions` | demand |')
    expect(md).toContain('“Only HR reads this.”')
    expect(md).toMatch(/\| Timesheet \| weeks filed \| 50 \| 50 \|/)
  })

  it('never says desk or program office', () => {
    const md = pagesReportMarkdown(record({ warmupErrors: [hit({ status: 502 })], hits: [hit({ status: 500, sentence: 'x' })] }))
    expect(md).not.toMatch(/\bdesks?\b/i)
    expect(md).not.toMatch(/program office/i)
    for (const p of PROBES) expect(`${p.role} ${p.party}`).not.toMatch(/\bdesks?\b|program office/i)
  })
})

describe('A page is opened the way a browser opens it', () => {
  it('asks for HTML with the seat’s session, follows the app’s redirect with the same session, reads the whole answer, and leaves one row on the ledger', async () => {
    const seen: { url?: string; accept?: string; cookie?: string }[] = []
    const server = createServer((req, res) => {
      seen.push({ url: req.url, accept: req.headers.accept, cookie: req.headers.cookie })
      if (req.method === 'POST' && req.url === '/api/demo') {
        res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': `${DEMO_COOKIE}=signed-seat; Path=/; HttpOnly` })
        return res.end(JSON.stringify({ data: { companyName: 'Aptiva Workforce', seatedAt: 'Cavanaugh Glassworks' } }))
      }
      if (req.url === '/dashboard') {
        res.writeHead(307, { location: '/dashboard/program?view=regions' })
        return res.end()
      }
      if (req.url === '/dashboard/away') {
        res.writeHead(307, { location: 'https://elsewhere.invalid/' })
        return res.end()
      }
      res.writeHead(200, { 'content-type': 'text/html' })
      res.write('<html><body>')
      setTimeout(() => res.end('the rest of the page</body></html>'), 30)
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    try {
      const ledger = new Ledger()
      const spec: SeatSpec = seat('world-aptiva/owner', { company: { id: 'c1', slug: 'world-aptiva', name: 'Aptiva Workforce', kind: 'MSP' } })
      const actor = new Actor(spec, { base: `http://127.0.0.1:${port}`, ledger, secret: 'x', cronSecret: 'y', timeoutMs: 5_000 })
      expect(actor.door).toBeNull()
      const page = await actor.page('/dashboard')

      expect(page.status).toBe(200)
      expect(page.landed).toBe('/dashboard/program?view=regions')
      expect(page.size).toBeGreaterThan('<html><body>'.length)
      expect(page.ms).toBeGreaterThanOrEqual(25)
      expect(seen.slice(1).map((s) => [s.url, s.cookie])).toEqual([
        ['/dashboard', `${DEMO_COOKIE}=signed-seat`],
        ['/dashboard/program?view=regions', `${DEMO_COOKIE}=signed-seat`],
      ])
      expect(seen[1].accept).toMatch(/^text\/html/)
      expect(ledger.calls.map((c) => [c.method, c.path, c.status])).toEqual([['POST', '/api/demo', 200], ['GET', '/dashboard', 200]])

      const away = await actor.page('/dashboard/away')
      expect([away.status, away.landed]).toEqual([307, null])
      expect(seen.some((s) => s.url?.includes('elsewhere'))).toBe(false)
    } finally {
      server.close()
    }
  })

  it('a seat taken through the demo door keeps what the door answered, such as the client whose program it holds a seat in', async () => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': `${DEMO_COOKIE}=s; Path=/` })
      res.end(JSON.stringify({ data: { seatedAt: 'Talvern Medical' } }))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    try {
      const actor = new Actor(seat('world-kestrel/owner'), { base: `http://127.0.0.1:${port}`, ledger: new Ledger(), secret: 'x', cronSecret: 'y', timeoutMs: 5_000 })
      await actor.open()
      expect(actor.door?.seatedAt).toBe('Talvern Medical')
    } finally {
      server.close()
    }
  })
})
