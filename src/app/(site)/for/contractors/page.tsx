import { PartyPageView, partyMetadata } from '@/lib/public-site/party-page'

export const metadata = partyMetadata('contractors')
export default function Page() { return <PartyPageView slug="contractors" /> }
