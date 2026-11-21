/**
 * Every word the home page shows between its header and its footer, as
 * the guards read it: the page's own lines (`./home-page-words`) and the
 * sample company's (`./home-sample`, the seed's), the CFO view counted
 * although it opens closed, because its lines are in the HTML the server
 * sends.
 *
 * Server and test only: the sample reads the seed.
 */

import type { Copy } from '@/lib/positioning'
import { homeHeroLines, homeBodyLines } from './home-page-words'
import { homeSample, homeSampleLines } from './home-sample'

export function copyOfHome(): Copy {
  return { hero: homeHeroLines(), body: homeBodyLines(homeSampleLines(homeSample())) }
}

/** The same, as one list of lines in the order a reader meets them. */
export function homeLines(): string[] {
  const c = copyOfHome()
  return [...c.hero, ...c.body]
}
