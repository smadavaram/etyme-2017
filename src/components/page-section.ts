'use client'

import { useSession } from '@/components/session-provider'
import { sectionForReader } from '@/lib/page-framing'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'

/**
 * The section a page sits under on the reader's own menu, for its eyebrow.
 *
 * Read off the same identity the sidebar is drawn from
 * (`sidebarPropsFrom`), so the heading names a section of the trimmed
 * menu actually on the left of the screen — a desk-less worker's Today
 * and You, a Member's Workforce — and never one of the company's whole
 * menu (sign-up walk, round six, problem 6).
 *
 * Null while the session loads, and where the reader's menu does not
 * list the page, so a page draws no eyebrow rather than a guessed one
 * (sign-up walk, round three, items 11 and 16).
 */
export function usePageSection(href: string): string | null {
  const session = useSession()
  return sectionForReader(sidebarPropsFrom(session), href)
}
