import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, dirname, resolve, sep } from 'node:path'

/**
 * Sign-up walk, round five, problems 1 and 2 (2026-10-08).
 *
 * The one door for a seat lives in `getCallerContext`: it resolves the
 * seat, its company and its permissions, and refuses a seat with no desk
 * before the route reads anything. Routes that authenticated with
 * `getSessionEmail` alone never met it. The import routes took a
 * `companyId` from the body, and a Member at Northbend Athletic imported
 * a person and a live $150/hr contract into Teleworld Solutions; a
 * candidate with no company read another import's rows with rates. A
 * company's locations answered any company's sites to anybody signed in.
 *
 * So this is an invariant, not a sweep. Every handler in every
 * `route.ts` under src/app/api reaches one of the doors — the caller
 * check, the nightly jobs' secret, or the staff check — directly or
 * through a helper that does, or its route is named below with the
 * reason it needs none. A route added tomorrow without one fails on the
 * commit that adds it.
 */

const API = join(process.cwd(), 'src/app/api')
const DOOR = /\b(getCallerContext|cronAuthorized|staffOnly)\b/
const VERBS = /^(GET|POST|PUT|PATCH|DELETE)$/

/**
 * Routes that take no seat, with the reason beside each. A pattern ends
 * in `/**` for everything under it.
 */
const NO_SEAT_NEEDED: Readonly<Record<string, string>> = {
  'auth/**': 'Signing in, signing up, confirming an email and resetting a password happen before there is a seat.',
  'answer/[token]': 'A one-time link mailed to the person asked; the token is the credential and names the one question.',
  'approve-week/[token]': 'A client approver signing one week by email without an account; the token names the week.',
  'packet/[token]': 'A document request link mailed to the person who owes the papers.',
  'claim/[token]': 'A firm claiming the company a client put on Etyme for it, from the link mailed to it.',
  'reply/[token]': 'A reply link mailed to a person; the token names the thread and the person.',
  'supplier-apply/[token]': 'A recommended supplier sending its own details before it has an account.',
  'bench-invite/[token]': 'A person answering a firm’s invitation to its bench, before they have a seat.',
  'contractor-welcome/[token]': 'A contractor’s first visit from the welcome link, before they have a seat.',
  'shared/[token]': 'A consented share of a document; the token is the credential and expires.',
  'c/[slug]': 'A consultant’s public page, published by the consultant.',
  'site/[slug]': 'A company’s public site, published by the company.',
  'health': 'Says the deployment is up; reads no company.',
  'ready': 'The public readiness page: which edges are proven, never whose data.',
  'demo': 'The demo door: seats a visitor in the seeded demo world, never a real company.',
  'demo/sign-out': 'Ends a visitor’s demo seat by clearing its cookie; reads nothing.',
  'seed-world': 'Staff only (callerIsStaff) or the CRON_SECRET; writes only the demo world.',
  'seed-world/rebuild': 'The CRON_SECRET only; deletes and rebuilds only the demo world.',
  'census/request': 'A prospective client asking for a census before it is a company on Etyme.',
  'census/agree': 'The named person at the client accepting the census terms, from the mailed link.',
  'census/upload': 'The client sending its files with the token minted when it agreed.',
  'incidents': 'A browser reporting its own error page; writes an incident row and reads nothing.',
  'map/gate': 'Answers the middleware yes or no for the session’s own seats; returns no data.',
  'onboarding': 'The session’s own first company: creating it or joining it on its domain, before any seat exists.',
  'me/**': 'The session’s own person and nothing else: their page, their benches, their seats.',
  'market/leads': 'POST is the public contact form; GET and PATCH are staff only (mayReadTheList over ETYME_STAFF_EMAILS).',
  'requirements/parse': 'Turns the text it is sent into fields; reads and writes nothing on the record.',
}

/**
 * Routes that read or write the record on a session or a sender alone,
 * each with its owner. This list may only shrink.
 */
const STILL_OPEN: Readonly<Record<string, { owner: string; why: string }>> = {
  'texts/inbound': {
    owner: 'etyme-conversation',
    why:
      'An inbound reply webhook with no provider signature: anybody can post a reply as any address ' +
      'and record an answer on that person’s profile. It needs the provider’s signature checked before it writes.',
  },
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

function routeFiles(dir = API, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) routeFiles(full, out)
    else if (name === 'route.ts') out.push(full)
  }
  return out
}

/** Names a route file imports from a sibling module whose own code reaches a door. */
function helpersThatOpen(file: string, src: string): Set<string> {
  const names = new Set<string>()
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']*)'/g)) {
    const base = resolve(dirname(file), m[2])
    const found = [base + '.ts', join(base, 'index.ts')].find((f) => existsSync(f))
    if (found && DOOR.test(stripComments(readFileSync(found, 'utf8')))) {
      for (const n of m[1].split(',')) {
        const name = n.trim().split(/\s+as\s+/).pop()
        if (name) names.add(name)
      }
    }
  }
  return names
}

