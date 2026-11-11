// The identity demo checks (stage B of pass 1), walked over HTTP against a
// local copy of the seeded world. Never against production.
//
//   1. Copy a world template, push the schema, run seedMockDirectory.
//   2. Start `next dev -p 3123` on it with NEXTAUTH_URL=http://localhost:3123,
//      a NEXTAUTH_SECRET and NEXT_DIST_DIR=.next-idwalk.
//   3. node check1.mjs (directory sign-in, directory only, SCIM off, JIT),
//      then npx tsx setup.ts, node check2.mjs, node check3.mjs <GMAIL_SEAT>,
//      node check4.mjs <a week the supplier is not party to>,
//      node check5.mjs <the SCIM token check1 printed>.
// The results are in KNOWN-LIMITS.md, "Identity, pass 1, stage B".
const BASE = process.env.BASE ?? 'http://localhost:3123'
const out = []
const say = (...a) => { const l = a.join(' '); out.push(l); console.log(l) }

class Jar {
  constructor() { this.c = new Map() }
  take(res) {
    for (const h of res.headers.getSetCookie?.() ?? []) {
      const [kv, ...attrs] = h.split(';')
      const i = kv.indexOf('=')
      const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim()
      const gone = attrs.some((a) => /max-age=0/i.test(a)) || v === ''
      if (gone) this.c.delete(k); else this.c.set(k, v)
    }
  }
  header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join('; ') }
}

async function go(jar, url, init = {}) {
  const res = await fetch(url.startsWith('http') ? url : BASE + url, { ...init, redirect: 'manual', headers: { ...(init.headers ?? {}), cookie: jar.header() } })
  jar.take(res)
  return res
}

export async function directorySignIn(email, subject, extra = {}) {
  const jar = new Jar()
  let r = await go(jar, `/api/sso/start?email=${encodeURIComponent(email)}&next=/start`)
  const to = r.headers.get('location')
  if (r.status >= 400 || !to || to.includes('/login')) return { jar, refused: to ?? r.status }
  const u = new URL(to)
  const form = new URLSearchParams(Object.fromEntries(u.searchParams))
  if (subject) form.set('subject', subject)
  for (const [k, v] of Object.entries(extra)) form.set(k, v)
  r = await go(jar, u.pathname, { method: 'POST', body: form.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  const cb = r.headers.get('location')
  if (!cb) return { jar, refused: `mock ${r.status}: ${(await r.text()).replace(/<[^>]+>/g, ' ').slice(0, 200)}` }
  r = await go(jar, new URL(cb).pathname + new URL(cb).search)
  const land = r.headers.get('location') ?? ''
  if (land.includes('error=')) return { jar, refused: land }
  r = await go(jar, '/api/auth/csrf')
  const { csrfToken } = await r.json()
  r = await go(jar, '/api/auth/callback/directory-oidc', { method: 'POST', body: new URLSearchParams({ csrfToken, json: 'true', callbackUrl: '/start' }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  const ok = [...jar.c.keys()].some((k) => k.includes('session-token'))
  return { jar, ok, status: r.status, land: r.headers.get('location') }
}

export async function passwordSignIn(email, password) {
  const jar = new Jar()
  let r = await go(jar, '/api/auth/csrf')
  const { csrfToken } = await r.json()
  r = await go(jar, '/api/auth/callback/credentials', { method: 'POST', body: new URLSearchParams({ csrfToken, email, password, json: 'true', callbackUrl: '/start' }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  const ok = [...jar.c.keys()].some((k) => k.includes('session-token'))
  return { jar, ok, location: r.headers.get('location') }
}

export async function json(jar, url, init = {}) {
  const r = await go(jar, url, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } })
  let body = null
  try { body = await r.json() } catch {}
  return { status: r.status, body }
}

export { go, Jar, say, out }
