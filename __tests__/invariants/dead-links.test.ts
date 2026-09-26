import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Every link in the app reaches a page that exists.
 *
 * ── Why this is a test ───────────────────────────────────────────────
 *
 * The biggest card on the client's home screen pointed at
 * `/dashboard/contractors`, which has never existed. A bare Next 404:
 * no shell, no nav, no way back, from the largest target on the page.
 * The sidebar's own "Contractors" had pointed at `/dashboard/people` all
 * along, so the two disagreed and only one of them was ever clicked in
 * testing.
 *
 * ── Why it is not scoped to one folder ───────────────────────────────
 *
 * etyme-demand wrote the first version of this scan over
 * `src/app/dashboard/program` alone, deliberately, so that it would not
 * go red on files outside their boundary. That was the right call at the
 * time and it found two more dead links immediately — both in
 * `src/lib/party-onboarding.ts`, which is the architect's file, pointing
 * the onboarding checklist's "Master agreement on file" row at
 * `/dashboard/agreements`. Agreements live at
 * `/dashboard/program/agreements`, and the API behind that page serves
 * a vendor and a client alike.
 *
 * Those two are fixed, so the scan widens to all of `src/`. A link is a
 * promise on a screen and the person clicking it cannot tell which
 * folder it was written in.
 *
 * ── What it does not catch ───────────────────────────────────────────
 *
 * Interpolated links — `/dashboard/people/${id}` — are skipped, because
 * a template literal is not a route until it runs. Literal links with a
 * dynamic segment are resolved: the scan walks the folder chain and
 * accepts a `[param]` directory where no literal one matches.
 */

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const DASHBOARD = join(SRC, 'app/dashboard')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(p)
  }
  return out
}

/** A route resolves when its folder chain ends in a page, dynamic segments included. */
function resolves(route: string): boolean {
  let dir = DASHBOARD
  for (const seg of route.split('/').filter(Boolean).slice(1)) {
    const literal = join(dir, seg)
    if (existsSync(literal) && statSync(literal).isDirectory()) {
      dir = literal
      continue
    }
    const dynamic = readdirSync(dir).find(
      (n) => n.startsWith('[') && statSync(join(dir, n)).isDirectory()
    )
    if (!dynamic) return false
    dir = join(dir, dynamic)
  }
  return existsSync(join(dir, 'page.tsx'))
}

describe('every link in the app reaches a page that exists', () => {
  it('sends every card, row, stat and checklist item somewhere real', () => {
    const dead: string[] = []
    for (const file of walk(SRC)) {
      const source = readFileSync(file, 'utf8')
      for (const m of source.matchAll(/['"`](\/dashboard\/[a-zA-Z0-9\-_/]*)['"`?]/g)) {
        const route = m[1].replace(/\/$/, '')
        if (route === '/dashboard') continue
        if (!resolves(route)) {
          dead.push(`${route} — ${relative(ROOT, file).split(sep).join('/')}`)
        }
      }
    }
    expect(
      dead,
      'These links point at pages that do not exist. A visitor gets a bare ' +
        'Next 404 — no shell, no nav, no way back:'
    ).toEqual([])
  })

  it('knows what a dead link looks like, so the check above is not vacuous', () => {
    expect(resolves('/dashboard/contractors')).toBe(false)
    expect(resolves('/dashboard/agreements')).toBe(false)
    expect(resolves('/dashboard/people')).toBe(true)
  })

  it('accepts a link that ends in a dynamic segment, because those are pages too', () => {
    expect(resolves('/dashboard/placements/anything')).toBe(true)
  })

  it('looks at the whole of src, not one folder, because a link is a promise wherever it was written', () => {
    const files = walk(SRC)
    expect(files.some((f) => f.includes(`${sep}lib${sep}`))).toBe(true)
    expect(files.some((f) => f.includes(`${sep}app${sep}dashboard${sep}`))).toBe(true)
  })
})
