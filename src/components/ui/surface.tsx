import type { ReactNode } from 'react'

/**
 * The prototype's surface primitives — Panel, Stat, Chip, Lbl and the
 * page head — drawn once, from the brand tokens.
 *
 * Every page had its own: twenty-odd files define a `Panel`, a `Stat` or
 * a `Chip` of their own, each a few pixels different from the next. These
 * are the ones to reach for. They hold no state, so a server page and a
 * client page draw them alike.
 *
 * Two surface types, one theme (CLAUDE.md): a decision surface reads
 * serif and calm, a working surface reads dense and tabular. A `Panel`
 * is either; a `Stat` is the decision surface's number.
 */

/** 10px, uppercase, letter-spaced — the prototype's `Lbl`. */
export function Lbl({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>
}

/**
 * A panel: surface fill, one rule border, a serif title, an optional
 * line under it and an action on the right.
 */
export function Panel({ title, subtitle, action, children, className = '', as: Tag = 'section' }: {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}) {
  return (
    <Tag className={`rounded-panel border border-etyme-rule bg-etyme-surface p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="font-serif text-h3 text-etyme-ink">{title}</h2>}
            {subtitle && <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-etyme-muted">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </Tag>
  )
}

export type StatTone = 'default' | 'attention' | 'verified'

const STAT_TONE: Record<StatTone, string> = {
  default: 'text-etyme-ink',
  attention: 'text-etyme-attention',
  verified: 'text-etyme-verified',
}

/**
 * A number with its label. The figure is serif and tabular, so a row of
 * them lines up; the tone is ink, clay for something needing somebody,
 * or green for something proven — and nothing else.
 *
 * A figure nobody can stand behind is not drawn as a zero: pass `null`
 * and the stat says "—" with the reason in `sub`.
 */
export function Stat({ label, value, sub, tone = 'default', href }: {
  label: ReactNode
  value: ReactNode | null
  sub?: ReactNode
  tone?: StatTone
  /** The stat is a door to the list it counts. */
  href?: string
}) {
  const body = (
    <>
      <div className="stat-label">{label}</div>
      <div className={`mt-2 font-serif text-stat tabular-nums ${STAT_TONE[tone]}`}>{value ?? '—'}</div>
      {sub && <div className="mt-1.5 text-[12px] leading-snug text-etyme-muted">{sub}</div>}
    </>
  )
  const box = 'block rounded-panel border border-etyme-rule bg-etyme-surface px-4 py-4 sm:px-5'
  return href
    ? <a href={href} className={`${box} transition-shadow hover:shadow-lift`}>{body}</a>
    : <div className={box}>{body}</div>
}

export type ChipTone = 'action' | 'attention' | 'verified' | 'danger' | 'passive'

/** The five tones a chip may take. Anything else is a page inventing a color. */
export const CHIP_TONES: readonly ChipTone[] = ['action', 'attention', 'verified', 'danger', 'passive']

/** A short label on a row: a status, a skill, a standing. */
export function Chip({ tone = 'passive', children, title }: { tone?: ChipTone; children: ReactNode; title?: string }) {
  return <span title={title} className={`chip chip--${tone}`}>{children}</span>
}

/**
 * The head of a list page: an eyebrow, a serif title, a line under it,
 * and the page's actions on the right (on a phone, under it).
 *
 * The eyebrow is the section the page sits under on the reader's own
 * menu — `usePageSection(href)` on a client page, `pageFraming` on a
 * server one — and is left out rather than guessed when that is null.
 */
export function PageHead({ eyebrow, title, subtitle, actions }: {
  eyebrow?: string | null
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className={`headline-serif text-[26px] leading-[1.15] text-etyme-ink sm:text-display ${eyebrow ? 'mt-2' : ''}`}>{title}</h1>
        {subtitle && <p className="mt-2 max-w-[620px] text-[14.5px] leading-relaxed text-etyme-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
