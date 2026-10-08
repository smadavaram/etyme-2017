import { doorOpen } from '@/lib/password-door'
import { RESET_SHUT } from '@/lib/password'
import { DoorFrame } from '../door-frame'
import { ResetForm } from './form'

/**
 * Forgot your password. Without an email sender no link can go, so the
 * page says so before any form (round one of the sign-up walk, item 2).
 */
export const dynamic = 'force-dynamic'

export default function ResetPage() {
  if (!doorOpen()) {
    return (
      <DoorFrame>
        <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-3">Set a new password</h1>
        <p className="text-sm text-etyme-ink">{RESET_SHUT}</p>
        <p className="text-sm mt-6"><a href="/login" className="text-etyme-action-press hover:underline">Back to sign in</a></p>
      </DoorFrame>
    )
  }
  return <ResetForm />
}
