import { NextRequest } from 'next/server'
import { actOn } from '../act'

/** POST /api/documents/:id/send — see lib/document-request for the rule. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return actOn(request, id, 'send')
}
