import { PartyPageView, partyMetadata, type DoorParams } from '@/lib/public-site/party-page'

export function generateMetadata(params: DoorParams) { return partyMetadata('suppliers', params) }
export default function Page(params: DoorParams) { return <PartyPageView slug="suppliers" params={params} /> }
