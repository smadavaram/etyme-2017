import { PartyPageView, partyMetadata } from '@/lib/public-site/party-page'

export const metadata = partyMetadata('integrators')
export default function Page() { return <PartyPageView slug="integrators" /> }
