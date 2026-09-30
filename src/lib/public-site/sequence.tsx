/**
 * Previous and Next, and a contents list with "you are here".
 *
 * ── Decided 2026-09-30 ───────────────────────────────────────────────
 *
 * The founder: readers were landed "abruptly on sites in the middle of
 * the page, with no links to the previous or next content". So every
 * page in a sequence — the four step pages, the process, master data
 * and recruiting — has Previous and Next at its top and at its bottom,
 * and a list of the whole sequence with the reader's place marked. Every
 * link here goes to the top of a page, never to a section in the middle
 * of one.
 */

export interface SeqLink {
  href: string
  label: string
}

const SIDE = 'group flex min-w-0 flex-col rounded-lg border border-etyme-rule bg-etyme-raised px-3.5 py-2.5 transition-colors hover:border-etyme-action-press'

export function PrevNext({
  prev, next, where, position,
}: { prev: SeqLink | null; next: SeqLink | null; where: string; position: 'top' | 'bottom' }) {
  return (
    <nav
      aria-label={position === 'top' ? 'Previous and next' : 'Previous and next, again at the end'}
      data-prev-next={position}
      className={
        'grid grid-cols-2 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center ' +
        (position === 'top' ? 'pt-6' : 'border-t border-etyme-rule py-8')
      }
    >
      <p className="col-span-2 text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-etyme-muted sm:order-2 sm:col-span-1">
        {where}
      </p>
      <div className="min-w-0 sm:order-1">
        {prev && (
          <a href={prev.href} rel="prev" className={SIDE}>
            <span className="text-[11px] uppercase tracking-[0.08em] text-etyme-faint">{'← Previous'}</span>
            <span className="mt-0.5 text-[14px] font-medium leading-snug text-etyme-ink group-hover:text-etyme-action-press">{prev.label}</span>
          </a>
        )}
      </div>
      <div className="min-w-0 text-right sm:order-3">
        {next && (
          <a href={next.href} rel="next" className={`${SIDE} items-end`}>
            <span className="text-[11px] uppercase tracking-[0.08em] text-etyme-faint">{'Next →'}</span>
            <span className="mt-0.5 max-w-full text-[14px] font-medium leading-snug text-etyme-ink group-hover:text-etyme-action-press">{next.label}</span>
          </a>
        )}
      </div>
    </nav>
  )
}

export interface ContentsItem extends SeqLink {
  /** A few words beside the label: which step, or who. */
  note?: string
  /** An overview at the head of a list, which is not one of its numbered stages. */
  unnumbered?: boolean
}

/** The whole sequence, with the reader's place marked. */
export function Contents({ title, items, current }: { title: string; items: ContentsItem[]; current: string }) {
  return (
    <nav aria-label={title} className="rounded-xl border border-etyme-rule bg-etyme-surface p-4 sm:p-5">
      <p className="eyebrow">{title}</p>
      <ol className="mt-3 space-y-1">
        {items.map((it) => {
          const here = it.href === current
          const n = it.unnumbered ? null : items.filter((x) => !x.unnumbered).indexOf(it) + 1
          return (
            <li key={it.href}>
              <a
                href={it.href}
                aria-current={here ? 'page' : undefined}
                className={
                  'flex items-baseline gap-3 rounded-md px-2 py-1.5 text-[14px] ' +
                  (here ? 'bg-etyme-action-wash font-semibold text-etyme-action-press' : 'text-etyme-ink hover:bg-etyme-sunk')
                }
              >
                <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-etyme-faint">{n ?? '·'}</span>
                <span className="min-w-0 flex-1">{it.label}</span>
                {here ? (
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em]">{'You are here'}</span>
                ) : (
                  it.note && <span className="hidden shrink-0 text-[12px] text-etyme-muted sm:inline">{it.note}</span>
                )}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
