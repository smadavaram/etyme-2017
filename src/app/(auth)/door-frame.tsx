import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'

/**
 * The frame every door page shares — sign in, sign up, confirm, reset —
 * so the five read as one place: the brand panel on the left at desktop
 * width, the form on the right, the logo on top on a phone.
 */
export function DoorFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-etyme-navy flex">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12">
        <Link href="/">
          <EtymeLogo size="lg" inverted />
        </Link>
        <div className="max-w-md">
          <p className="font-serif text-2xl text-white leading-snug mb-4 tracking-[-0.02em] text-balance">
            Enterprise contingent workforce management.
          </p>
          <p className="text-sm text-white/50 leading-relaxed">
            Every supplier&rsquo;s contractors on one record: jobs, timesheets, bills and time on site.
          </p>
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

export const doorButton =
  'w-full px-4 py-2.5 rounded-lg bg-etyme-action text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50'

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
