import { notFound } from 'next/navigation'
import { TopicPageView, topicMetadata } from '@/lib/public-site/docs-page'
import { topicAt, topicsIn } from '@/lib/public-site/docs/topics'

export function generateStaticParams() {
  return topicsIn('recruiting').map((t) => ({ slug: t.slug }))
}

export const dynamicParams = false

export function generateMetadata({ params }: { params: { slug: string } }) {
  return topicMetadata('recruiting', params.slug)
}

export default function Page({ params }: { params: { slug: string } }) {
  if (!topicAt('recruiting', params.slug)) notFound()
  return <TopicPageView group="recruiting" slug={params.slug} />
}
