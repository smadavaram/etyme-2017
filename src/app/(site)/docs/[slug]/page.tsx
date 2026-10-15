import { notFound, permanentRedirect } from 'next/navigation'
import { DocsSlugView, docMetadata } from '@/lib/public-site/docs-page'
import { docSlugs } from '@/lib/public-site/docs/index'
import { replacementFor } from '@/lib/public-site/docs/redirects'

export function generateStaticParams() {
  return docSlugs().map((slug) => ({ slug }))
}

// The ten party pages that were here until 2026-10-15 are not built
// ahead; each is answered on request with a permanent redirect to the one
// table that replaced them (`lib/public-site/docs/redirects`).
export const dynamicParams = true

export function generateMetadata({ params }: { params: { slug: string } }) {
  return docMetadata(params.slug)
}

export default function Page({ params }: { params: { slug: string } }) {
  if (docSlugs().includes(params.slug)) return <DocsSlugView slug={params.slug} />
  const to = replacementFor(`/docs/${params.slug}`)
  if (to) permanentRedirect(to)
  notFound()
}
