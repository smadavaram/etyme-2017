import type { Metadata } from 'next'
import { SubPageView } from './sub-page'
import { ON_SCREEN_DOOR, OPEN_DEMO } from './skeleton-words'
import { doorTab, partyAt, segmentAt, tabAddress, tabHref, type PartySlug, type Segment, type SegmentSlug } from './parties'
import { doorMap } from './door-maps'
import { NO_FACTS, type DoorFacts } from './door-map-facts'
import { CorvaneMapView } from './corvane-map-view'

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
 *
 * Since 2026-10-28 a door draws its own party's map under the hero, the
 * way the home page draws Corvane's: its roles are tabs at their own
 * addresses (`?seat=`, beside `?tab=`), read on the server too.
 */

/** What a door's route is handed by Next: the address's query, of which `tab` and the map's `seat` are read. */
export interface DoorParams { searchParams?: { tab?: string | string[]; seat?: string | string[] } }

function tabOf(params?: DoorParams): string | null {
  const t = params?.searchParams?.tab
  return (Array.isArray(t) ? t[0] : t) ?? null
}

export function partyMetadata(slug: PartySlug, params?: DoorParams): Metadata {
  const door = partyAt(slug)!
  const p = doorTab(door, tabOf(params))
  const meta: Metadata = { title: p.tab ? `${p.eyebrow}: ${p.tab.label}` : p.eyebrow, description: p.purpose }
  // A tab opened by `?tab=` that has a plain address of its own names it as the canonical one.
  const plain = p.tab && p.tab.key !== door.tabs![0].key ? tabAddress(door, p.tab.key) : null
  return plain && plain !== tabHref(door, p.tab!.key) ? { ...meta, alternates: { canonical: plain } } : meta
}

/**
 * A segment page's title and line: its own party's name, and the line
 * under its headline. Its canonical address is its own, so a search engine
 * lists the plain address and not the door's `?tab=` twin.
 */
export function segmentMetadata(slug: SegmentSlug): Metadata {
  const s = segmentAt(slug)!
  return { title: s.eyebrow, description: doorTab(partyAt(s.door)!, s.tab).purpose, alternates: { canonical: s.route } }
}

/** One segment page (./parties, 2026-11-22): its door's tab, drawn at the segment's own plain address. */
export function SegmentPageView({ slug, params, facts }: { slug: SegmentSlug; params?: DoorParams; facts?: DoorFacts }) {
  const s = segmentAt(slug)!
  return <PartyPageView slug={s.door} params={params} facts={facts} segment={s} />
}

/**
 * `facts` are the door's live figures, read by its route before it draws
 * (`./door-map-facts`); with none, each live figure on the map says it is
 * on the demo. The map itself is the door tab's own (`./door-maps`), and a
 * door with no map yet (the MSPs') draws none.
 */
export function PartyPageView({ slug, params, facts = NO_FACTS, segment }: { slug: PartySlug; params?: DoorParams; facts?: DoorFacts; segment?: Segment }) {
  const door = partyAt(slug)!
  // A segment page is one tab whatever the address's query says.
  const p = doorTab(door, segment ? segment.tab : tabOf(params))
  const own = p.tab ? tabHref(door, p.tab.key) : door.route
  const drawn = doorMap(own, facts, params?.searchParams?.seat, segment?.route ?? own)
  const demo = 'candidate' in p.demo
    ? { label: OPEN_DEMO, candidate: true as const }
    : { label: OPEN_DEMO, target: p.demo.target }
  const tabs = door.tabs?.map((t) => ({ t: t.label, href: tabAddress(door, t.key), current: t.key === p.tab?.key }))
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
      bandSays={p.bandSays}
      story={p.story}
      map={drawn ? { node: <CorvaneMapView map={drawn.map} seat={drawn.seat} hrefs={drawn.hrefs} doorsOpen inPage />, under: drawn.map.under } : undefined}
    />
  )
}
