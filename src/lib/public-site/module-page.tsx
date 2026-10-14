import { MODULES, type ModulePage } from './modules'
import { OPEN_DEMO } from './skeleton-words'
import { SubPageView } from './sub-page'

/**
 * The eight product pages, each in the home page's shape (founder,
 * 2026-10-14). The view is shared with the party doors (`./sub-page`);
 * the words are `./modules`.
 *
 * Until that day a step page carried "Step n of 4", Previous and Next, a
 * flow chart, a screenshot, who is involved as cards, capabilities,
 * refusals and the complaint. The four steps stay the spine in two
 * places a reader still meets them: the Platform menu, which lists the
 * eight pages under their steps, and the four chips under the frame. The
 * step-by-step reading, with its flow charts, Previous and Next, is the
 * documentation's.
 */
export function ModulePageView({ m }: { m: ModulePage }) {
  return (
    <SubPageView
      question={m.question}
      purpose={m.purpose}
      step={m.step}
      lines={m.lines}
      demo={{ label: OPEN_DEMO, target: m.demo }}
    />
  )
}

/**
 * What a route file under `app/(site)` needs, so each one is three lines:
 *
 *     import { modulePage } from '@/lib/public-site/module-page'
 *     const { Page, metadata } = modulePage('/requisitions')
 *     export { metadata }
 *     export default Page
 */
export function modulePage(route: string) {
  const m = MODULES.find((x) => x.route === route)
  if (!m) throw new Error(`No module page is registered at ${route}`)
  return {
    metadata: { title: m.title, description: m.purpose },
    Page: function Page() {
      return <ModulePageView m={m} />
    },
  }
}
