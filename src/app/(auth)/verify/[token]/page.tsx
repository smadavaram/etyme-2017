'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { DoorFrame } from '../../door-frame'

/**
 * The link in the sign-up email.
 *
 * Opening it confirms the email, makes what the sign-up asked for — the
 * company, or the candidate's own page — and signs the person in, once
 * (lib/password-door). It does that from the browser rather than on
 * page load at the server, so a mail scanner that fetches every link to
 * check it does not spend somebody's link before they click it.
 */
export default function VerifyPage({ params }: { params: { token: string } }) {
  const router = useRouter()
  const [refusal, setRefusal] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    signIn('credentials', { verifyToken: params.token, redirect: false }).then((res) => {
      if (res?.ok && !res.error) {
        // /start sends a new company to its setup and anybody else to their own desk.
        router.replace('/start?welcome=1' as any)
      } else {
        setRefusal(res?.error && res.error !== 'CredentialsSignin' ? res.error : 'This link does not work. Sign up again with the same email and we send a new one.')
      }
    })
  }, [params.token, router])

  return (
    <DoorFrame>
      {!refusal ? (
        <p className="text-sm text-etyme-muted">Confirming your email…</p>
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
