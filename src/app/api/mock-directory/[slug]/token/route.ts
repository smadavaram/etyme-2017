import { NextRequest, NextResponse } from 'next/server'
import { deploymentSecret } from '@/lib/identity/oidc'
import { redeemMockCode } from '@/lib/identity/mock-directory'
import { mockCompany } from '@/lib/identity/mock-read'

/**
 * The mock directory's token endpoint, for a client that calls it over the
 * network. Etyme's own directory door answers the mock in-process with the
 * same function (lib/identity/directory). A mock; demo companies only.
 */
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const own = deploymentSecret()
  const c = await mockCompany(params.slug)
  if (!c || !own) return NextResponse.json({ error: 'invalid_request' }, { status: 404 })
  const form = new URLSearchParams(await request.text())
  let clientId = form.get('client_id') ?? ''
  let clientSecret = form.get('client_secret') ?? ''
  const basic = request.headers.get('authorization')
  if (basic?.startsWith('Basic ')) {
    const [id, sec] = Buffer.from(basic.slice(6), 'base64').toString('utf8').split(':')
    clientId = decodeURIComponent(id ?? '')
    clientSecret = decodeURIComponent(sec ?? '')
  }
  if (form.get('grant_type') !== 'authorization_code') return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 })
  const r = redeemMockCode({
    slug: c.slug, code: form.get('code') ?? '', clientId, clientSecret,
    redirectUri: form.get('redirect_uri') ?? '', codeVerifier: form.get('code_verifier') ?? '',
  }, own)
  if (!r.ok) return NextResponse.json({ error: r.error, error_description: r.says }, { status: 400 })
  return NextResponse.json({ id_token: r.idToken, token_type: 'Bearer', expires_in: 300 }, { headers: { 'Cache-Control': 'no-store' } })
}
