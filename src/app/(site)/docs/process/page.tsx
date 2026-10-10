import { ProcessHomeView, processMetadata } from '@/lib/public-site/docs-page'

export const metadata = processMetadata()

export default function Page() {
  return <ProcessHomeView />
}
