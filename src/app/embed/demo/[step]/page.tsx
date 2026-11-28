import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { embedStep } from '@/lib/sample-seat'
import { readStep } from '../read'
import { Frame, Screen, STEP_TITLE } from '../screens'

/**
 * GET /embed/demo/[step] — one screen of the sample program, for the home
 * page's frame (founder, 2026-10-14).
 *
 * overview · source · submit · approve · pay. Read as the shared sample
 * seat, drawn on the server, no menus. Who may frame it, and the cookie
 * the buttons inside it carry, are set by the middleware.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sample program',
  robots: { index: false, follow: false },
}

export default async function EmbedStepPage({ params }: { params: { step: string } }) {
  const step = embedStep(params.step)
  if (!step) notFound()
  const reads = await readStep(step)
  return (
    <Frame title={STEP_TITLE[step]}>
      <Screen step={step} reads={reads} />
    </Frame>
  )
}
