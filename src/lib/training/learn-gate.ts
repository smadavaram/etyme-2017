import { isOn } from '@/lib/plugins'

/**
 * The one reader for "is a firm's learning micro-site reachable". It asks
 * the plugin switch and nothing else: hiding courses on the storefront
 * list is a different question (record 120, answer 3). A dark site reads
 * the same as no firm, so a visitor learns nothing about the firm.
 */
export function learnOpen(company: { pluginsOn?: readonly string[] | null } | null | undefined): boolean {
  return !!company && isOn(company.pluginsOn, 'TRAIN_TO_BENCH')
}

/** The sentence a signed-in seat reads where a /api/learn route is refused for a firm whose plugin is off. */
export const LEARN_OFF_SAYS = 'The learning site is off for this firm. Its Owner turns it on in Settings.'
