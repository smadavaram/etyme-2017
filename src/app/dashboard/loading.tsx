import { LoadingState } from '@/components/ui/states'

/**
 * What the content area shows the moment a menu link is pressed, while
 * the next page is on its way (the founder's tester on production,
 * 2026-11-08: "the first click on nav does nothing").
 *
 * Every dashboard page is dynamic and none had a loading boundary, so the
 * router could prefetch nothing for a link and held the old page on the
 * screen, with no sign of the press, until the server answered; a second
 * press then landed at once from the router's cache and read as the one
 * that worked. With this boundary a link's prefetch carries the page up to
 * here, the press moves at once, and the menu marks the new page while it
 * loads. The menu and the header stay drawn: they are the layout's.
 */
export default function DashboardLoading() {
  return (
    <div className="px-4 md:px-8 py-6">
      <LoadingState says="Opening the page…" />
    </div>
  )
}
