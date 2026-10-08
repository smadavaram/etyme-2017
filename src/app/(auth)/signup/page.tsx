import { doorOpen } from '@/lib/password-door'
import { SIGNUP_SHUT, safeNext, claimTokenIn } from '@/lib/password'
import { DoorFrame } from '../door-frame'
import { SignUpForm } from './form'
import { COMPANY_TYPES } from '@/lib/onboarding'

/**
 * /signup. Without an email sender nobody can confirm an address, so the
 * page says so before any form and offers nothing to fill in (round one of
 * the sign-up walk, item 1). Asked on every request, because the sender is
 * an environment setting a deployment can gain without a rebuild.
 *
 * `?claim=<token>`, or `?next=/claim/<token>` carried from the sign-in
 * page, is a supplier invitation: the form asks only who you are, and
 * confirming takes that company's record.
 */
export const dynamic = 'force-dynamic'

export default function SignUpPage({ searchParams }: { searchParams: { claim?: string; next?: string; type?: string } }) {
  if (!doorOpen()) {
    return (
      <DoorFrame>
        <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-3">Sign-up is off</h1>
        <p className="text-sm text-etyme-ink">{SIGNUP_SHUT}</p>
        <p className="text-sm mt-6"><a href="/login" className="text-etyme-action-press hover:underline">Back to sign in</a></p>
      </DoorFrame>
    )
  }
  const raw = typeof searchParams?.claim === 'string' ? searchParams.claim : null
  const claimToken = (raw && /^[A-Za-z0-9_-]+$/.test(raw) ? raw : null) ?? claimTokenIn(safeNext(searchParams?.next))
  // `?type=solo` opens the company form on the one-person firm, the link a
  // candidate's own page offers to become one (sign-up walk, round two, item 21).
  const type = COMPANY_TYPES.some((t) => t.key === searchParams?.type) ? searchParams.type! : null
  return <SignUpForm claimToken={claimToken} initialType={type} />
}
