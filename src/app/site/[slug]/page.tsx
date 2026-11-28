import { notFound } from 'next/navigation'
import { publicSite, describeSite, titleOf } from '@/lib/public-site'
import { SiteView } from './site-view'

/**
 * A company's public page.
 *
 * The first version was one page of facts for nobody in particular. It was
 * honest and inert — you read it and were done.
 *
 * There is no single audience, so there is no single page. A client or
 * delivery partner is talking to suppliers; a staffing firm is talking to
 * candidates, clients and peer firms at once. Same data underneath,
 * different page, which is the rule CLAUDE.md already sets for the
 * dashboard.
 *
 * Rendered on the server so it is fast, indexable and works with
 * JavaScript off — a public page is the one surface where that still
 * matters.
 *
 * One engine for every tenant (record 111): the sections, the layout and the
 * look are drawn in `site-view.tsx` from what the tenant's record stores.
 * A dark site is the same nothing as before: `publicSite` returns null.
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const site = await publicSite(slug)
  if (!site) return { title: 'Not found' }

  // Read from the record and never empty: a firm with nothing coming
  // free and nothing open still reads as "<name> <does>.".
  return { title: titleOf(site), description: describeSite(site) }
}

export default async function CompanySite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const site = await publicSite(slug)
  if (!site) notFound()
  return <SiteView site={site} />
}
