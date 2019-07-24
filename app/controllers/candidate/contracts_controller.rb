class Candidate::ContractsController < Candidate::BaseController
  before_action :set_contract, only: [:show]
  add_breadcrumb "Home",'/candidate'
  def index
    add_breadcrumb "HR-Contract", candidate_contracts_path
    @contracts = Contract.where(candidate: current_candidate)
  end

  def show
    add_breadcrumb "HR-Contract", candidate_contracts_path
    add_breadcrumb @contract.project_name, candidate_contract_path(@contract)
  end


  private
  def set_contract
    @contract = Contract.find_by_id(params[:id])
  end

end
