'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

/** Hands the ticket the server set to NextAuth's directory door, once. */
export function FinishDirectorySignIn({ next }: { next: string }) {
  const router = useRouter()
  const ran = useRef(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const to = next.startsWith('/') && !next.startsWith('//') ? next : '/start'
    signIn('directory-oidc', { redirect: false }).then((res) => {
      if (res?.ok && !res.error) router.replace(to as any)
      else setRefusal(res?.error && res.error !== 'CredentialsSignin' ? res.error : 'This sign-in was already used, or ran out. Start again from the sign-in page.')
    })
  }, [next, router])
  if (!refusal) return <p className="text-sm text-etyme-muted">Signing you in through your company&rsquo;s directory…</p>
  return (
    <>
      <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-3">This sign-in did not go through</h1>
      <p role="alert" className="text-sm text-etyme-attention">{refusal}</p>
      <p className="text-sm mt-6"><a href="/login" className="text-etyme-action-press hover:underline">Back to sign in</a></p>
    </>
  )
}
