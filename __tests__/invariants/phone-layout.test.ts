/**
 * Nothing puts columns side by side on a phone unless it means to.
 *
 * ── The bug this is built from ───────────────────────────────────────
 *
 * The founder opened the Add consultant form on a phone. "Full name" and
 * "Email" sat side by side in a two-column grid with no mobile
 * breakpoint, so they read as first name and last name — and a surname
 * went into the email field. The form then refused silently, because the
 * browser's own validation has nowhere to draw a bubble inside a modal.
 *
 * The layout invited the mistake and the validation hid it.
 *
 * Tailwind is mobile-first: an unprefixed `grid-cols-2` is two columns at
 * 375px, not two columns on a desktop. That is easy to write by accident
 * and impossible to see unless somebody opens the thing on a phone —
 * which is exactly why it survived in 28 files.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { gridsWithoutBreakpoint } from '@/lib/positioning'

const FILES = execSync('find src/app -name "*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

/**
 * Places that genuinely mean several columns on a phone.
 *
 * A list rather than a softer rule, because "how many columns is too
 * many" depends on what is in them — two form fields is wrong at 375px
 * and four day-boxes is fine — and a rule that tries to know the
 * difference would be wrong more often than a list somebody has to
 * justify a line in.
 */
const DELIBERATE: Record<string, string> = {
  'src/app/dashboard/timesheets/page.tsx':
    'A week is seven days. Seven inputs at fifty pixels is not a week ' +
    'anybody can type into, so it is four across on a phone — two rows ' +
    'of a week, which is still a week — and seven where there is room.',
}

describe('The app is opened on a phone, and the layout knows it', () => {

  it('finds real screens to check rather than passing on an empty list', () => {
    expect(FILES.length).toBeGreaterThan(40)
  })

  it('no screen puts columns side by side on a phone by accident', () => {
    const offenders = FILES.flatMap((f) => {
      if (DELIBERATE[f]) return []
      const hits = gridsWithoutBreakpoint(readFileSync(f, 'utf8'))
      return hits.length ? [`${f} — ${[...new Set(hits)].join(', ')}`] : []
    })

    expect(
      offenders,
      'These declare columns with no breakpoint, so they are that many ' +
        'columns at 375px. Either stack them by default and split at sm:, ' +
        'or add the file to DELIBERATE with a reason:\n  ' +
        offenders.join('\n  ')
    ).toEqual([])
  })

  it('every deliberate exception carries a reason somebody wrote', () => {
    // An allowlist with no reasons becomes a place to hide a bug.
    for (const [file, why] of Object.entries(DELIBERATE)) {
      expect(why.length, file).toBeGreaterThan(60)
      expect(FILES, `${file} is allowed and does not exist`).toContain(file)
    }
  })

  it('an exception that no longer needs one is caught, so the list cannot rot', () => {
    const pointless = Object.keys(DELIBERATE).filter(
      (f) => gridsWithoutBreakpoint(readFileSync(f, 'utf8')).length === 0
    )
    expect(
      pointless,
      `These are on the allowlist and no longer break the rule — remove them:\n  ${pointless.join('\n  ')}`
    ).toEqual([])
  })

  it('the screen an outsider opens from a phone is covered too', () => {
    // answer/[token] is the one a hiring manager with no account opens
    // from a link in an email, which is the most likely phone of all.
    const outside = 'src/app/answer/[token]/page.tsx'
    expect(FILES).toContain(outside)
    expect(gridsWithoutBreakpoint(readFileSync(outside, 'utf8'))).toEqual([])
  })
})
