/**
 * Which route a call reached, and whose it is.
 *
 * `/api/requisitions/cm1x…/approve` is one call; the route it reached is
 * `/api/requisitions/[id]/approve`, and the file behind that is
 * `src/app/api/requisitions/[id]/approve/route.ts`. Timings are grouped
 * by the route, never by the call, or two hundred approvals would read
 * as two hundred routes taken once each.
 *
 * The owner is read off the file with `domainOf` in `lib/domains`, the
 * same map the ownership test reads, so a fault names the agent who
 * would fix it rather than a guess.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { domainOf, type DomainKey } from '@/lib/domains'

const ROOT = join(__dirname, '..', '..')
const APP = join(ROOT, 'src', 'app')

export interface RouteRef {
  /** The route pattern, e.g. `/api/requisitions/[id]/approve`. */
  route: string
  /** Repo-relative file, or null where no route file answers this path. */
  file: string | null
  /** The domain that owns the file, or null where nobody does. */
  owner: DomainKey | null
}

const cache = new Map<string, RouteRef>()

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** The dynamic folders inside a folder: `[id]`, `[...slug]`. */
function dynamicChildren(dir: string): string[] {
  try {
    return readdirSync(dir).filter((d) => /^\[.+\]$/.test(d) && isDir(join(dir, d)))
  } catch {
    return []
  }
}

/** The route a concrete path reached. Pure apart from reading folder names. */
export function routeOf(path: string): RouteRef {
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/'
  const hit = cache.get(clean)
  if (hit) return hit

  const segments = clean.split('/').filter(Boolean)
  let dir = APP
  const pattern: string[] = []
  let ok = true
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (isDir(join(dir, seg))) {
      dir = join(dir, seg)
      pattern.push(seg)
      continue
    }
    const dyn = dynamicChildren(dir)
    const catchAll = dyn.find((d) => d.startsWith('[...') || d.startsWith('[[...'))
    const single = dyn.find((d) => !d.startsWith('[...') && !d.startsWith('[[...'))
    if (single) {
      dir = join(dir, single)
      pattern.push(single)
    } else if (catchAll) {
      dir = join(dir, catchAll)
      pattern.push(catchAll)
      break
    } else {
      ok = false
      pattern.push(...segments.slice(i))
      break
    }
  }
  const fileAbs = ok ? join(dir, 'route.ts') : null
  const file = fileAbs && existsSync(fileAbs) ? fileAbs.slice(ROOT.length + 1) : null
  const ref: RouteRef = {
    route: '/' + pattern.join('/'),
    file,
    owner: file ? (domainOf(file)?.key ?? null) : null,
  }
  cache.set(clean, ref)
  return ref
}

/** The owner of a file under `scripts/simulate`, for a stage's own row in the report. */
export function ownerOfFile(repoPath: string): DomainKey | null {
  return domainOf(repoPath)?.key ?? null
}
