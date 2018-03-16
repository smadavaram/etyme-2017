class Candidate::ContractsController < Candidate::BaseController

  def index
    @contracts = Contract.joins(:buy_contracts).where(buy_contracts: {candidate_id: current_candidate.id})
  end

end
