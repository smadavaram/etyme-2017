class Candidate::ContractsController < Candidate::BaseController
  before_action :set_contracts ,only: [:index]
  before_action :find_contract         , only: [:show,:open_contract]


  def index
  end

  def show
  end

  private

  def set_contracts
    @received_contracts=current_candidate.contracts.paginate(page: params[:page], per_page: 30)
  end
  def contract_params
    params.require(:contract).permit([:job_id  , :billing_frequency, :time_sheet_frequency, :job_application_id , :start_date , :end_date  , :message_from_hiring  ,:status ,company_doc_ids: [] , contract_terms_attributes: [:id, :created_by, :contract_id , :status , :terms_condition ,:rate , :note , :_destroy]])
  end

  def find_contract
    # find_contract
    @contract = @job.contracts.find_by_id(params[:id]) || []
  end

end
