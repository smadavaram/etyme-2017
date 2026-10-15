import type { Metadata } from 'next'
import { SubPageView } from './sub-page'
import { ON_SCREEN_DOOR } from './skeleton-words'
import { partyAt, type PartySlug } from './parties'

/**
 * One party door, in the home page's shape (founder, 2026-10-14). The
 * view is shared with the product pages (`./sub-page`); the words are
 * `./parties`. The band's filled button is this party's own sign-up,
 * and the button under the frame seats the reader at their own desk.
 */

export function partyMetadata(slug: PartySlug): Metadata {
  const p = partyAt(slug)!
  return { title: p.eyebrow, description: p.purpose }
}

export function PartyPageView({ slug }: { slug: PartySlug }) {
  const p = partyAt(slug)!
  const demo = 'candidate' in p.demo
    ? { label: p.demoLabel, candidate: true as const }
    : { label: p.demoLabel, target: p.demo.target }
  return (
    <SubPageView
      question={p.question}
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
