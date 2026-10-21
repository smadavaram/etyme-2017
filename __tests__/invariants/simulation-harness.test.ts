/**
 * The simulation's own arithmetic (scripts/simulate, CLAUDE.md 2026-10-20).
 *
 * The run itself needs a server and a world; these are the parts that do
 * not, held so a report can be trusted: which route a call reached, how
 * a percentile is taken, what counts as a fault, how refusals become
 * lessons, and that every station has exactly one owner.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { domainOf } from '@/lib/domains'
import { Ledger, faultsOf, percentile, routeStats, type Call } from '../../scripts/simulate/ledger'
import { lessonsOf } from '../../scripts/simulate/lessons'
import { routeOf } from '../../scripts/simulate/routes'
import { parseArgs } from '../../scripts/simulate/args'
import { STAGE_ORDER, emptyWorld, parallel, batchRefusal } from '../../scripts/simulate/stage'
import { STAGES } from '../../scripts/simulate/stages'
import { reportMarkdown, benchLine } from '../../scripts/simulate/report'
import { Actor, newSeats, type SeatSpec } from '../../scripts/simulate/actors'
import { createServer } from 'node:http'
import { pruneable, withoutAddedInclude } from '../../scripts/simulate/server'

let n = 0
function call(over: Partial<Call>): Call {
  n++
  const path = over.path ?? '/api/requisitions'
  const ref = routeOf(path)
  return {
    n, at: new Date(0).toISOString(), stage: 'post-jobs', seat: 'world-nike/hiring', method: 'POST',
    path, route: ref.route, owner: ref.owner, status: 201, ms: 100, ...over,
  }
}

describe('Which route a call reached, and whose it is', () => {
  it('two calls to the same route with different ids are timed as one route', () => {
    expect(routeOf('/api/requisitions/abc123/approve').route).toBe('/api/requisitions/[id]/approve')
    expect(routeOf('/api/requisitions/zzz999/approve').route).toBe('/api/requisitions/[id]/approve')
  })

  it('a route is owned by whoever owns its file in the ownership map', () => {
    const ref = routeOf('/api/requisitions/abc123/approve')
    expect(ref.file).toBe('src/app/api/requisitions/[id]/approve/route.ts')
    expect(ref.owner).toBe('DEMAND')
  })

  it('a path no route file answers is named as owned by nobody', () => {
    expect(routeOf('/api/no-such-thing-here').owner).toBeNull()
  })
})

describe('Timings and faults are computed from the calls, never typed', () => {
  it('a percentile is the nearest-rank value of the sorted timings', () => {
    const ms = Array.from({ length: 20 }, (_, i) => (i + 1) * 10)
    expect(percentile(ms, 50)).toBe(100)
    expect(percentile(ms, 95)).toBe(190)
    expect(percentile([], 95)).toBeNull()
  })

  it('a route that answered any call with a server error is a fault, with the sentence it said', () => {
    const calls = [call({}), call({ status: 500, sentence: 'Something broke.' })]
    const [f] = faultsOf(calls)
    expect(f.route).toBe('/api/requisitions')
    expect(f.owner).toBe('DEMAND')
    expect(f.sample).toBe('Something broke.')
  })

  it('a call nobody answered counts as a server error', () => {
    expect(faultsOf([call({ status: 0, sentence: 'The server did not answer: timeout' })])).toHaveLength(1)
  })

  it('a route whose p95 passes two seconds is a fault, and one at exactly two seconds is not', () => {
    expect(faultsOf(Array.from({ length: 20 }, () => call({ ms: 2000 })))).toHaveLength(0)
    expect(faultsOf(Array.from({ length: 20 }, () => call({ ms: 2001 })))).toHaveLength(1)
  })

  it('a refusal is not a server error and does not make a route a fault', () => {
    const calls = [call({ status: 403, sentence: 'No.' })]
    expect(faultsOf(calls)).toHaveLength(0)
    expect(routeStats(calls)[0].refusals).toBe(1)
  })
})

describe('A refusal is a lesson, not a stop', () => {
  it('refusals with the same sentence are one lesson, counted', () => {
    const s = 'Raising a job request is for whoever is hiring at Northbend Athletic.'
    const lessons = lessonsOf([call({ status: 403, sentence: s }), call({ status: 403, sentence: s }), call({})])
    expect(lessons).toHaveLength(1)
    expect(lessons[0].count).toBe(2)
    expect(lessons[0].routeOwners).toEqual(['DEMAND'])
  })

  it('a refusal the stage expected is not a lesson', () => {
    expect(lessonsOf([call({ status: 403, sentence: 'No.', expected: true })])).toHaveLength(0)
  })

  it('a refusal with no sentence is a lesson that says the route gave none', () => {
    const [l] = lessonsOf([call({ status: 409, code: 'CONFLICT' })])
    expect(l.said).toBe(false)
    expect(l.sentence).toContain('No sentence was given')
  })

  it('a 403, 409 or 422 is a rule saying no, and a 404 is the request itself being wrong', () => {
    const [a] = lessonsOf([call({ status: 422, sentence: 'Title is required' })])
    const [b] = lessonsOf([call({ status: 404, sentence: 'Not found' })])
    expect(a.kind).toBe('RULE')
    expect(b.kind).toBe('REQUEST')
  })
})

describe('The run is told what to do in flags', () => {
  it('the flags default to fifty placements, twelve weeks and twenty calls at once', () => {
    const a = parseArgs([])
    expect([a.placements, a.weeks, a.concurrency, a.drop]).toEqual([50, 12, 20, false])
  })

  it('a station name the run does not know is refused in a sentence that lists the stations', () => {
    expect(() => parseArgs(['--only', 'post-jobz'])).toThrow(/The stations are: post-jobs/)
  })

  it('a count that is not a whole number above nought is refused', () => {
    expect(() => parseArgs(['--placements', '0'])).toThrow(/whole number/)
  })
})

describe('Every station has exactly one owner', () => {
  it('the stations run in the order of the trade, one file each', () => {
    expect(STAGES.map((s) => s.name)).toEqual([...STAGE_ORDER])
  })

  it('each station lives in the folder of the domain named on it, and that domain owns the folder', () => {
    for (const s of STAGES) {
      const file = `scripts/simulate/stages/${s.domain.toLowerCase()}/${s.name}.ts`
      expect(statSync(join(process.cwd(), file)).isFile(), file).toBe(true)
      expect(domainOf(file)?.key, file).toBe(s.domain)
    }
  })

  it('every file under scripts/simulate has an owner', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else files.push(relative(process.cwd(), p))
      }
    }
    walk(join(process.cwd(), 'scripts', 'simulate'))
    expect(files.filter((f) => !domainOf(f))).toEqual([])
  })
})

describe('Load is bounded', () => {
  it('parallel never runs more than n at once and keeps each result in its place', async () => {
    let running = 0
    let most = 0
    const out = await parallel(Array.from({ length: 30 }, (_, i) => i), async (i) => {
      running++
      most = Math.max(most, running)
      await new Promise((r) => setTimeout(r, 2))
      running--
      if (i === 7) throw new Error('seven')
      return i * 2
    }, 5)
    expect(most).toBeLessThanOrEqual(5)
    expect(out[3]).toEqual({ ok: true, value: 6 })
    expect(out[7]).toEqual({ ok: false, error: 'seven' })
  })
})

describe('The report is read by the founder', () => {
  it('never says desk or program office, and shows a sentence beside every refusal', () => {
    const ledger = new Ledger()
    ledger.calls.push(call({ status: 403, sentence: 'Raising a job request is for whoever is hiring.', code: 'NOT_HIRING' }))
    const md = reportMarkdown({
      stamp: 'x', startedAt: new Date(0), finishedAt: new Date(1000),
      options: { placements: 1, weeks: 1, concurrency: 1, only: [] },
      database: { name: 'etyme_sim_x', template: 't', kept: true }, base: 'http://localhost:1', build: 'reused',
      stages: STAGES.map((s) => ({ name: s.name, domain: s.domain, built: s.built, ms: 0 })),
      world: emptyWorld(), ledger,
      catalog: { seats: [], unreachable: [] }, opened: 0,
    })
    expect(md).not.toMatch(/\bdesks?\b/i)
    expect(md).not.toMatch(/program office/i)
    expect(md).toContain('"Raising a job request is for whoever is hiring."')
  })
})

// ── What two runs at once and the first stations found (2026-10-20) ────

describe('A refusal said person by person is still a refusal', () => {
  it('a batch that answers 200 and refuses every person in it, in words, is a rule that held', () => {
    const json = { data: { results: [{ personId: 'p1', status: 'error', error: 'Ifeoma Balogun has not agreed to be marketed by you.' }] } }
    expect(batchRefusal(json)).toEqual({ allRefused: true, sentences: ['Ifeoma Balogun has not agreed to be marketed by you.'] })
  })

  it('a batch where one person went through is not a refusal of the call', () => {
    const json = { data: { results: [{ status: 'created' }, { status: 'duplicate', error: 'First submission wins.' }] } }
    expect(batchRefusal(json)?.allRefused).toBe(false)
  })

  it('an answer that is not a batch is read the ordinary way', () => {
    expect(batchRefusal({ data: { id: 'x' } })).toBeNull()
    expect(batchRefusal(null)).toBeNull()
  })
})

describe('A person seated during the run can be sat as by the next station', () => {
  const seat = (key: string): SeatSpec => ({ key, door: { email: `${key}@x.invalid` }, personName: key, email: `${key}@x.invalid`, personId: key, role: 'Worker', company: null })

  it('only seats the catalog does not hold yet are added, and none twice', () => {
    expect(newSeats([seat('a'), seat('b')], [seat('b'), seat('c'), seat('c')]).map((s) => s.key)).toEqual(['c'])
  })
})

describe('The world carries the bench, and the report says it in a line', () => {
  it('an empty world starts with an empty bench', () => {
    expect(emptyWorld().bench).toEqual([])
  })

  it('the line counts who may be put forward today and who said no', () => {
    expect(benchLine([])).toBe('People on a bench: none recorded this run')
    expect(benchLine([
      { kind: 'LISTING', state: 'GRANTED' }, { kind: 'LISTING', state: 'DECLINED' }, { kind: 'EMPLOYEE', state: 'EMPLOYEE' },
    ])).toBe("People on a bench: 3, 2 of them may be put forward today (1 the firm's own between projects); 1 said no")
  })
})

describe('A build never takes away the build another run is serving from', () => {
  const now = 100 * 3_600_000
  const old = now - 7 * 3_600_000
  const fresh = now - 3_600_000

  it('the build pointed at is never deleted, however old', () => {
    const gone = pruneable([{ name: 'b1', under: 'builds', mtimeMs: old }], 'b1', now)
    expect(gone).toEqual([])
  })

  it('a build nobody points at is kept six hours for a server still using it, and deleted after', () => {
    const gone = pruneable([
      { name: 'b-old', under: 'builds', mtimeMs: old },
      { name: 'b-fresh', under: 'builds', mtimeMs: fresh },
    ], 'b-now', now)
    expect(gone).toEqual([{ name: 'b-old', under: 'builds' }])
  })

  it('the lock, the pointer and the builds folder are never pruned; an old build left at the top is', () => {
    const gone = pruneable([
      { name: 'build.lock', under: 'top', mtimeMs: old }, { name: 'current', under: 'top', mtimeMs: old },
      { name: 'builds', under: 'top', mtimeMs: old }, { name: 'server', under: 'top', mtimeMs: old },
    ], null, now)
    expect(gone).toEqual([{ name: 'server', under: 'top' }])
  })

  it('the include line next build adds for its own folder is taken out again, and nothing else is touched', () => {
    const before = JSON.stringify({ compilerOptions: { strict: true }, include: ['**/*.ts'] }, null, 2) + '\n'
    const after = JSON.stringify({ compilerOptions: { strict: true }, include: ['**/*.ts', '.next-sim/builds/x/types/**/*.ts'] }, null, 2)
    expect(withoutAddedInclude(before, after, '.next-sim/builds/x')).toBe(before)
    const other = JSON.stringify({ compilerOptions: { strict: false }, include: ['**/*.ts', '.next-sim/builds/x/types/**/*.ts'] })
    expect(withoutAddedInclude(before, other, '.next-sim/builds/x')).toBeNull()
    expect(withoutAddedInclude(before, before, '.next-sim/builds/x')).toBeNull()
  })
})

