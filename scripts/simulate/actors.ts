/**
 * The people the simulation acts as.
 *
 * Every actor is a seeded seat opened through the demo door, exactly as
 * the demo page opens one: `POST /api/demo` with `{as, desk}` (and
 * `who` where two people hold one role) for somebody at a firm, or
 * `{person}` for one of the six people the page seats by name. The door
 * sets the session cookie; the actor keeps it and sends it on every
 * call, so the same rules, refusals and access logs apply as to a
 * person clicking.
 *
 * One exception, said plainly: the demo page has a door for six workers
 * and the seeded world holds more. A worker with no door is opened with
 * the same signed cookie the door would have set for them
 * (`sign` in lib/demo-session), which the server accepts only for a
 * seeded address it cannot buy (`.invalid`, `.example`, `.local`). The
 * session is identical; only the knock is skipped. Their key starts with
 * `worker/` so a report can tell the two apart.
 *
 * The catalog of seats is read from the copied world, read-only: which
 * firms exist, which roles are held there and by whom. Nothing about a
 * seat is a hand list, so a role seeded tomorrow is a seat tomorrow.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'
import type { PrismaClient } from '@prisma/client'
import { DESKS, DESK_ROLES, type Desk } from '@/lib/demo-desks'
import { SAMPLE_PERSON_EMAIL } from '@/lib/sample-seat'
import { DEMO_COOKIE, reservedAddress, sign } from '@/lib/demo-session'
import { CANDIDATE_SEATS } from '@/app/demo/seats'
import type { Ledger, Method } from './ledger'

// ── The catalog ────────────────────────────────────────────────────────

export type Door =
  | { as: string; desk?: Desk; who?: string }
  | { person: string }
  /** No door on the demo page: the signed cookie the door would set. */
  | { email: string }

export interface SeatSpec {
  /** `world-nike/hiring`, `world-teleworld/delivery/Rahul Deshpande`, `world-brightmoor/owner`, `person/helena-marsh`, `worker/<email>`. */
  key: string
  door: Door
  /** Who sits there, as the world holds them. */
  personName: string
  email: string
  personId: string
  /** The role's own name, e.g. "Hiring Manager"; "Worker" for a person seat with no role. */
  role: string
  company: { id: string; slug: string; name: string; kind: string } | null
}

export interface Catalog {
  seats: SeatSpec[]
  /** Roles held at a seeded firm that nobody can sit as: no door names them and the address is not a seeded one. */
  unreachable: { company: string; role: string; personName: string }[]
}

interface ContextRow {
  slug: string
  companyId: string
  company: string
  kind: string
  personId: string
  person: string
  email: string
  type: string
  role: string | null
  grantedAt: Date
}

