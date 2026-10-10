import { NextResponse, type NextRequest } from 'next/server'
import { MAP_COOKIE, keyOpens } from '@/lib/map-gate'

/**
 * Working out whose company a visitor arrived at.
 *
 * Three kinds of host reach us:
 *
 *   techpeple.etyme.com        a company's address
 *   talent.techpeple.example   a domain they own, pointed here
 *   etyme.com, localhost      the platform itself
 *
 * The host is read here and passed down as a header, so every page and
 * route below can see it without re-parsing. Middleware cannot reach the
 * database — it runs on the edge — so resolving which company a host
 * belongs to happens further in, where Prisma is available.
 *
 * The one thing this does decide is the redirect for an old address. A
 * company that changes its address keeps the old one working, and that
 * promise has to be kept at the very first hop or a saved link shows an
 * error before anything else has a chance to answer.
 */

const PLATFORM_HOST = process.env.NEXT_PUBLIC_PLATFORM_HOST ?? 'etyme.com'

/**
 * Names that are ours rather than a tenant's.
 *
 * Kept in step with RESERVED_SUBDOMAINS by a test. Duplicated rather than
 * imported because middleware runs in the edge runtime and importing the
 * wider module would drag Prisma types into a bundle that cannot hold
 * them.
 */
const PLATFORM_SUBDOMAINS = new Set([
  'www', 'api', 'app', 'admin', 'dashboard', 'login', 'signup', 'signin',
  'auth', 'etyme', 'shared', 'static', 'assets', 'cdn', 'docs', 'status',
  'support', 'help', 'blog', 'about', 'legal', 'privacy', 'terms',
  // Where a listed supplier takes possession of their own record. A firm
  // that grabbed this slug would sit on the one address every invitation
  // in the product points at.
  'claim',
  // Where a supplier answers a role without an account. Every
  // invitation email points at this address.
  'answer',
])

/**
 * The map's gate (lib/map-gate). The page is built once with the deploy,
 * so the gate stands in front of it here. A key opens it and is kept in a
 * cookie; otherwise the seat is asked of /api/map/gate, which can reach
 * the database. Anybody else is shown /map/closed, which says who may see it.
 */
async function mapGate(request: NextRequest): Promise<NextResponse> {
  const key = process.env.MAP_TOKEN ?? null
  const given = request.nextUrl.searchParams.get('key')
  if (keyOpens(given, key)) {
    const url = request.nextUrl.clone()
    url.searchParams.delete('key')
    const res = NextResponse.redirect(url)
    res.cookies.set(MAP_COOKIE, given!, { httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', path: '/map' })
    return res
  }
  if (keyOpens(request.cookies.get(MAP_COOKIE)?.value, key)) return NextResponse.next()
  let open = false
  try {
    const r = await fetch(new URL('/api/map/gate', request.url), {
      headers: { cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
    })
    open = r.ok && (await r.json())?.data?.open === true
  } catch {
    open = false
  }
  if (open) return NextResponse.next()
  const closed = request.nextUrl.clone()
  closed.pathname = '/map/closed'
  closed.search = ''
  return NextResponse.rewrite(closed)
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/map') return mapGate(request)
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0]

  let kind: 'SUBDOMAIN' | 'CUSTOM' | 'PLATFORM' = 'PLATFORM'
  let value = ''

  if (host === PLATFORM_HOST || host === `www.${PLATFORM_HOST}`) {
    kind = 'PLATFORM'
  } else if (host.endsWith(`.${PLATFORM_HOST}`)) {
    const sub = host.slice(0, -(PLATFORM_HOST.length + 1))
    // Only a single label is a tenant. a.b.etyme.com is ours.
    if (!sub.includes('.') && !PLATFORM_SUBDOMAINS.has(sub)) {
      kind = 'SUBDOMAIN'
      value = sub
    }
  } else if (
    host &&
    host !== 'localhost' &&
    !host.endsWith('.localhost') &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(host) &&
    !host.endsWith('.vercel.app')
  ) {
    kind = 'CUSTOM'
    value = host
  }

  const headers = new Headers(request.headers)
  headers.set('x-etyme-host-kind', kind)
  headers.set('x-etyme-host-value', value)

  // A company's own address serves their public page rather than the
  // marketing site. siteLiveAt has been set at sign-up since the
  // beginning and nothing was ever served on it — the subdomain a company
  // was given led nowhere, which is the ninety-second promise recorded
  // and not kept.
  //
  // Rewritten rather than redirected, so the address in the bar stays
  // theirs. A company sending somebody to techpeple.etyme.com should not
  // watch it turn into an etyme.com URL in front of them.
  const path = request.nextUrl.pathname
  const isTenantRoot = path === '/' && kind !== 'PLATFORM'

  if (isTenantRoot) {
    const url = request.nextUrl.clone()
    url.pathname = `/site/${encodeURIComponent(value)}`
    return NextResponse.rewrite(url, { request: { headers } })
  }

  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Everything except the things that never belong to a tenant. Running on
  // every static asset would cost a function invocation per image for no
  // answer anybody uses.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|woff2?)$).*)'],
}
