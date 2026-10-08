'use client'

import { useSession } from '@/components/session-provider'
import { sectionOfHref } from '@/lib/page-framing'

/**
 * The section a page sits under on the reader's own menu, for its eyebrow.
 *
 * Null while the reader's company is not known yet, so a page draws no
 * eyebrow rather than a guessed one — a typed "Operate" read wrong for a
 * page the menu lists under Network or Compliance, and a literal kind as
 * a fallback drew a supplier's word over a client's page while it loaded
 * (sign-up walk, round three, items 11 and 16).
 */
export function usePageSection(href: string): string | null {
  const session = useSession()
  return sectionOfHref(
    session.company?.kind ?? null,
    href,
    session.seat ? { seated: true, clientName: session.seat.clientName } : null,
  )
}
