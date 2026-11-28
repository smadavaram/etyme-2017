import { DocsHomeView, docsHomeMetadata } from '@/lib/public-site/docs-page'

export const metadata = docsHomeMetadata()

export default function Page() {
  return <DocsHomeView />
}
