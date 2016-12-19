class Company::ContractsController < Company::BaseController

  before_action :find_job              , only: [:show,:create]
  before_action :find_receive_contract , only: [:open_contract , :update_contract_response]
  before_action :find_contract         , only: [:show]
  before_action :set_contracts         , only: [:index]

  def index

  end

  def show

  end

  def new

  end

  # POST company/job/:job_id/job_invitation/:job_invitation_id/job_application/:job_application_id/create
  def create
    # @contract  = @job.contracts.new(contract_params.merge!(created_by_id: current_user.id))
    @contract  = current_company.sent_contracts.new(contract_params.merge!(job_id: @job.id , created_by_id: current_user.id))
    respond_to do |format|
      if @contract.save
        format.js{ flash[:success] = "successfully Send." }
      else
        format.js{ flash[:errors] =  @contract.errors.full_messages }
      end
    end
  end

  # POST company/jobs/:job_id/contracts/:id/open_contract?status= :value
  def open_contract
  end

  # POST company/jobs/:job_id/contracts/:id/update_contract_response?status= :value
  def update_contract_response
    status = params[:status] == "reject" ? 2 : params[:status] == "accept" ? 1 : nil
    respond_to do |format|
      if @contract.pending?
        if @contract.update_attributes(response_from_vendor: params[:contract][:response_from_vendor] ,respond_by_id: current_user.id , responed_at: Time.now , status: status)
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

  def find_contract
    # find_contract
    @contract = @job.contracts.find_by_id(params[:id]) || []
  end

  def find_receive_contract
    @contract   = current_company.received_contracts.where(id: params[:id]).first || []
  end

  def find_job
    @job = current_company.jobs.find_by_id(params[:job_id])
  end

  def set_contracts
    @received_contracts   = current_company.received_contracts.paginate(page: params[:page], per_page: 30) || []
    @sent_contracts       = current_company.sent_contracts.paginate(page: params[:page], per_page: 30) || []
  end

  def contract_params
    params.require(:contract).permit([:job_id  , :billing_frequency, :time_sheet_frequency,
                                      :job_application_id , :start_date , :end_date  , :message_from_hiring  ,:status ,company_doc_ids: [] ,
                                      contract_terms_attributes: [:id, :created_by, :contract_id , :status , :terms_condition ,:rate , :note , :_destroy]])
  end


end
