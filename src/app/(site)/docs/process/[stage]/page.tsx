import { notFound, permanentRedirect } from 'next/navigation'
import { replacementFor } from '@/lib/public-site/docs/redirects'

// Nine process pages became five step pages on 2026-10-15. Each old
// address answers with a permanent redirect to the page that took it.
export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: { stage: string } }) {
  const to = replacementFor(`/docs/process/${params.stage}`)
  if (to) permanentRedirect(to)
  notFound()
}
