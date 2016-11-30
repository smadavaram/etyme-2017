class Company::ContractsController < Company::BaseController



  before_action :find_job      , only: [ :create , :accept_contract , :reject_contract]
  before_action :find_contract , only: [:create , :accept_contract , :reject_contract]
  before_action :set_contracts , only: [:index]

  def index

  end

  def new

  end

  # POST company/job/:job_id/job_invitation/:job_invitation_id/job_application/:job_application_id/create
  def create
    @contract  = @job.contracts.new(contract_params.merge!(created_by_id: current_user.id))
    respond_to do |format|
      if @contract.save
        format.js{ flash[:success] = "successfully Send." }
      else
        format.js{ flash[:errors] =  @contract.errors.full_messages }
      end
    end
  end

  # POST company/jobs/:job_id/contracts/:id/accept_contract
  def accept_contract
    respond_to do |format|
      if @contract.is_pending?
        if @contract.update_attributes(responed_by_id: current_user.id , responed_at: Time.now , status: 1 )
          format.js{ flash[:success] = "successfully Accepted." }
        else
          format.js{ flash[:errors] =  @contract.errors.full_messages }
        end
      else
        format.js{ flash[:errors] =  ["Request Not Completed."]}
      end

    end

  end

  # POST company/jobs/:job_id/contracts/:id/reject_contract
  def reject_contract
    respond_to do |format|
      if @contract.is_pending?
        if @contract.update_attributes(responed_by_id: current_user.id , responed_at: Time.now , status: 2 )
          format.js{ flash[:success] = "successfully Rejected." }
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

    def find_job
       @job = Job.find_by_id(params[:job_id])
    end

    def set_contracts
      @received_contracts   = current_company.received_contracts.paginate(page: params[:page], per_page: 30) || []
      @send_contracts       = current_company.contracts.paginate(page: params[:page], per_page: 30) || []
    end



  def contract_params
    params.require(:contract).permit([:job_id  , :job_application_id , :start_date , :end_date , :terms_conditions , :message_from_hiring , :status , company_doc_ids: []])
  end


end
