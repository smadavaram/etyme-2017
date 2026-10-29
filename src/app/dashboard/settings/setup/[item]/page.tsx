import { notFound } from 'next/navigation'
import { itemOfSlug } from '@/lib/setup-checklist'
import { SetupChecklist } from '../checklist'

/**
 * One setup item at its own address, `/dashboard/settings/setup/papers`
 * and the like (`itemHref` in lib/setup-checklist), so a refusal that
 * names a step, or a line in the Ask Etyme greeting, opens that step
 * itself. An address that names no item is not found.
 */
export default function SetupItemPage({ params }: { params: { item: string } }) {
  const item = itemOfSlug(params.item)
  if (!item) notFound()
  return <SetupChecklist item={item} />
}
