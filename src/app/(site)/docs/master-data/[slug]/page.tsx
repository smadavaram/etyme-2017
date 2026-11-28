import { notFound } from 'next/navigation'
import { TopicPageView, topicMetadata } from '@/lib/public-site/docs-page'
import { topicAt, topicsIn } from '@/lib/public-site/docs/topics'

export function generateStaticParams() {
  return topicsIn('master-data').map((t) => ({ slug: t.slug }))
}

export const dynamicParams = false

export function generateMetadata({ params }: { params: { slug: string } }) {
  return topicMetadata('master-data', params.slug)
}

export default function Page({ params }: { params: { slug: string } }) {
  if (!topicAt('master-data', params.slug)) notFound()
  return <TopicPageView group="master-data" slug={params.slug} />
}
