import { permanentRedirect } from 'next/navigation'
import { FOLDED } from '@/lib/public-site/folded'

// Folded into Invoices on 2026-10-15 (lib/public-site/folded). The old
// address answers with a permanent redirect, and draws nothing.
export const dynamic = 'force-dynamic'

export default function Page() {
  permanentRedirect(FOLDED['/chain'])
}
