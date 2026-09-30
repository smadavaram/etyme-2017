import { notFound } from 'next/navigation'
import { ProcessPageView, processMetadata } from '@/lib/public-site/docs-page'
import { PROCESS, processAt } from '@/lib/public-site/docs/process'

export function generateStaticParams() {
  return PROCESS.map((p) => ({ stage: p.slug }))
}

export const dynamicParams = false

export function generateMetadata({ params }: { params: { stage: string } }) {
  return processMetadata(params.stage)
}

export default function Page({ params }: { params: { stage: string } }) {
  if (!processAt(params.stage)) notFound()
  return <ProcessPageView slug={params.stage} />
}
