/**
 * Stage: approve-jobs. Owned by demand (scripts/simulate/stage.ts says how to write one).
 *
 * What it will do: HR, Procurement, the approver and the cost center owner clear each job request through POST /api/requisitions/[id]/approve.
 *
 * A stub until demand builds it: the run passes through and the
 * report names the owner. Replace the line below with `defineStage`.
 */
import { stub } from '../../stage'

export default stub('approve-jobs', 'DEMAND')