describe('a seat sends a file the way a person does', () => {
  it('an upload goes as the same seat in the same session, as a multipart form, and lands on the run\u2019s ledger', async () => {
    process.env.DEMO_SECRET ??= 'simulation-harness-test'
    const seen: { cookie?: string; type?: string; body: string }[] = []
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        seen.push({ cookie: req.headers.cookie, type: req.headers['content-type'], body })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ data: { ok: true } }))
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    try {
      const ledger = new Ledger()
      const spec: SeatSpec = {
        key: 'worker/ana@scale.invalid', door: { email: 'ana@scale.invalid' }, personName: 'Ana', email: 'ana@scale.invalid',
        personId: 'p1', role: 'Worker', company: null,
      }
      const actor = new Actor(spec, { base: `http://127.0.0.1:${port}`, ledger, secret: 'x', cronSecret: 'y', timeoutMs: 5_000 })
      await actor.get('/api/me')
      const form = new FormData()
      form.set('note', 'front page')
      form.set('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'i9.png')
      const res = await actor.upload('/api/documents/d1/upload', form)

      expect(res.ok).toBe(true)
      expect(seen[1].cookie).toBe(seen[0].cookie)
      expect(seen[1].cookie).toBeTruthy()
      expect(seen[1].type).toMatch(/^multipart\/form-data; boundary=/)
      expect(seen[1].body).toContain('filename="i9.png"')
      expect(ledger.calls.map((c) => [c.seat, c.method, c.path])).toEqual([
        ['worker/ana@scale.invalid', 'GET', '/api/me'],
        ['worker/ana@scale.invalid', 'POST', '/api/documents/d1/upload'],
      ])
    } finally {
      server.close()
    }
  })
})
