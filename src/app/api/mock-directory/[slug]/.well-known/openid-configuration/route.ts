import { NextRequest, NextResponse } from 'next/server'
import { appUrl } from '@/lib/app-url'
import { mockDiscovery } from '@/lib/identity/mock-directory'
import { mockCompany } from '@/lib/identity/mock-read'

/** The mock directory's discovery document. A mock; demo companies on reserved domains only. */
export async function GET(_request: NextRequest, { params }: { params: { slug: string } }) {
  const c = await mockCompany(params.slug)
  if (!c) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(mockDiscovery(c.slug, appUrl()))
}
