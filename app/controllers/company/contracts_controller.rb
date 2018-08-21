class Company::ContractsController < Company::BaseController

  before_action :find_job              , only: [:create]
  before_action :find_receive_contract , only: [:open_contract , :update_contract_response , :create_sub_contract ]
  before_action :find_contract         , only: [:show , :download, :update_attachable_doc , :change_invoice_date,:update,:edit, :update_contract_status]
  before_action :set_contracts         , only: [:index]
  before_action :find_attachable_doc   , only: [:update_attachable_doc]
  before_action :authorize_user_for_new_contract  , only: :new
  before_action :authorize_user_for_edit_contract  , only: :edit
  before_action :authorized_user  , only: :show
  before_action :main_authorized_user  , only: :show


  add_breadcrumb "CONTRACTS", :contracts_path, options: { title: "CONTRACTS" }

  def index
    @contract_activity = PublicActivity::Activity.where(trackable: current_company.contracts).order('created_at DESC').paginate(page: params[:page], per_page: 15 )
    @buy_contracts = Contract.joins(:buy_contracts).where(buy_contracts: {candidate_id: current_company.id}).order('created_at DESC').paginate(page: params[:page], per_page: 15 )
  end

  def show
    add_breadcrumb "#{@contract.number}"
  end

  def download
    html = render_to_string( :layout => false)
    pdf = WickedPdf.new.pdf_from_string(html)
    send_data(pdf, :filename    => "#{@contract.title}.pdf", :type => "application/pdf", :disposition => 'attachment')
  end

  def new
    @contract = current_company.sent_contracts.new
    @contract.contract_terms.new
    @contract.sell_contracts.build
    @contract.buy_contracts.build
    # @contract.contract_sale_commisions.build

    @new_company = Company.new
    @candidate = Candidate.new
    @job = current_company.jobs.new
    @new_company.build_owner
    @new_company.build_invited_by
  end
  def edit

  end

  def update
    if @contract.update(contract_params)
      flash[:success] = "#{@contract.title.titleize} updated successfully"
    else
      flash[:errors] = @contract.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def create
    params[:contract][:company_id] = current_company.id
    @contract  = current_company.sent_contracts.new(create_contract_params)
    respond_to do |format|
      if @contract.save
        format.html {
          flash[:success] = "successfully Send."
          redirect_to contract_path(@contract)
        }
        format.js{ flash.now[:success] = "successfully Send." }
      else
        format.js{ flash.now[:errors] =  @contract.errors.full_messages }
        format.html{ flash[:errors] =  @contract.errors.full_messages
        redirect_back fallback_location: root_path
        }
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
    redirect_back fallback_location: root_path
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
    redirect_back fallback_location: root_path
  end

  def authorize_user_for_new_contract
    has_access?("create_new_contracts") || has_access?("manage_job_applications")
  end

  def authorize_user_for_edit_contract
    has_access?("edit_contracts_terms")
  end

  def authorized_user
    has_access?("show_contracts_details")
    end

  def main_authorized_user
    has_access?("manage_contracts")
  end

  def create_sub_contract
    @job = Job.find_or_create_sub_job(current_company, current_user , @contract.job)
    @sub_contract      = current_company.sent_contracts.new(parent_contract_id: @contract.id , billing_frequency: @contract.billing_frequency , time_sheet_frequency: @contract.time_sheet_frequency, job_id: @job.id , start_date: @contract.start_date , end_date: @contract.end_date)
    @sub_contract.contract_terms.new(rate: @contract.rate , terms_condition: @contract.terms_and_conditions )
  end

  def tree_view
    @contract = Contract.where(number: params[:id]).first
    unless @contract.present?
      redirect_back fallback_location: root_path
    end
  end

  def received_contract
    contract = Contract.find(params[:id])
    @contract = contract.dup
    @contract.sell_contracts = contract.sell_contracts
    @contract.buy_contracts = contract.buy_contracts

    @new_company = Company.new
    @candidate = Candidate.new
    @job = current_company.jobs.new
    @new_company.build_owner
    @new_company.build_invited_by

    render 'new'
  end

  def set_job_application
    @job=Job.find(params[:job_id])
    @candidates = Candidate.all
    @preferred_vendors_companies = Company.vendors - [current_company] || []
  end

  def update_contract_status
    @contract.update(status: params[:status])
    redirect_back fallback_location: root_path
  end


  def timeline
    @contracts = current_company.contracts
    @candidates = current_company.candidates.uniq
    @todo_contract_cycles = current_company.contract_cycles.where(status: 'pending').where('DATE(contract_cycles.end_date) BETWEEN ? AND ?', Date.today, 11.days.from_now.to_date).order(start_date: :asc)
    @completed_contract_cycles = current_company.contract_cycles.where(status: 'completed').order(id: :asc)
    @overdue_contract_cycles = current_company.contract_cycles.where(status: 'pending').where("DATE(contract_cycles.end_date) < ?", DateTime.now.end_of_day.to_date).order(start_date: :desc)
  end

  def filter_timeline
    @contract = current_company.contracts.filter(params.slice(:candidate, :contract))
    @candidates = current_company.candidates.uniq
  end


  private

  def find_contract
    @contract = Contract.find(params[:id] || params[:contract_id]) #  , current_company).first || []
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
    @received_search   = current_company.received_contracts.includes(job: [:company , :created_by]).search(params[:q]) || []
    @received_contracts= @received_search.result.paginate(page: params[:page], per_page: 30) || []
    @sent_search       = current_company.sent_contracts.includes(job: [:created_by]).search(params[:q]) || []
    @sent_contracts    = @sent_search.result.paginate(page: params[:page], per_page: 30) || []
  end

  def contract_params
      params.require(:contract).permit(
          [:job_id, :client_id, :candidate_id, :is_commission, :contract_type, :client_name, :client_name,
           :company_name, :work_location, :received_by_signature,:received_by_name, :sent_by_signature,:sent_by_name,
           :company_address, :company_website, :fed_id, :commission_type,:commission_amount, :max_commission,
           :commission_for_id, :candidate_name, :customer_rate, :time_sheet_frequency, :invoice_terms_period,
           :show_accounting_to_employee, :billing_frequency, :time_sheet_frequency, :assignee_id, :contractable_id ,
           :contractable_type, :job_application_id, :parent_contract_id, :start_date ,
           :payment_term, :b_time_sheet, :payrate, :contract_type, :end_date,
           :message_from_hiring, :status, :company_id, company_doc_ids: [],
           sell_contracts_attributes: [
               :expected_hour, 
               :company_id, :customer_rate, :customer_rate_type, :invoice_terms_period,
               :show_accounting_to_employee, :first_date_of_timesheet,
               :payment_term, :invoice_day_of_week, :invoice_end_of_month, :invoice_date_2, :invoice_date_1,
               :time_sheet, :ts_day_of_week, :ts_date_1, :ts_date_2, :ts_end_of_month,
               :ts_approve, :ta_day_of_week, :ta_date_1, :ta_date_2, :ta_end_of_month,
               :cr_start_date, :cr_end_date, :first_date_of_invoice,
               :ts_day_time, :ta_day_time, :invoice_day_time,
               contract_sell_business_details_attributes: [
                   :id, :company_contact_id, :_destroy
               ],
               sell_send_documents_attributes: [:id, :doc_file, :file_name, :file_size, :file_type, :when_expire, :is_sign_required, :creatable_type,
                                                :creatable_id, :_destroy,
                                                document_signs_attributes: [
                                                    :id, :signable_type, :signable_id, :_destroy
                                                ]
               ],
               sell_request_documents_attributes: [:id, :doc_file, :file_name, :file_size, :file_type, :when_expire, :is_sign_required, :creatable_type,
                                                   :creatable_id,:_destroy,
                                                   document_signs_attributes: [:id, :signable_type, :signable_id, :_destroy] ]
                                      ],
           buy_contracts_attributes: [
               :candidate_id, :ssn, :contract_type, :payrate, :payrate_type,
               :payment_term, :show_accounting_to_employee, :first_date_of_timesheet,
               :time_sheet, :ts_day_of_week, :ts_date_1, :ts_date_2, :ts_end_of_month,
               :ts_approve, :ta_day_of_week, :ta_date_1, :ta_date_2, :ta_end_of_month,
               :salary_calculation, :sc_day_of_week, :sc_date_1, :sc_date_2, :sc_end_of_month,
               :commission_payment_term, :pr_start_date, :pr_end_date,
               :first_date_of_invoice, :company_id, :uscis_rate,
               :ts_day_time, :ta_day_time, :sc_day_time, :payroll_date,
               :invoice_recepit, :ir_day_time, :ir_date_1, :ir_date_2, :ir_end_of_month, :ir_day_of_week,
               contract_buy_business_details_attributes: [
                   :id, :company_contact_id, :_destroy
               ],
               contract_sale_commisions_attributes: [
                   :id, :name, :rate, :frequency, :limit, :_destroy,
                   csc_accounts_attributes: [
                       :id, :accountable_type, :accountable_id, :_destroy
                   ]
               ],
               buy_send_documents_attributes: [
                   :id, :doc_file, :file_name, :file_size, :file_type, :when_expire, :is_sign_required, :creatable_type,
                                               :creatable_id,:_destroy,
                                              document_signs_attributes: [
                                                  :id, :signable_type, :signable_id, :_destroy
                                              ]
               ],
               buy_emp_req_docs_attributes: [
                   :id, :doc_file, :file_name, :file_size, :file_type, :when_expire, :is_sign_required, :creatable_type, :creatable_id,:_destroy,
                                            document_signs_attributes: [
                                                :id, :signable_type, :signable_id, :_destroy
                                            ]
               ],
               buy_ven_req_docs_attributes: [
                   :id, :doc_file, :file_name, :file_size, :file_type, :when_expire, :is_sign_required, :creatable_type, :creatable_id,:_destroy,
                                            document_signs_attributes: [
                                                :id, :signable_type, :signable_id, :_destroy
                                            ]
               ]
           ],
           contract_terms_attributes: [
               :id, :created_by, :contract_id, :status, :terms_condition, :rate, :note, :_destroy
           ],
           attachments_attributes:[
               :id,:file, :file_name,:file_size, :company_id ,:file_type,:attachable_type, :attachable_id, :_destroy
           ]
          ])
  end

  def create_contract_params
    if @job.present? && params.has_key?(:job_id)
      contract_params.merge!(job_id: @job.id , created_by_id: current_user.id)
    else
      contract_params.merge!(respond_by_id: current_user.id, created_by_id: current_user.id)
    end
  end

  def update_contract_response_params
    params.require(:contract).permit(:is_commission , :response_from_vendor , :received_by_signature,:received_by_name, :commission_type,:commission_amount , :max_commission , :commission_for_id, :assignee_id)
  end

end
