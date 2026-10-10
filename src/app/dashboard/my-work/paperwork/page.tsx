'use client'

import { YourPapers } from '../papers'

/**
 * The page a chase letter names.
 *
 * Every letter the watch sends a worker ends "Upload it from your
 * Paperwork page." Until today there was no such page — her menu read
 * Your work · Your page · Who has you · Your data · Notifications — so
 * every chase in the system pointed at a door that was not there. The
 * section on her work page is still there, under `#paperwork`; this is
 * the same section with an address of its own, so a letter can name it
 * and one click lands her on the thing the letter described.
 *
 * It is a page and not a nav entry because the sidebar belongs to
 * `etyme-architect`: the link into "You" is theirs to add, and the
 * letter's wording is `etyme-conversation`'s. Both are asks, and until
 * either lands this URL works, the link from the work page works, and
 * nothing in between is broken.
 */
export default function PaperworkPage() {
  return (
    <div className="max-w-4xl">
      <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">You</div>
      <h1 className="font-serif text-[28px] text-etyme-ink tracking-[-0.02em] mb-1">Your paperwork</h1>
      {/* The sentence under the heading is the section's own, so the
          page and the work page cannot describe the same list two
          different ways. */}
      <p className="text-sm text-etyme-muted mb-5 max-w-prose">
        Nobody can start you on a site without the right papers on file, and the ones that run out are
        yours to renew — from every firm you work through.
      </p>

      <YourPapers standalone />

      <a href="/dashboard/my-work" className="text-sm text-etyme-action hover:underline">
        Back to your work
      </a>
    </div>
  )
}
