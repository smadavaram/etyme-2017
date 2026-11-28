import { isOn } from '@/lib/plugins'

/**
 * The one reader for "may this firm's courses be read on its storefront"
 * (record 120, answer 3). True only where the firm has Train to bench on
 * and has not chosen to hide courses. The site settings count, the page
 * writer's facts and the storefront itself all ask this, and nothing else.
 */
export function coursesShown(company: { pluginsOn?: readonly string[] | null; coursesHiddenOnStorefront?: boolean | null } | null | undefined): boolean {
  if (!company) return false
  return isOn(company.pluginsOn, 'TRAIN_TO_BENCH') && company.coursesHiddenOnStorefront !== true
}
