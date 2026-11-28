import { PartyPageView, partyMetadata, type DoorParams } from '@/lib/public-site/party-page'

export function generateMetadata(params: DoorParams) { return partyMetadata('contractors', params) }
export default function Page(params: DoorParams) { return <PartyPageView slug="contractors" params={params} /> }
