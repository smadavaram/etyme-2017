class Candidate::ContractsController < Candidate::BaseController
  before_action :set_contract, only: [:show]
  add_breadcrumb "Home",'/candidate'
  def index
    add_breadcrumb "HR-Contract", candidate_contracts_path
    @contracts = Contract.where.not(status: :draft).where(candidate: current_candidate)
  end

  def show
    if @contract
      add_breadcrumb "HR-Contract", candidate_contracts_path
      add_breadcrumb @contract.project_name, candidate_contract_path(@contract)
    else
      flash[:errors] = ['Contract Does not exists or destroyed']
      redirect_to candidate_contracts_path
    end
  end


  private
  def set_contract
    @contract = Contract.where.not(status: :draft).find_by_id(params[:id])
  end

end
