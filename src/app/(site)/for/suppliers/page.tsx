import { PartyPageView, partyMetadata } from '@/lib/public-site/party-page'

export const metadata = partyMetadata('suppliers')
export default function Page() { return <PartyPageView slug="suppliers" /> }
