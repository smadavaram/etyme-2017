import type { Metadata } from 'next'
import { SubPageView } from './sub-page'
import { ON_SCREEN_DOOR } from './skeleton-words'
import { doorTab, partyAt, tabHref, type PartySlug } from './parties'

/**
 * One party door, in the home page's shape (founder, 2026-10-14). The
 * view is shared with the product pages (`./sub-page`); the words are
 * `./parties`. The band's filled button is this party's own sign-up,
 * and the button under the frame seats the reader at their own desk.
 *
 * A door with tabs (suppliers, workers; founder, 2026-10-16) reads its
 * tab from the address, `?tab=sub`, on the server: the chosen tab's words
 * are in the HTML, an advertisement can link to one, and the tabs are
 * plain links that work with no script. The panel is the door's own
 * whichever tab is open.
 */

/** What a door's route is handed by Next: the address's query, of which `tab` is read. */
export interface DoorParams { searchParams?: { tab?: string | string[] } }

function tabOf(params?: DoorParams): string | null {
  const t = params?.searchParams?.tab
  return (Array.isArray(t) ? t[0] : t) ?? null
}

export function partyMetadata(slug: PartySlug, params?: DoorParams): Metadata {
  const p = doorTab(partyAt(slug)!, tabOf(params))
  return { title: p.tab ? `${p.eyebrow}: ${p.tab.label}` : p.eyebrow, description: p.purpose }
}

export function PartyPageView({ slug, params }: { slug: PartySlug; params?: DoorParams }) {
  const door = partyAt(slug)!
  const p = doorTab(door, tabOf(params))
  const demo = 'candidate' in p.demo
    ? { label: p.demoLabel, candidate: true as const }
    : { label: p.demoLabel, target: p.demo.target }
  const tabs = door.tabs?.map((t) => ({ t: t.label, href: tabHref(door, t.key), current: t.key === p.tab?.key }))
  return (
    <SubPageView
      tabs={tabs && { label: door.eyebrow, list: tabs }}
      question={p.headline}
      purpose={p.purpose}
      step={p.step}
      caption={p.caption}
      label={p.label ?? ON_SCREEN_DOOR}
      lines={p.lines}
      demo={demo}
      signUp={p.signUp}
      band={p.band}
      story={p.story}
    />
  )
}
