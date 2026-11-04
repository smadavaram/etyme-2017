'use client'

import { useSession, useSwitchHat, type SessionState } from '@/components/session-provider'
import { deskOf } from '@/components/shell/sidebar-props'
import { hatsFor, offersYouHat, type HatLine } from '@/lib/nav-table'

/**
 * The person's hats, one line each, in the account menu (founder,
 * 2026-11-03: "company user and individual can be switched on the top
 * right menu", and "You can go under profile and they switch to worker
 * account"). Every firm seat they hold, "Tapin · Owner", and "You ·
 * Sharath" only where the work makes them a worker. The current hat is
 * marked; another is one click away and remembered on this device.
 *
 * Draws nothing where there is only one hat to wear, which is most
 * people: a list of one is a label, and the account menu already says
 * who and where.
 */
export function useHats(): HatLine[] {
  return hatsForSession(useSession())
}

/**
 * The account menu's lines for a session, as the screen draws them: the
 * hook above is this and nothing else, so a test that reads it reads the
 * screen's own path.
 */
export function hatsForSession(session: SessionState): HatLine[] {
  const desk = deskOf(session)
  if (session.loading) return []
  const youOffered = offersYouHat(desk.menuKind, desk.isConsultant, {
    worker: desk.worker, permissions: desk.permissions, seatedAtClient: desk.seatedAtClient, region: desk.region,
  })
  return hatsFor({
    seats: session.seats ?? [],
    activeContextId: session.activeContextId ?? null,
    personName: session.person?.name,
    isConsultant: desk.isConsultant,
    youOffered,
    hat: session.hat ?? 'firm',
  })
}

export function HatList({ onPicked, roomy = false }: {
  /** Called before the switch, so the menu that holds the list can close. */
  onPicked?: () => void
  /** The phone sheet's thumb-sized rows. */
  roomy?: boolean
}) {
  const hats = useHats()
  const switchHat = useSwitchHat()
  if (hats.length < 2) return null
  return (
    <div role="group" aria-label="Switch between your hats" className="py-1 border-b border-etyme-rule">
      {hats.map((line) => (
        <button
          key={`${line.hat}:${line.contextId ?? ''}`}
          type="button"
          role="menuitemradio"
          aria-checked={line.current}
          disabled={line.current}
          onClick={() => { onPicked?.(); switchHat(line) }}
          className={`w-full text-left px-4 ${roomy ? 'py-3' : 'py-2'} text-[13px] flex items-center gap-2 transition-colors
                      ${line.current
                        ? 'text-etyme-action font-medium bg-etyme-action-wash cursor-default'
                        : 'text-etyme-ink hover:bg-etyme-surface focus-visible:bg-etyme-surface'}`}
        >
          <span aria-hidden="true" className="w-3 shrink-0">{line.current ? '✓' : ''}</span>
          <span className="truncate">{line.label}</span>
        </button>
      ))}
    </div>
  )
}
