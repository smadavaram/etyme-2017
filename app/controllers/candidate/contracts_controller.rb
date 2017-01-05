class Candidate::ContractsController < Candidate::BaseController
  before_action :set_contracts ,only: [:index]
  before_action :find_job              , only: [:show,:create,:open_contract]
  before_action :find_contract         , only: [:show,:open_contract, :update_contract_response]


  def index
  end

  def show
  end

  def open_contract
  end

  # POST candidate/jobs/:job_id/contracts/:id/update_contract_response?status= :value
  def update_contract_response
    status = params[:status] == "reject" ? 2 : params[:status] == "accept" ? 1 : nil
    respond_to do |format|
      if @contract.pending?
        if @contract.update_attributes(contract_params.merge!(respond_by_id: current_candidate.id , responed_at: Time.now , status: status))
          format.js{ flash[:success] = "successfully Submitted." }
        else
          format.js{ flash[:errors] =  @contract.errors.full_messages }
        end
      else
        format.js{ flash[:errors] =  ["Request Not Completed."]}
      end
    end
  end

  private

  def set_contracts
    @received_contracts = current_candidate.contracts.paginate(page: params[:page], per_page: 30)
  end
  def contract_params
    params.require(:contract).permit([:job_id  , :billing_frequency,
                                      :time_sheet_frequency, :job_application_id ,
                                      :response_from_vendor,
                                      :start_date , :end_date  , :message_from_hiring ,
                                      :received_by_signature,:received_by_name,:sent_by_signature,:sent_by_name,
                                      :status ,company_doc_ids: [] , contract_terms_attributes: [:id, :created_by, :contract_id , :status , :terms_condition ,:rate , :note , :_destroy]])
  end

  def find_contract
    # find_contract
    @contract = current_candidate.contracts.find_by_id(params[:id]) || []
  end
  def find_job
    @job = Job.active.is_public.where(id: params[:job_id])
  end

end
