import { notFound } from 'next/navigation'
import { ProcessPageView, processMetadata } from '@/lib/public-site/docs-page'
import { PROCESS, processAt, partiesFor } from '@/lib/public-site/docs/process'

export function generateStaticParams() {
  return PROCESS.flatMap((p) => partiesFor(p).map((d) => ({ stage: p.slug, party: d.slug })))
}

export const dynamicParams = false

export function generateMetadata({ params }: { params: { stage: string; party: string } }) {
  return processMetadata(params.stage, params.party)
}

export default function Page({ params }: { params: { stage: string; party: string } }) {
  const p = processAt(params.stage)
  if (!p || !partiesFor(p).some((d) => d.slug === params.party)) notFound()
  return <ProcessPageView slug={params.stage} party={params.party} />
}
