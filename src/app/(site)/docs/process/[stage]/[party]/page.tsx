import { notFound, permanentRedirect } from 'next/navigation'
import { replacementFor } from '@/lib/public-site/docs/redirects'

// A process page read as one party, until 2026-10-15. It goes where its
// stage went; the party is on the one table, "Who does what".
export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: { stage: string; party: string } }) {
  const to = replacementFor(`/docs/process/${params.stage}/${params.party}`)
  if (to) permanentRedirect(to)
  notFound()
}
