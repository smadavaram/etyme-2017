/**
 * Every word the home page shows between its header and its footer, as
 * the guards read it: the page's own lines (`./home-words`), the demo's
 * (`./home-demo`, the seed's) and the CFO view's (`./home-cfo`, the
 * seed's), the CFO view counted although it opens closed, because its
 * lines are in the HTML the server sends.
 *
 * Server and test only: the CFO lines read the seed.
 */

import type { Copy } from '@/lib/positioning'
import { homeCopy, HOME_HERO_LINES, DEMO_COMPANY } from './home-words'
import { homeDemoCopy } from './home-demo'
import { homeCfoLines } from './home-cfo'

export function copyOfHome(): Copy {
  const own = homeCopy()
  const demoAt = own.indexOf(DEMO_COMPANY)
  return {
    hero: own.slice(0, HOME_HERO_LINES),
    body: [
      ...own.slice(HOME_HERO_LINES, demoAt + 2),
      ...homeDemoCopy(),
      ...homeCfoLines().map((l) => l.t),
      ...own.slice(demoAt + 2),
    ],
  }
}

/** The same, as one list of lines in the order a reader meets them. */
export function homeLines(): string[] {
  const c = copyOfHome()
  return [...c.hero, ...c.body]
}
