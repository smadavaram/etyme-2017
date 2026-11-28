import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deploymentSecret } from '@/lib/identity/oidc'
import { callbackUrl } from '@/lib/identity/directory'
import { issueMockCode, mockClientId, mockSubjectFor, type MockPerson } from '@/lib/identity/mock-directory'
import { mockCompany, mockPeople } from '@/lib/identity/mock-read'
import { onVerifiedDomain } from '@/lib/identity/provision'

/**
 * GET  /api/mock-directory/[slug]/authorize — the mock directory's sign-in page
 * POST /api/mock-directory/[slug]/authorize — the person picked; back to Etyme with a code
 *
 * THE MOCK DIRECTORY'S SIGN-IN PAGE. It stands in for a company's own
 * directory in the demo and is plainly labeled a mock. It asks for no
 * password: picking a person is its whole idea of proof, which is why it
 * serves only companies whose every verified domain is a reserved name
 * (lib/identity/mock-directory). It sends a code back only to Etyme's own
 * directory callback, for Etyme's mock client id, bound to the PKCE
 * challenge and nonce the request carried.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

type Ask = { clientId: string; redirectUri: string; state: string; nonce: string; codeChallenge: string; method: string; responseType: string }

function askFrom(get: (k: string) => string | null): Ask {
  return {
    clientId: get('client_id') ?? '', redirectUri: get('redirect_uri') ?? '', state: get('state') ?? '', nonce: get('nonce') ?? '',
    codeChallenge: get('code_challenge') ?? '', method: get('code_challenge_method') ?? '', responseType: get('response_type') ?? '',
  }
}

function problem(slug: string, a: Ask): string | null {
  if (a.responseType !== 'code') return 'Only the code flow is supported.'
  if (a.clientId !== mockClientId(slug)) return 'Unknown client.'
  if (a.redirectUri !== callbackUrl()) return 'That redirect address is not registered.'
  if (!a.state || !a.nonce) return 'A state and a nonce are required.'
  if (a.method !== 'S256' || !a.codeChallenge) return 'A PKCE challenge (S256) is required.'
  return null
}

function page(title: string, body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#F0EEE6;color:#1F1E1D;margin:0;padding:24px}main{max-width:440px;margin:40px auto;background:#FBFAF7;border:1px solid #E3DFD5;border-radius:12px;padding:24px}h1{font-family:'Iowan Old Style',Palatino,Georgia,serif;font-weight:400;font-size:22px;letter-spacing:-0.02em;margin:0 0 4px}p{font-size:14px;line-height:1.5}.muted{color:#6B6862;font-size:12px}button{width:100%;text-align:left;padding:10px 12px;margin:6px 0;border:1px solid #E3DFD5;border-radius:8px;background:#fff;font:inherit;font-size:14px;cursor:pointer}button:disabled{color:#9C9891;cursor:not-allowed}input,select{width:100%;box-sizing:border-box;padding:8px;border:1px solid #E3DFD5;border-radius:8px;font:inherit;font-size:14px;margin:4px 0}.tag{display:inline-block;font-size:10px;text-transform:uppercase;letter-spacing:.08em;background:#F5E8DF;color:#C0622E;border-radius:4px;padding:2px 6px}</style></head><body><main>${body}</main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' } },
  )
}

function hidden(a: Ask): string {
  return Object.entries({ client_id: a.clientId, redirect_uri: a.redirectUri, state: a.state, nonce: a.nonce, code_challenge: a.codeChallenge, code_challenge_method: a.method, response_type: a.responseType })
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('')
}

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const c = await mockCompany(params.slug)
  if (!c) return page('Not found', '<h1>No mock directory here</h1><p>The mock directory serves demo companies on reserved domains only.</p>', 404)
  const a = askFrom((k) => request.nextUrl.searchParams.get(k))
  const bad = problem(c.slug, a)
  if (bad) return page('Refused', `<h1>The mock directory refused this request</h1><p>${esc(bad)}</p>`, 400)
  const [people, groups] = await Promise.all([
    mockPeople(c.id, c.issuer),
    prisma.directoryGroupRole.findMany({ where: { companyId: c.id }, select: { groupId: true, groupName: true, role: { select: { name: true } } } }),
  ])
  const list = people.map((p) => `<form method="post">${hidden(a)}<input type="hidden" name="subject" value="${esc(p.subject)}"><button ${p.disabledAt ? 'disabled' : ''}>${esc(p.person.name)} <span class="muted">${esc(p.email)}${p.disabledAt ? ' · turned off in this directory' : ''}</span></button></form>`).join('')
  const groupSelect = groups.length
    ? `<select name="group"><option value="">No group</option>${groups.map((g) => `<option value="${esc(g.groupId)}">${esc(g.groupName ?? g.groupId)} (${esc(g.role.name)} at Etyme)</option>`).join('')}</select>`
    : ''
  return page(`${c.name} directory (mock)`, `<span class="tag">Mock directory</span>
<h1>${esc(c.name)} directory</h1>
<p class="muted">A stand-in for ${esc(c.name)}'s own directory, for the demo. A real directory would check the person's password and second factor here; this one asks for nothing.</p>
<p>Who are you?</p>${list || '<p class="muted">Nobody is in this directory yet.</p>'}
<form method="post" style="margin-top:16px">${hidden(a)}<p class="muted">Somebody new in the directory (seated on first sign-in where ${esc(c.name)} allows it):</p>
<input name="name" placeholder="Full name" required><input name="email" type="email" placeholder="name@${esc(c.domains[0] ?? '')}" required>${groupSelect}<button>Sign in as this new person</button></form>`)
}

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const own = deploymentSecret()
  const c = await mockCompany(params.slug)
  if (!c || !own) return page('Not found', '<h1>No mock directory here</h1>', 404)
  const form = new URLSearchParams(await request.text())
  const a = askFrom((k) => form.get(k))
  const bad = problem(c.slug, a)
  if (bad) return page('Refused', `<h1>The mock directory refused this request</h1><p>${esc(bad)}</p>`, 400)

  let person: MockPerson
  const subject = form.get('subject')
  if (subject) {
    const ei = await prisma.externalIdentity.findUnique({ where: { issuer_subject: { issuer: c.issuer, subject } }, select: { email: true, disabledAt: true, person: { select: { name: true } } } })
    if (!ei) return page('Refused', '<h1>Nobody by that name in this directory</h1>', 400)
    if (ei.disabledAt) return page('Refused', '<h1>This account is turned off in the directory</h1><p>Ask your company\'s IT.</p>', 403)
    person = { subject, email: ei.email, name: ei.person.name, groups: [] }
  } else {
    const email = String(form.get('email') ?? '').trim().toLowerCase()
    const name = String(form.get('name') ?? '').trim()
    if (!name || !onVerifiedDomain(email, c.domains)) return page('Refused', `<h1>That address is not on ${esc(c.name)}'s domain</h1>`, 400)
    const group = String(form.get('group') ?? '').trim()
    person = { subject: mockSubjectFor(email), email, name, groups: group ? [group] : [] }
  }
  const code = issueMockCode({ slug: c.slug, person, nonce: a.nonce, clientId: a.clientId, redirectUri: a.redirectUri, codeChallenge: a.codeChallenge }, own)
  const back = new URL(a.redirectUri)
  back.searchParams.set('code', code)
  back.searchParams.set('state', a.state)
  return NextResponse.redirect(back, 303)
}
