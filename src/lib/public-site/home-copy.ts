/**
 * Every word the home page shows between its header and its footer, as
 * the guards read it: the page's own lines (`./home-words`), the glance's
 * two figures, the demo's (`./home-demo`, the seed's) and the CFO view's
 * (`./home-cfo`, the seed's), the CFO view counted although it opens
 * closed, because its lines are in the HTML the server sends.
 *
 * Server and test only: the CFO lines read the seed.
 */

import type { Copy } from '@/lib/positioning'
import { homeCopy, CFO_LABEL, CFO_TITLE, GLANCE_TITLE, GLANCE_NOTE } from './home-words'
import { homeDemo, homeDemoCopy } from './home-demo'
import { homeCfoCopy, homeGlanceHeld } from './home-cfo'

/** The glance's two figures, as the hero draws them: the month's held total and "17 / 18". */
export function glanceFigures(): string[] {
  const w = homeDemo().watch
  return [homeGlanceHeld()?.amount ?? null, w ? `${w.months} / ${w.limit}` : null].filter((x): x is string => x !== null)
}

export function copyOfHome(): Copy {
  const own = homeCopy(homeGlanceHeld())
  const heroEnds = own.indexOf(GLANCE_NOTE) + 1
  const cfoAt = own.indexOf(CFO_TITLE)
  const labelAt = own.indexOf(CFO_LABEL)
  // The glance's figures sit under its title, before their own captions.
  const glanceAt = own.indexOf(GLANCE_TITLE) + 1
  return {
    hero: [...own.slice(0, glanceAt), ...glanceFigures(), ...own.slice(glanceAt, heroEnds)],
    body: [
      ...homeDemoCopy(),
      // The page's own words from the CFO card's heading, the CFO figures before its label.
      ...own.slice(cfoAt, labelAt),
      ...homeCfoCopy(),
      ...own.slice(labelAt),
    ],
  }
}

/** The same, as one list of lines in the order a reader meets them. */
export function homeLines(): string[] {
  const c = copyOfHome()
  return [...c.hero, ...c.body]
}
