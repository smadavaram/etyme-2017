import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'
import { STEPS } from '@/lib/public-site/steps'

/**
 * The frame every door page shares — sign in, sign up, confirm, reset —
 * so the five read as one place: the brand panel on the left at desktop
 * width, the form on the right, the logo on top on a phone.
 *
 * The panel says the category, one line, and the home page's four steps
 * in the home page's own words, read from the one list the home page and
 * the documentation draw (`lib/public-site/steps`), so a door can never
 * say "pay one matched invoice" while the home page says "you pay what
 * matched" (sign-up walk, round two, item 44).
 */
export const DOOR_STEPS: readonly string[] = STEPS.map((s) => s.home)

export function DoorFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-etyme-navy flex">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12">
        <Link href="/">
          <EtymeLogo size="lg" inverted />
        </Link>
        <div className="max-w-md">
          <p className="font-serif text-2xl text-white leading-snug mb-4 tracking-[-0.02em] text-balance">
            Enterprise contingent workforce management
          </p>
          <p className="text-sm text-white/50 leading-relaxed">
            Every supplier&rsquo;s contractors on one record: jobs, timesheets, bills and time on site.
          </p>
          <ol className="mt-6 space-y-2 text-sm text-white/60 leading-relaxed">
            {DOOR_STEPS.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="tabular-nums text-white/30">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="text-xs text-white/30">Etyme Inc.</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8 bg-etyme-canvas lg:rounded-l-3xl">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-10">
            <EtymeLogo size="lg" />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

export const doorField =
  'w-full px-3.5 py-2.5 rounded-lg border border-etyme-rule bg-etyme-raised text-sm text-etyme-ink ' +
  'placeholder:text-etyme-faint focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action transition-all'

// A transparent 1px border so a filled door and an outlined one stand the
// same height side by side (screen walk on df3074094: they differed by 2px).
export const doorButton =
  'w-full px-4 py-2.5 rounded-lg border border-transparent bg-etyme-action text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50'

export function DoorLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-etyme-muted mb-1.5">
      {children}
    </label>
  )
}

/** A refusal, said in the route's own sentence. */
export function DoorError({ says }: { says: string | null }) {
  if (!says) return null
  return <p role="alert" className="text-sm text-etyme-attention">{says}</p>
}

/**
 * Every other button on a door page: an outline. One filled button a
 * screen (founder, 2026-11-12: "The blue became very very prominent").
 */
export const doorOutline =
  'w-full px-4 py-2.5 rounded-lg border border-etyme-action text-sm font-medium text-etyme-action-press ' +
  'hover:bg-etyme-canvas transition-colors disabled:opacity-50'

/** The line between the account buttons and the email: "or use your email". */
export function DoorDivider({ words }: { words: string }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-etyme-rule" />
      <span className="text-xs text-etyme-muted">{words}</span>
      <div className="flex-1 h-px bg-etyme-rule" />
    </div>
  )
}

/** The address a second screen is about, and Change, which goes back. */
export function DoorWho({ email, onChange }: { email: string; onChange: () => void }) {
  return (
    <div data-door-who className="flex items-center justify-between gap-3 mb-5 rounded-lg border border-etyme-rule bg-etyme-canvas px-3.5 py-2.5">
      <span className="text-sm text-etyme-ink truncate min-w-0">{email}</span>
      <button type="button" onClick={onChange} className="text-sm text-etyme-action-press hover:underline shrink-0">Change</button>
    </div>
  )
}
