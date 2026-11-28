import { notFound } from 'next/navigation'
import { publicSite, titleOf } from '@/lib/public-site'
import { PageView } from '../../site-view'

/**
 * One of a tenant's own pages (record 111): the title and words the Owner
 * saved in Settings, in the same template and look as the home page. A dark
 * site, or a page the tenant has not saved, is the same nothing.
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string; page: string }> }) {
  const { slug, page } = await params
  const site = await publicSite(slug)
  const found = site?.look.pages.find((p) => p.slug === page)
  if (!site || !found) return { title: 'Not found' }
  return { title: `${found.title} · ${titleOf(site)}` }
}

export default async function TenantPage({ params }: { params: Promise<{ slug: string; page: string }> }) {
  const { slug, page } = await params
  const site = await publicSite(slug)
  const found = site?.look.pages.find((p) => p.slug === page)
  if (!site || !found) notFound()
  return <PageView site={site} page={found} />
}
