import type { Metadata } from 'next'
import { DEFAULT_EMBED_STEP } from '@/lib/sample-seat'
import { readStep } from './read'
import { Frame, Screen, STEP_TITLE } from './screens'

/**
 * GET /embed/demo — the frame's first screen: the program dashboard, the
 * answer to the home page's question. The same as /embed/demo/overview,
 * drawn here rather than redirected to, so the first load is one request.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sample program',
  robots: { index: false, follow: false },
}

export default async function EmbedDemoPage() {
  const reads = await readStep(DEFAULT_EMBED_STEP)
  return (
    <Frame title={STEP_TITLE[DEFAULT_EMBED_STEP]}>
      <Screen step={DEFAULT_EMBED_STEP} reads={reads} />
    </Frame>
  )
}
