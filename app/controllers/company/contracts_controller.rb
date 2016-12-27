class Company::ContractsController < Company::BaseController

  before_action :find_job              , only: [:create]
  before_action :find_receive_contract , only: [:open_contract , :update_contract_response]
  before_action :find_contract         , only: [:show]
  before_action :set_contracts         , only: [:index]

  def index

  end

  def show

  end

  def new

  end

  def create
    # @contract  = @job.contracts.new(contract_params.merge!(created_by_id: current_user.id))
    @contract  = current_company.sent_contracts.new(contract_params.merge!(job_id: @job.id , created_by_id: current_user.id))
    respond_to do |format|
      if @contract.save
        format.js{ flash.now[:success] = "successfully Send." }
      else
        format.js{ flash.now[:errors] =  @contract.errors.full_messages }
      end
    end
  end

  def open_contract
  end

  def update_contract_response
    status = params[:status] == "reject" ? Contract.statuses["rejected"] : params[:status] == "accept" ? Contract.statuses["accepted"] : nil
    respond_to do |format|
      if @contract.pending?
        if @contract.update_attributes(assignee_id: params[:contract][:assignee_id] ,response_from_vendor: params[:contract][:response_from_vendor] ,respond_by_id: current_user.id , responed_at: Time.now , status: status)
          format.js{ flash.now[:success] = "successfully Submitted." }
        else
          format.js{ flash.now[:errors] =  @contract.errors.full_messages }
        end
      else
        format.js{ flash.now[:errors] =  ["Request Not Completed."]}
      end
    end
  end

  private

  def find_contract
    @contract = current_company.received_contracts.find(params[:id]) || []
    # @contract = current_company.sent_contracts.find(params[:id]) || []
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
    params.require(:contract).permit([:job_id  , :is_commission , :commission_type , :commission_amount , :max_commission , :commission_for_id , :billing_frequency, :time_sheet_frequency, :assignee_id ,
                                      :job_application_id , :start_date , :end_date  , :message_from_hiring  ,:status ,company_doc_ids: [] ,
                                      contract_terms_attributes: [:id, :created_by, :contract_id , :status , :terms_condition ,:rate , :note , :_destroy],
                                     attachments_attributes:[:id,:file,:file_name,:file_size,:file_type,:attachable_type,:attachable_id,:_destroy]])
  end


end
