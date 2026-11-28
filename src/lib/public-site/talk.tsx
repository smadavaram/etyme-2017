/**
 * "Talk to a person": a mail to the one support address, beside "Open
 * the demo" under the home page's question and beside "Sign up" in its
 * band (founder, "Build it", 2026-10-27: a buyer who is not ready to sign
 * up has somebody to write to, and one sentence is enough).
 */

export const TALK = { t: 'Talk to a person', href: 'mailto:support@etyme.com', address: 'support@etyme.com' } as const

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2'

/** The quiet button beside the filled one. */
export const QUIET_BUTTON =
  `whitespace-nowrap rounded-lg border border-etyme-rule bg-etyme-surface px-5 py-3 text-center text-[15px] font-semibold text-etyme-ink transition-colors hover:border-etyme-action ${FOCUS}`

export function TalkToAPerson({ className = QUIET_BUTTON }: { className?: string }) {
  return <a href={TALK.href} className={className}>{TALK.t}</a>
}
