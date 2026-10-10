'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { DoorFrame, doorButton } from '../../door-frame'
import { safeNext, claimTokenIn, CONFIRMED_CODE } from '@/lib/password-words'

/**
 * The link in the sign-up email.
 *
 * Opening it confirms the email, makes what the sign-up asked for — the
 * company, or the candidate's own page — and signs the person in, once
 * (lib/password-door). It does that from the browser rather than on
 * page load at the server, so a mail scanner that fetches every link to
 * check it does not spend somebody's link before they click it.
 *
 * Two endings beside the ordinary one (round one of the sign-up walk):
 * a link clicked again after the address is confirmed says so and offers
 * Sign in; and a sign-up from a supplier invitation (`?then=/claim/…`)
 * takes that company's record straight away, founding nothing.
 */
export default function VerifyPage({ params, searchParams }: { params: { token: string }; searchParams?: { then?: string } }) {
  const router = useRouter()
  const [refusal, setRefusal] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const claim = claimTokenIn(safeNext(searchParams?.then))
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    signIn('credentials', { verifyToken: params.token, redirect: false }).then((res) => {
      if (res?.ok && !res.error) {
        if (claim) {
          // Take the invited company's record now; the claim page explains a refusal.
          fetch(`/api/claim/${claim}`, { method: 'POST' })
            .then((r) => r.json())
            // A fresh claim opens setup at "How you work", with its
            // client named (round two, item 29); /start decides.
            .then((b) => router.replace((b?.data && b.data.already === false ? '/start' : b?.data?.landing ?? `/claim/${claim}`) as any))
            .catch(() => router.replace(`/claim/${claim}` as any))
          return
        }
        // /start sends a new company to its setup and anybody else to their own desk.
        router.replace('/start?welcome=1' as any)
      } else {
        const said = res?.error && res.error !== 'CredentialsSignin' ? res.error : 'This link does not work. Sign up again with the same email and we send a new one.'
        if (said.startsWith(`${CONFIRMED_CODE}:`)) {
          setConfirmed(true)
          setRefusal(said.slice(CONFIRMED_CODE.length + 1))
        } else {
          setRefusal(said)
        }
      }
    })
  }, [params.token, router, claim])

  return (
    <DoorFrame>
      {!refusal ? (
        <p className="text-sm text-etyme-muted">Confirming your email…</p>
      ) : confirmed ? (
        <>
          <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-3">Already confirmed</h1>
          <p className="text-sm text-etyme-ink">{refusal}</p>
          <a href={claim ? `/login?next=/claim/${claim}` : '/login'} className={`mt-6 inline-block text-center ${doorButton}`}>Sign in</a>
        </>
      ) : (
        <>
          <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-3">This link did not work</h1>
          <p role="alert" className="text-sm text-etyme-attention">{refusal}</p>
          <p className="text-sm mt-6">
            <a href="/signup" className="text-etyme-action-press hover:underline">Sign up again</a>
            <span className="text-etyme-faint"> · </span>
            <a href="/login" className="text-etyme-action-press hover:underline">Sign in</a>
          </p>
        </>
      )}
    </DoorFrame>
  )
}