/** Each exported handler in the file that reaches no door. */
function handlersWithoutADoor(file: string): string[] {
  const src = stripComments(readFileSync(file, 'utf8'))
  const opens = helpersThatOpen(file, src)
  const calls = (chunk: string) => DOOR.test(chunk) || [...opens].some((h) => new RegExp(`\\b${h}\\(`).test(chunk))

  // Functions in the same file that reach a door, followed through calls.
  const chunks = src.split(/(?=^(?:export\s+)?(?:async\s+)?function\s+\w+|^(?:export\s+)?const\s+\w+\s*=\s*async)/m)
  const nameOf = (c: string) => (c.match(/function\s+(\w+)/) ?? c.match(/const\s+(\w+)\s*=/))?.[1]
  let grew = true
  while (grew) {
    grew = false
    for (const c of chunks) {
      const n = nameOf(c)
      if (!n || VERBS.test(n) || opens.has(n)) continue
      if (calls(c)) { opens.add(n); grew = true }
    }
  }
  return chunks
    .filter((c) => /^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/.test(c))
    .filter((c) => !calls(c))
    .map((c) => c.match(/function\s+(\w+)/)![1])
}

const keyOf = (file: string) => relative(API, dirname(file)).split(sep).join('/')
const named = (key: string, patterns: readonly string[]) =>
  patterns.some((p) => (p.endsWith('/**') ? key === p.slice(0, -3) || key.startsWith(p.slice(0, -2)) : key === p))

const doorless = routeFiles()
  .map((f) => ({ key: keyOf(f), verbs: handlersWithoutADoor(f) }))
  .filter((r) => r.verbs.length > 0)

describe('every route that touches company data goes through the one door', () => {
  it('every handler reaches the caller check, the nightly secret or the staff check, or its route is named with the reason it needs none', () => {
    const unaccounted = doorless
      .filter((r) => !named(r.key, Object.keys(NO_SEAT_NEEDED)) && !named(r.key, Object.keys(STILL_OPEN)))
      .map((r) => `${r.key} (${r.verbs.join(', ')})`)
    expect(
      unaccounted,
      'These routes never resolve a seat. Call getCallerContext and act only on caller.company, ' +
        'or name the route in NO_SEAT_NEEDED with the reason it needs no seat:\n  ' + unaccounted.join('\n  ')
    ).toEqual([])
  })

  it('the import routes and a company’s locations go through the door and never read a company from the request', () => {
    for (const r of ['imports', 'imports/[id]/commit', 'imports/[id]/mapping', 'imports/[id]/rows', 'imports/[id]/rows/[rowId]', 'companies/[id]/locations', 'companies/[id]/template-pack']) {
      expect(doorless.find((d) => d.key === r), r).toBeUndefined()
      const src = stripComments(readFileSync(join(API, r, 'route.ts'), 'utf8'))
      expect(src, r).not.toContain('getSessionEmail')
      expect(src, r).not.toMatch(/body\.companyId|formData\.get\('companyId'\)/)
    }
    const door = readFileSync(join(API, 'imports/door.ts'), 'utf8')
    expect(door).toContain('found.companyId !== mine')
    expect(stripComments(readFileSync(join(API, 'imports/route.ts'), 'utf8'))).toContain('const companyId = caller.company!.id')
  })

  it('every name on either list is a route that exists and still has no door, so a fixed route is struck off', () => {
    const keys = routeFiles().map(keyOf)
    for (const p of [...Object.keys(NO_SEAT_NEEDED), ...Object.keys(STILL_OPEN)]) {
      expect(keys.some((k) => named(k, [p])), `${p} names no route`).toBe(true)
    }
    for (const p of Object.keys(STILL_OPEN)) {
      expect(doorless.some((d) => named(d.key, [p])), `${p} has a door now; strike it off STILL_OPEN`).toBe(true)
    }
  })

  it('the routes still open may only shrink, and each names its owner and what is wrong', () => {
    expect(Object.keys(STILL_OPEN).length).toBeLessThanOrEqual(1)
    for (const [k, v] of Object.entries(STILL_OPEN)) {
      expect(v.owner, k).toMatch(/^etyme-/)
      expect(v.why.split(' ').length, k).toBeGreaterThan(10)
    }
  })

  it('every route that needs no seat says why in a sentence', () => {
    for (const [k, why] of Object.entries(NO_SEAT_NEEDED)) {
      expect(why.split(' ').length, k).toBeGreaterThanOrEqual(6)
    }
  })
})
