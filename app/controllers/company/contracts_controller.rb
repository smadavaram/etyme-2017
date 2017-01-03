class Company::ContractsController < Company::BaseController

  before_action :find_job              , only: [:create]
  before_action :find_receive_contract , only: [:open_contract , :update_contract_response]
  before_action :find_contract         , only: [:show , :update_attachable_doc , :change_invoice_date]
  before_action :set_contracts         , only: [:index]
  before_action :find_attachable_doc   , only: [:update_attachable_doc]

  add_breadcrumb "CONTRACTS", :contracts_path, options: { title: "CONTRACTS" }

  def index

  end

  def show

  end

  def new
    @contract = current_company.sent_contracts.new
    @contract.build_company
    @contract.build_job
    @contract.contract_terms.new

  end

  def create
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

  def update_attachable_doc
    if @attachable_doc.update_attributes(file: params[:attachable_doc][:file])
      flash[:success] = "File Uploaded."
    else
      flash[:errors] = @attachable_doc.errors.full_messages
    end
    redirect_to :back
  end

  def update_contract_response
    status = params[:status] == "reject" ? Contract.statuses["rejected"] : params[:status] == "accept" ? Contract.statuses["accepted"] : nil
    respond_to do |format|
      if @contract.pending?
        if @contract.update_attributes(update_contract_response_params.merge!(respond_by_id: current_user.id , responed_at: Time.zone.now , status: status))
          format.js{ flash.now[:success] = "successfully Submitted." }
        else
          format.js{ flash.now[:errors] =  @contract.errors.full_messages }
        end
      else
        format.js{ flash.now[:errors] =  ["Request Not Completed."]}
      end
    end
  end
  def change_invoice_date
    if @contract.update_attributes(next_invoice_date: params[:contract][:next_invoice_date])
      flash[:success] = "Next invoice date changed"
    else
      flash[:errors]  = @contract.errors.full_messages
    end
    redirect_to :back
  end

  private

  def find_contract
    @contract = Contract.find_sent_or_received(params[:id] || params[:contract_id]  , current_company).first || []
  end

  def find_attachable_doc
    @attachable_doc = @contract.attachable_docs.find_by_id(params[:attachable_doc][:id])
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
    params.require(:contract).permit([:job_id  , :is_commission ,
                                      :received_by_signature,:received_by_name,:sent_by_signature,:sent_by_name,
                                      :commission_type,:commission_amount , :max_commission , :commission_for_id ,
                                      :billing_frequency, :time_sheet_frequency, :assignee_id ,
                                      :job_application_id , :start_date , :end_date  , :message_from_hiring  ,:status ,company_doc_ids: [] ,
                                      contract_terms_attributes: [:id, :created_by, :contract_id , :status , :terms_condition ,:rate , :note , :_destroy],
                                     attachments_attributes:[:id,:file,:file_name,:file_size,:file_type,:attachable_type,:attachable_id,:_destroy]
                                     ])
  end

  def update_contract_response_params
    params.require(:contract).permit(:is_commission , :response_from_vendor , :received_by_signature,:received_by_name, :commission_type,:commission_amount , :max_commission , :commission_for_id, :assignee_id)
  end


end
