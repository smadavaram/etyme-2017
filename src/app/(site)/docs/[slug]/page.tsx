import { notFound } from 'next/navigation'
import { DocsSlugView, docMetadata } from '@/lib/public-site/docs-page'
import { docSlugs } from '@/lib/public-site/docs/index'

export function generateStaticParams() {
  return docSlugs().map((slug) => ({ slug }))
}

export const dynamicParams = false

export function generateMetadata({ params }: { params: { slug: string } }) {
  return docMetadata(params.slug)
}

export default function Page({ params }: { params: { slug: string } }) {
  if (!docSlugs().includes(params.slug)) notFound()
  return <DocsSlugView slug={params.slug} />
}
