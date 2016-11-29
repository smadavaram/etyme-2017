class Company::ContractsController < Company::BaseController



  before_action :find_job
  before_action :find_contract

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

  private

    def find_contract
      # find_contract
    end

    def find_job
       @job = Job.find(params[:job_id])
    end



  def contract_params
    params.require(:contract).permit([:job_id  , :job_application_id , :start_date , :end_date , :terms_conditions , :message_from_hiring , :status , company_doc_ids: []])
  end


end
