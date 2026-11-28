import { NextRequest, NextResponse } from 'next/server'
import { deploymentSecret } from '@/lib/identity/oidc'
import { mockJwks } from '@/lib/identity/mock-directory'
import { mockCompany } from '@/lib/identity/mock-read'

/** The mock directory's public signing key. A mock; demo companies on reserved domains only. */
export async function GET(_request: NextRequest, { params }: { params: { slug: string } }) {
  const own = deploymentSecret()
  const c = await mockCompany(params.slug)
  if (!c || !own) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(mockJwks(own))
}
