import { SegmentPageView, segmentMetadata, type DoorParams } from '@/lib/public-site/party-page'
export const metadata = segmentMetadata('solopreneurs')
export default function Page(params: DoorParams) { return <SegmentPageView slug="solopreneurs" params={params} /> }