/** Every seat the world holds, read from the copied database. */
export async function readCatalog(db: PrismaClient): Promise<Catalog> {
  const rows = await db.$queryRawUnsafe<ContextRow[]>(`
    select co.slug, co.id as "companyId", co.name as company, co.kind::text as kind,
           p.id as "personId", p.name as person, p."primaryEmail" as email,
           x.type::text as type, r.name as role, x."grantedAt"
    from "Context" x
    join "Person" p on p.id = x."personId"
    join "Company" co on co.id = x."companyId"
    left join "Role" r on r.id = x."roleId"
    where co.slug like 'world-%' and x."revokedAt" is null
    order by co.slug, x."grantedAt" asc, p."primaryEmail"`)

  const seats: SeatSpec[] = []
  const unreachable: Catalog['unreachable'] = []
  const unreached: ContextRow[] = []
  const companyOf = (r: ContextRow) => ({ id: r.companyId, slug: r.slug, name: r.company, kind: r.kind })
  const bySlug = new Map<string, ContextRow[]>()
  for (const r of rows) {
    if (r.email === SAMPLE_PERSON_EMAIL) continue
    const list = bySlug.get(r.slug)
    if (list) list.push(r)
    else bySlug.set(r.slug, [r])
  }

  for (const [slug, list] of bySlug) {
    // The door seats only contexts with a role, oldest grant first.
    const seated = list.filter((r) => r.role)
    if (seated.length === 0) continue
    const first = seated[0]
    seats.push({
      key: `${slug}/owner`, door: { as: slug },
      personName: first.person, email: first.email, personId: first.personId,
      role: first.role!, company: companyOf(first),
    })
    const opened = new Set<string>([first.role!])
    for (const desk of DESKS) {
      const holders = seated.filter((r) => DESK_ROLES[desk].includes(r.role!))
      if (holders.length === 0) continue
      const h = holders[0]
      seats.push({
        key: `${slug}/${desk}`, door: { as: slug, desk },
        personName: h.person, email: h.email, personId: h.personId, role: h.role!, company: companyOf(h),
      })
      for (const role of DESK_ROLES[desk]) opened.add(role)
      // Two people at one role: each by name (Teleworld's two delivery managers).
      const names = [...new Set(holders.map((x) => x.person))]
      if (names.length > 1) {
        for (const x of holders) {
          const key = `${slug}/${desk}/${x.person}`
          if (seats.some((s) => s.key === key)) continue
          seats.push({
            key, door: { as: slug, desk, who: x.person },
            personName: x.person, email: x.email, personId: x.personId, role: x.role!, company: companyOf(x),
          })
        }
      }
    }
    for (const r of seated) {
      if (!opened.has(r.role!)) unreached.push(r)
    }
  }

  // The six people the demo page seats by name. Read by address, not
  // through a firm: one of them (Marisol Quintero) belongs to no firm yet.
  const named = await db.$queryRawUnsafe<{ personId: string; person: string; email: string; role: string | null; slug: string | null; companyId: string | null; company: string | null; kind: string | null }[]>(`
    select distinct on (p.id) p.id as "personId", p.name as person, p."primaryEmail" as email, r.name as role,
           co.slug, co.id as "companyId", co.name as company, co.kind::text as kind
    from "Person" p
    left join "Context" x on x."personId" = p.id and x."revokedAt" is null and x."suspendedAt" is null
    left join "Company" co on co.id = x."companyId"
    left join "Role" r on r.id = x."roleId"
    where p."primaryEmail" in (${CANDIDATE_SEATS.map((c) => `'${c.email.replace(/'/g, "''")}'`).join(', ')})
    order by p.id, x."grantedAt" desc nulls last`)
  for (const c of CANDIDATE_SEATS) {
    const r = named.find((x) => x.email === c.email)
    if (!r) continue
    seats.push({
      key: `person/${c.slug}`, door: { person: c.slug },
      personName: r.person, email: r.email, personId: r.personId, role: 'Worker',
      company: r.slug && r.companyId ? { id: r.companyId, slug: r.slug, name: r.company ?? '', kind: r.kind ?? '' } : null,
    })
  }
  const seatedEmails = () => new Set(seats.filter((s) => !('as' in s.door)).map((s) => s.email))

  // Every other worker: a consultant context at a seeded firm, or the
  // person on a seeded contract.
  const byEmail = new Map(rows.map((r) => [r.email, r]))
  const workers = await db.$queryRawUnsafe<{ personId: string; person: string; email: string }[]>(`
    select distinct p.id as "personId", p.name as person, p."primaryEmail" as email
    from "Person" p
    where exists (
      select 1 from "Context" x join "Company" co on co.id = x."companyId"
      where x."personId" = p.id and x.type = 'CONSULTANT' and x."revokedAt" is null and co.slug like 'world-%'
    ) or exists (
      select 1 from "SellContract" s join "Company" co on co.id = s."companyId"
      where s."personId" = p.id and co.slug like 'world-%'
    )
    order by p.name`)
  for (const w of workers) {
    if (seatedEmails().has(w.email) || !reservedAddress(w.email)) continue
    const r = byEmail.get(w.email)
    seats.push({
      key: `worker/${w.email}`, door: { email: w.email },
      personName: w.person, email: w.email, personId: w.personId,
      role: 'Worker', company: r ? companyOf(r) : null,
    })
  }

  // A role held at a seeded firm that no door names (an integrator's own
  // engineers, a supplier's Admin): the same signed session, keyed staff/.
  for (const r of unreached) {
    if (seatedEmails().has(r.email)) continue
    if (!reservedAddress(r.email)) {
      unreachable.push({ company: r.company, role: r.role ?? r.type, personName: r.person })
      continue
    }
    seats.push({
      key: `staff/${r.email}`, door: { email: r.email },
      personName: r.person, email: r.email, personId: r.personId, role: r.role ?? r.type, company: companyOf(r),
    })
  }

  return { seats, unreachable }
}

// ── Acting ─────────────────────────────────────────────────────────────

export interface Res<T = any> {
  status: number
  /** The parsed body; `{ raw }` where it was not JSON; null where empty. */
  json: T
  ms: number
  ok: boolean
  /** `error.message` where the call did not succeed. */
  sentence: string | null
}

/** Calls made inside `expectRefusal` are marked expected, so they are not counted as lessons. */
export const expecting = new AsyncLocalStorage<{ expected: true }>()

export interface Wire {
  base: string
  ledger: Ledger
  /** The secret the server signs sessions with; needed only for workers with no door. */
  secret: string
  cronSecret: string
  /** Per call. */
  timeoutMs: number
}

async function call(wire: Wire, seat: string, method: Method, path: string, body: unknown, cookie: string | null): Promise<Res> {
  const started = new Date()
  const t0 = performance.now()
  let status = 0
  let json: any = null
  let sentence: string | null = null
  let code: string | undefined
  try {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (cookie) headers.cookie = cookie
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (seat === 'cron') headers.authorization = `Bearer ${wire.cronSecret}`
    const res = await fetch(wire.base + path, {
      method, headers, redirect: 'manual',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(wire.timeoutMs),
    })
    status = res.status
    const text = await res.text()
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { raw: text.slice(0, 500) }
    }
    if (method === 'POST' && path === '/api/demo' && res.ok) {
      const set = res.headers.getSetCookie().find((c) => c.startsWith(`${DEMO_COOKIE}=`))
      if (set) json = { ...json, __cookie: set.split(';')[0] }
    }
  } catch (e: any) {
    sentence = `The server did not answer: ${String(e?.message ?? e)}`
  }
  const ms = Math.round(performance.now() - t0)
  const ok = status >= 200 && status < 300
  if (!ok && !sentence) {
    const err = json?.error
    sentence = typeof err === 'string' ? err : typeof err?.message === 'string' ? err.message : null
    code = typeof err?.code === 'string' ? err.code : undefined
  }
  wire.ledger.record({
    at: started.toISOString(), seat, method, path: path.split('?')[0], status, ms,
    ...(sentence ? { sentence } : {}), ...(code ? { code } : {}),
    ...(expecting.getStore() ? { expected: true } : {}),
  })
  return { status, json, ms, ok, sentence }
}

export class Actor {
  private cookie: string | null = null
  private opening: Promise<void> | null = null

  constructor(readonly spec: SeatSpec, private readonly wire: Wire) {}

  get key(): string { return this.spec.key }
  get name(): string { return this.spec.personName }
  get company() { return this.spec.company }

  /** Take the seat. Called on the first request; safe to call twice at once. */
  open(): Promise<void> {
    if (this.cookie) return Promise.resolve()
    if (!this.opening) {
      this.opening = (async () => {
        const door = this.spec.door
        if ('email' in door) {
          this.cookie = `${DEMO_COOKIE}=${sign(door.email)}`
          return
        }
        const res = await call(this.wire, this.key, 'POST', '/api/demo', door, null)
        const cookie = res.json?.__cookie
        if (!res.ok || typeof cookie !== 'string') {
          this.opening = null
          throw new Error(`Could not take the seat ${this.key}: ${res.sentence ?? `status ${res.status}`}`)
        }
        this.cookie = cookie
      })()
    }
    return this.opening
  }

  async request<T = any>(method: Method, path: string, body?: unknown): Promise<Res<T>> {
    await this.open()
    return call(this.wire, this.key, method, path, body, this.cookie)
  }

  get<T = any>(path: string) { return this.request<T>('GET', path) }
  post<T = any>(path: string, body?: unknown) { return this.request<T>('POST', path, body ?? {}) }
  patch<T = any>(path: string, body?: unknown) { return this.request<T>('PATCH', path, body ?? {}) }
  put<T = any>(path: string, body?: unknown) { return this.request<T>('PUT', path, body ?? {}) }
  delete<T = any>(path: string, body?: unknown) { return this.request<T>('DELETE', path, body) }
}

/** Every seat, opened on first use and kept for the run. */
export class Cast {
  private readonly actors = new Map<string, Actor>()

  constructor(readonly catalog: Catalog, private readonly wire: Wire) {}

  get seats(): SeatSpec[] { return this.catalog.seats }

  /** The actor at a seat key. Throws, naming the near misses, where there is no such seat. */
  seat(key: string): Actor {
    const have = this.actors.get(key)
    if (have) return have
    const spec = this.catalog.seats.find((s) => s.key === key)
    if (!spec) {
      const prefix = key.split('/')[0]
      const near = this.catalog.seats.filter((s) => s.key.startsWith(prefix)).map((s) => s.key)
      throw new Error(`No seat ${key} in this world.${near.length ? ` At ${prefix}: ${near.join(', ')}.` : ''}`)
    }
    const actor = new Actor(spec, this.wire)
    this.actors.set(key, actor)
    return actor
  }

  /** The seat at a firm by role key (`hiring`, `ap`, `owner`…), or null where nobody holds it. */
  at(slug: string, desk: Desk | 'owner'): Actor | null {
    const key = `${slug}/${desk}`
    return this.catalog.seats.some((s) => s.key === key) ? this.seat(key) : null
  }

  /** A worker by email or by name: their named door where the demo page has one, else the signed cookie. */
  worker(emailOrName: string): Actor {
    const spec = this.catalog.seats.find(
      (s) => (s.key.startsWith('person/') || s.key.startsWith('worker/')) && (s.email === emailOrName || s.personName === emailOrName)
    )
    if (spec) return this.seat(spec.key)
    if (!reservedAddress(emailOrName)) throw new Error(`${emailOrName} is not a seeded worker this run can sit as.`)
    // A worker the run itself brought into the world (a new consultant).
    const key = `worker/${emailOrName}`
    const actor = new Actor(
      { key, door: { email: emailOrName }, personName: emailOrName, email: emailOrName, personId: '', role: 'Worker', company: null },
      this.wire
    )
    this.actors.set(key, actor)
    return actor
  }

  /** Every seat whose spec passes the test. */
  where(test: (s: SeatSpec) => boolean): Actor[] {
    return this.catalog.seats.filter(test).map((s) => this.seat(s.key))
  }

  /** How many seats were actually taken this run. */
  get opened(): number { return this.actors.size }

  /**
   * A nightly job, run now: `GET /api/cron/<name>` with the run's cron
   * secret. end-contracts, auto-approve, twin, watch, due-cycles… Logged
   * on the ledger under the seat `cron`.
   */
  cron(name: string): Promise<Res> {
    return call(this.wire, 'cron', 'GET', `/api/cron/${name}`, undefined, null)
  }
}
