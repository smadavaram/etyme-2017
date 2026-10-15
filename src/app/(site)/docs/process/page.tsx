import { permanentRedirect } from 'next/navigation'
import { OLD_PROCESS_HOME } from '@/lib/public-site/docs/redirects'

// The process overview became the documentation home on 2026-10-15.
export const dynamic = 'force-dynamic'

export default function Page() {
  permanentRedirect(OLD_PROCESS_HOME)
}
