class Company::ContractsController < Company::BaseController

  before_action :find_job, only: [:create]
  before_action :find_receive_contract, only: [:open_contract, :update_contract_response, :create_sub_contract]
  before_action :find_contract, only: [:company_sell_contract, :company_buy_contract, :show, :generate_cycles, :download, :update_attachable_doc, :change_invoice_date, :update, :edit, :update_contract_status, :extend_contract]
  before_action :set_contracts, only: [:index]
  before_action :find_attachable_doc, only: [:update_attachable_doc]
  before_action :authorize_user_for_new_contract, only: :new
  before_action :authorize_user_for_edit_contract, only: :edit
  before_action :get_sell_contract, only: [:submit_document_create, :create_document_request]
  before_action :get_buy_contract, only: [:buy_document_create, :buy_emp_doc_create, :buy_ven_doc_create]
  before_action :authorized_user, only: :show
  before_action :main_authorized_user, only: :show

  add_breadcrumb "Dashboard", :dashboard_path
  add_breadcrumb "CONTRACTS", :contracts_path, options: {title: "CONTRACTS"}, :except => %w(add_expense add_bill add_invoice bank_reconciliation receive_payment salary_settlement salary_process)
  add_breadcrumb "Expenses", :add_expense_contracts_path, only: %w(add_expense)
  add_breadcrumb "Cient Expense Bill / Vendor Bill", :add_bill_contracts_path, only: %w(add_bill)
  add_breadcrumb "Add Invoice", :add_invoice_contracts_path, only: %w(add_invoice)
  add_breadcrumb 'Bank reconciliation', :bank_reconciliation_contracts_path, only: %w(bank_reconciliation)
  include Company::ChangeRatesHelper

  def company_sell_contract
    add_breadcrumb "Company sell contract"
    @signature_documents = @contract.send("sell_contract").document_signs.where(documentable: @contract.company.company_candidate_docs.where(is_require: "signature").ids)
    @request_documents = @contract.send("sell_contract").document_signs.where(documentable: @contract.company.company_candidate_docs.where(is_require: "Document").ids)
  end

  def company_buy_contract
    @candidate_signature_documents = @contract.send("buy_contract").document_signs.where(signable: @contract.buy_contract.contract.candidate, documentable: current_company.company_candidate_docs.where(is_require: "signature").ids)
    @vendor_signature_documents = @contract.buy_contract.company.present? ? @contract.send("buy_contract").document_signs.where(signable: @contract.buy_contract.company.owner, documentable: current_company.company_candidate_docs.where(is_require: "signature").ids) : []
    @candidate_request_documents = @contract.send("buy_contract").document_signs.where(signable: @contract.buy_contract.contract.candidate, documentable: current_company.company_candidate_docs.where(is_require: "Document").ids)
  end

  def index
    @contract_activity = PublicActivity::Activity.where(trackable: current_company.contracts).order('created_at DESC').paginate(page: 1, per_page: 15)
    @buy_contracts = Contract.joins(:sell_contract).where(sell_contracts: {company_id: current_company.id}).where.not(company: current_company).order('created_at DESC').paginate(page: 1, per_page: 15)
    @sell_contracts = Contract.joins(:sell_contract).where(company: current_company).order('created_at DESC').paginate(page: 1, per_page: 15)
    @sent_contracts = @sent_search.result.paginate(page: 1, per_page: 15) || []
    if params[:page]
      @contract_activity = PublicActivity::Activity.where(trackable: current_company.contracts).order('created_at DESC').paginate(page: params[:page], per_page: 15) if params[:tab] == "activity"
      @sent_contracts = @sent_search.result.paginate(page: params[:page], per_page: 15) || [] if params[:tab] == "contract_table"
      @buy_contracts = Contract.joins(:sell_contract).where(sell_contracts: {company_id: current_company.id}).where.not(company: current_company).order('created_at DESC').paginate(page: params[:page], per_page: 15) if params[:tab] == "buy_contract"
      @sell_contracts = Contract.joins(:sell_contract).where(company: current_company).order('created_at DESC').paginate(page: params[:page], per_page: 15) if params[:tab] == "sell_contract"
    end
  end

  def show
    add_breadcrumb "#{@contract.number}"
    if @contract.sell_contract
      @signature_documents = @contract.send("sell_contract").document_signs.where(documentable: CompanyCandidateDoc.where(is_require: "signature").ids)
      @request_documents = @contract.send("sell_contract").document_signs.where(documentable: CompanyCandidateDoc.where(is_require: "Document").ids)
    end
    if @contract.buy_contract
      @candidate_signature_documents = @contract.send("buy_contract").document_signs.where(signable: @contract.buy_contract.contract.candidate, documentable: CompanyCandidateDoc.where(is_require: "signature").ids)
      @vendor_signature_documents = @contract.buy_contract.company.present? ? @contract.send("buy_contract").document_signs.where(signable: @contract.buy_contract.company.owner, documentable: CompanyCandidateDoc.where(is_require: "signature").ids) : []
      @candidate_request_documents = @contract.send("buy_contract").document_signs.where(signable: @contract.buy_contract.contract.candidate, documentable: CompanyCandidateDoc.where(is_require: "Document").ids)
    end
  end

  def add_approval
    @approval = Approval.find_or_initialize_by(approval_params.merge(company_id: current_company.id))
    @approvals = current_company.approvals.where(contractable_type: approval_params[:contractable_type],
                                                 contractable_id: approval_params[:contractable_id],
                                                 approvable_type: approval_params[:approvable_type])
    if @approval.save
      flash.now[:success] = "Collaborator Added"
      render 'add_approval'
    else
      flash.now[:errors] = @approval.errors.full_messages
    end
  end

  def download
    html = render_to_string(:layout => false)
    pdf = WickedPdf.new.pdf_from_string(html)
    send_data(pdf, :filename => "#{@contract.title}.pdf", :type => "application/pdf", :disposition => 'attachment')
  end

  def new
    add_breadcrumb "New"

    unless params[:contract_id].present?
      @contract = current_company.sent_contracts.new
      @contract.contract_terms.new
      @contract.build_sell_contract
      @contract.build_buy_contract
      # @contract.contract_sale_commisions.build
    else
      find_contract
      @have_admin = @contract.sell_contract ? @contract.sell_contract.contract_sell_business_details.admin.count != 0 : false
      @contract_have_admin = @contract.contract_admins.present? ? @contract.contract_admins.admin.count != 0 : false
    end
    @company = Company.new
    @candidate = Candidate.new
    @job = current_company.jobs.new
    @company.build_owner
    @company.build_invited_by
  end

  def buy_document_create
    @company_candidate_docs = current_company.company_candidate_docs.where(id: params[:ids])
    @plugin = current_company.plugins.docusign.first
    response = (Time.current - @plugin.updated_at).to_i.abs / 3600 <= 5 ? true : RefreshToken.new(@plugin).refresh_docusign_token
    if response.present?
      @company_candidate_docs.each do |sign_doc|
        @document_sign = current_company.document_signs.create(requested_by: current_user, documentable: sign_doc, signable: @buy_contract.contract.candidate, is_sign_done: false, part_of: @buy_contract, signers_ids: params[:signers].to_s.gsub('[', '{').gsub(']', '}'))
        result = DocusignEnvelope.new(@document_sign, @plugin).create_envelope
        if (!result.is_a?(Hash) and result.status == "sent")
          @document_sign.update(envelope_id: result.envelope_id, envelope_uri: result.uri)
          flash.now[:success] = 'Document is submitted to the candidate for signature'
        else
          error = eval(result[:error_message])
          @document_sign.destroy
          flash.now[:errors] = ["#{error[:errorCode]}: #{error[:message]}"]
        end
      end
    else
      flash.now[:errors] = ["Docusign token request failed, please regenerate the token from integrations"]
    end
    @document_signs = @buy_contract.document_signs.where(signable: @buy_contract.contract.candidate, documentable: current_company.company_candidate_docs.where(is_require: "signature").ids)
  end

  def buy_emp_doc_create
    @company_candidate_docs = current_company.company_candidate_docs.where(id: params[:ids])
    @company_candidate_docs.each do |sign_doc|
      current_company.document_signs.create(requested_by: current_user, documentable: sign_doc, signable: @buy_contract.contract.candidate, is_sign_done: false, part_of: @buy_contract, signers_ids: params[:signers].to_s.gsub('[', '{').gsub(']', '}'))
    end
    flash.now[:success] = 'Document(s) submission request is submitted to the Company'
    @document_signs = @buy_contract.document_signs.where(signable: @buy_contract.contract.candidate, documentable: current_company.company_candidate_docs.where(is_require: "Document").ids)
  end

  def buy_ven_doc_create
    @company_candidate_docs = current_company.company_candidate_docs.where(id: params[:ids])
    @plugin = current_company.plugins.docusign.first
    response = (Time.current - @plugin.updated_at).to_i.abs / 3600 <= 5 ? true : RefreshToken.new(@plugin).refresh_docusign_token
    if response.present?
      @company_candidate_docs.each do |sign_doc|
        @document_sign = current_company.document_signs.create(requested_by: current_user, documentable: sign_doc, signable: @buy_contract.company.owner, is_sign_done: false, part_of: @buy_contract, signers_ids: params[:signers].to_s.gsub('[', '{').gsub(']', '}'))
        result = DocusignEnvelope.new(@document_sign, @plugin).create_envelope
        if (!result.is_a?(Hash) and result.status == "sent")
          @document_sign.update(envelope_id: result.envelope_id, envelope_uri: result.uri)
          flash.now[:success] = 'Document is submitted to the candidate for signature'
        else
          @document_sign.destroy
          error = eval(result[:error_message])
          flash.now[:errors] = ["#{error[:errorCode]}: #{error[:message]}"]
        end
      end
    else
      flash.now[:errors] = ["Docusign token request failed, please regenerate the token from integrations"]
    end
    @document_signs = @buy_contract.document_signs.where(signable: @buy_contract.company.owner, documentable: current_company.company_candidate_docs.where(is_require: "signature").ids)
  end

  def submit_document_create
    @company_candidate_docs = current_company.company_candidate_docs.where(id: params[:ids])
    @plugin = current_company.plugins.docusign.first
    response = (Time.current - @plugin.updated_at).to_i.abs / 3600 <= 5 ? true : RefreshToken.new(@plugin).refresh_docusign_token
    if response.present?
      @company_candidate_docs.each do |sign_doc|
        @document_sign = current_company.document_signs.create(requested_by: current_user, documentable: sign_doc, signable: @sell_contract.team_admin, is_sign_done: false, part_of: @sell_contract, signers_ids: params[:signers].to_s.gsub('[', '{').gsub(']', '}'))
        result = DocusignEnvelope.new(@document_sign, @plugin).create_envelope
        if (!result.is_a?(Hash) and result.status == "sent")
          @document_sign.update(envelope_id: result.envelope_id, envelope_uri: result.uri)
          flash.now[:success] = 'Document is submitted to the Company for signature'
        else
          @document_sign.destroy
          error = eval(result[:error_message])
          flash.now[:errors] = ["#{error[:errorCode]}: #{error[:message]}"]
        end
      end
    else
      flash.now[:errors] = ["Docusign token request failed, please regenerate the token from integrations"]
    end
    @document_signs = @sell_contract.document_signs.where(documentable: current_company.company_candidate_docs.where(is_require: "signature").ids)
  end

  def create_document_request
    @company_candidate_docs = current_company.company_candidate_docs.where(id: params[:ids])
    @company_candidate_docs.each do |sign_doc|
      current_company.document_signs.create(requested_by: current_user, documentable: sign_doc, signable: @sell_contract.team_admin, is_sign_done: false, part_of: @sell_contract)
    end
    flash.now[:success] = 'Document(s) submission request is submitted to the Company'
    @document_signs = @sell_contract.document_signs.where(documentable: current_company.company_candidate_docs.where(is_require: "Document").ids)
  end

  def edit

  end


  def update
    @tab_number = params[:tab].to_i
    set_docusign_documents
    respond_to do |format|
      if @contract.update(contract_params)
        @have_admin = @contract.sell_contract ? @contract.sell_contract.contract_sell_business_details.admin.count != 0 : false
        @contract_have_admin = @contract.contract_admins.present? ? @contract.sell_contract.contract_admins.admin.count != 0 : false
        @sell_contract_have_admin = @contract.sell_contract.contract_admins.present? ? @contract.sell_contract.contract_admins.admin.count != 0 : false
        @sell_contract = @contract.sell_contract
        params[:contract][:reporting_manager_ids]&.each do |id|
          @contract.sell_contract.contract_sell_business_details.find_or_create_by(user_id: id)
        end

        params[:contract][:hr_admins_ids]&.each do |id|
          if params[:tab].to_i ==2
            @contract.contract_admins.create(user_id:id,company_id:current_company.id,contract_id:@contract.id)
          elsif params[:tab].to_i == 3
            @contract.sell_contract.contract_admins.create(user_id: id, contract_id: @contract.id,company_id: @contract.sell_contract.company.id)
          end
        end
        create_custom_activity(@contract, 'contracts.update', contract_params, @contract)
        format.html {
          flash[:success] = "#{@contract.title.titleize} updated successfully"
          edirect_back fallback_location: root_path
        }
        format.js {
          if @contract.pending?
            @contract.set_next_invoice_date if @contract.sell_contract
            @contract.create_rate_change
            @contract.notify_recipient if @contract.not_system_generated? and @contract.candidate
            @contract.buy_contract&.set_first_timesheet_date
            @contract.buy_contract&.set_salary_frequency
            @contract.buy_contract&.set_candidate
          end
          flash.now[:success] = 'Contract Updated Successfully'
          render 'create.js'
        }
      else
        format.html {
          flash[:errors] = @contract.errors.full_messages
          edirect_back fallback_location: root_path
        }
        format.js {
          flash.now[:errors] = @contract.errors.full_messages
          render 'create.js'
        }
      end
    end
  end

  def create
    params[:contract][:company_id] = current_company.id
    @contract = current_company.sent_contracts.new(create_contract_params)
    @tab_number = params[:tab].to_i
    @contract.status = :draft
    @signature_templates = current_company.customer_contract_templates("signature")
    @documents_templates = current_company.customer_contract_templates("Document")
    @sell_contract = @contract.sell_contract

    if @contract.sell_contract
      @signature_documents = @contract.send("sell_contract").document_signs.where(part_of: @contract.sell_contract, signable: @contract.sell_contract.company.owner, documentable: @signature_templates.ids)
      @request_documents = @contract.send("sell_contract").document_signs.where(part_of: @contract.sell_contract, signable: @contract.sell_contract.company.owner, documentable: @documents_templates.ids)
    end

    respond_to do |format|
      if @contract.save
        if @contract.sell_contract
          params[:contract][:reporting_manager_ids]&.each do |id|
            @contract.sell_contract.contract_sell_business_details.find_or_create_by(user_id: id)
          end
        end
        params[:contract][:hr_admins_ids]&.each do |id|
          if params[:tab].to_i ==2
            @contract.contract_admins.create(user_id:id,company_id:current_company.id,contract_id:@contract.id)
          elsif params[:tab].to_i == 3
            @contract.sell_contract.contract_admins.create(user_id: id, contract_id: @contract.id,company_id: @contract.sell_contract.company.id)
          end
        end
        create_custom_activity(@contract, 'contracts.create', create_contract_params, @contract)
        format.html {
          flash[:success] = "successfully Send."
          redirect_to contract_path(@contract)
        }
        format.js {
          flash.now[:success] = "successfully Send."
        }
      else
        format.js { flash.now[:errors] = @contract.errors.full_messages }
        format.html { flash[:errors] = @contract.errors.full_messages
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
        if @contract.update_attributes(update_contract_response_params.merge!(respond_by_id: current_user.id, responed_at: Time.zone.now, status: status))
          create_custom_activity(@contract, 'contracts.update',
                                 update_contract_response_params.merge!(respond_by_id: current_user.id,
                                                                        responed_at: Time.zone.now,
                                                                        status: status),
                                 @contract)
          format.js { flash.now[:success] = "successfully Submitted." }
        else
          format.js { flash.now[:errors] = @contract.errors.full_messages }
        end
      else
        format.js { flash.now[:errors] = ["Request Not Completed."] }
      end
    end
  end

  def change_invoice_date
    if @contract.update_attributes(next_invoice_date: params[:contract][:next_invoice_date])
      create_custom_activity(@contract, 'contracts.update', {next_invoice_date: params[:contract][:next_invoice_date]}, @contract)
      flash[:success] = "Next invoice date changed"
    else
      flash[:errors] = @contract.errors.full_messages
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
    @job = Job.find_or_create_sub_job(current_company, current_user, @contract.job)
    @sub_contract = current_company.sent_contracts.new(parent_contract_id: @contract.id, billing_frequency: @contract.billing_frequency, time_sheet_frequency: @contract.time_sheet_frequency, job_id: @job.id, start_date: @contract.start_date, end_date: @contract.end_date)
    @sub_contract.contract_terms.new(rate: @contract.rate, terms_condition: @contract.terms_and_conditions)
  end

  def tree_view
    add_breadcrumb "#{params[:id]} tree-view"

    @contract = Contract.where(number: params[:id]).first
    unless @contract.present?
      redirect_back fallback_location: root_path
    end
  end

  def received_contract
    contract = Contract.find(params[:id])
    @contract = contract.dup
    @contract.sell_contracts = contract.sell_contract
    @contract.buy_contracts = contract.buy_contract

    @company = Company.new
    @candidate = Candidate.new
    @job = current_company.jobs.new
    @company.build_owner
    @company.build_invited_by

    render 'new'
  end

  def set_job_application
    @job = Job.find(params[:job_id])
    @candidates = Candidate.all
    @preferred_vendors_companies = Company.vendors - [current_company] || []
  end

  def update_contract_status
    if @contract.update(status: params[:status])
      create_custom_activity(@contract, 'contracts.update', {status: params[:status]}, @contract)
      #TODO: enable it if cycles should be generated when contract is in progress
      # @contract.create_cycles if @contract.in_progress?
      redirect_to contract_path(@contract)
    end
  end

  def generate_cycles
    if @contract.remaining?
      if GenerateContractCyclesJob.perform_now(@contract)
        flash[:success] = "Your request has been queued, will be processed momentarily"
      else
        flash[:errors] = @contract.errors.full_messages << "Errors while processing request"
      end
    else
      flash[:errors] = @contract.errors.full_messages << "Contract Cycles are already been generated or in processing queue"
    end
    redirect_to contract_path(@contract)
  end

  def timeline
    add_breadcrumb "timeline"

    @contracts = current_company.contracts.includes(:job).where.not(status: "pending")
    @candidates = Candidate.where(id: @contracts.pluck(:candidate_id).uniq)
    filter_timeline
  end

  def filter_timeline
    @contract = if params[:contract_id]
                  Contract.find_by(id: params[:contract_id])
                else
                  @contracts.present? ?
                      @contracts.first :
                      current_company.contracts.where.not(status: "pending").first
                end
    @contract_cycles = ContractCycle.includes(:ts_submitteds, :candidate, contract: [:sell_contract, :buy_contract, :company])
                           .where(params[:candidate_id].present? ?
                                      {contract: current_company.contracts.where(candidate_id: params[:candidate_id])} :
                                      {contract: @contract})
                           .where(contract: @contract).cycle_type(params[:note])
  end

  def get_cyclable
    @cyclable = params[:cyclable_type].constantize.find_by(id: params[:cyclable_id])
  end

  def set_commission_user
  end

  def add_bill
  end

  def add_invoice
  end

  def pay_bill
  end

  def receive_payment
  end

  def salary_settlement
  end

  def salary_process
  end

  def client_expense_submit
    @dates = Time.now - 1.month
    @time_cycle = [((@dates.beginning_of_week - 1.day).strftime("%m/%d/%Y") + " - " + (@dates.end_of_week - 1.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week).strftime("%m/%d/%Y") + " - " + (@dates.end_of_week + 6.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 7.day).strftime("%m/%d/%Y") + " - " + (@dates.end_of_week + 13.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 14.day).strftime("%m/%d/%Y") + " - " + (@dates.end_of_week + 20.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 21.day).strftime("%m/%d/%Y") + " - " + (@dates.end_of_week + 27.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 28.day).strftime("%m/%d/%Y") + " - " + (@dates.end_of_week + 34.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 35.day).strftime("%m/%d/%Y") + " - " + (@dates.end_of_week + 41.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 42.day).strftime("%m/%d/%Y") + " - " + (@dates.end_of_week + 48.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 49.day).strftime("%m/%d/%Y") + " - " + (@dates.end_of_week + 55.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 56.day).strftime("%m/%d/%Y") + " - " + (@dates.end_of_week + 62.day).strftime("%m/%d/%Y"))]

  end
  def change_admin_status
    @status = params[:status]
    @tab = params[:tab]
    @contract = Contract.find(params[:contract_id])
    @contract_admin = ContractAdmin.find(params[:contract_admin])
    @contract_admin.role= @status
    if @contract_admin.save
      flash.now[:success] = "Role updated to  #{@status} successfully"
    else
      flash.now[:errors] = @contract_admin.errors
    end
    if @tab.to_i == 2
      @contract_admins = @contract.sell_contract.contract_admins
      @contract_have_admin = @contract.sell_contract.contract_admins.present? ? @contract.sell_contract.contract_admins.admin.count != 0 : false
    else
      @contract_admins = @contract.contract_admins
      @contract_have_admin = @contract.contract_admins.present? ? @contract.contract_admins.admin.count != 0 : false

    end
    respond_to do |format|
      format.js {}
    end
  end
  def get_hr_admins
    @users =  User.where(id: params[:user_ids]).to_a
    if params[:contract_id].present?
      @users = @users+Contract.find_by(id: params[:contract_id]).contract_admins.to_a
    else
    end
    respond_to do |format|
      format.js {}
    end
  end
  def get_hr_admins_sell_company
    @tab=2
    @sell_users =  User.where(id: params[:user_ids]).to_a
    if params[:contract_id].present?
      @sell_users = @sell_users +  Contract.find(params[:contract_id]).sell_contract.contract_admins.to_a
    end
    respond_to do |format|
      format.js {}
    end
  end

  def get_reporting_managers
    @users = User.where(id: params[:company_contacts_ids]).to_a
    if params[:contract_id].present?
      @users = @users + User.where(id:Contract.find_by(id: params[:contract_id])&.sell_contract&.contract_sell_business_details.pluck('user_id')).to_a
    end
    respond_to do |format|
      format.js {}
    end
  end

  def delete_reporting_manager
    @contract = Contract.find_by(id: params[:contract_id])
    @contract_sell_business_detail = @contract.sell_contract.contract_sell_business_details.find_by(id: params[:reporting_manager_id])
    @have_admin = @contract.sell_contract ? @contract.sell_contract.contract_sell_business_details.admin.count != 0 : false
    if @contract_sell_business_detail.destroy
      flash.now[:success] = "Successfully Removed"
    else
      flash.now[:errors] = @contract_sell_business_detail.errors.full_messages
    end
    @contract_sell_business_details = @contract.sell_contract.contract_sell_business_details.includes(:user)
  end

  def remove_role
    @bussiness_detail = ContractSellBusinessDetail.find(params[:bussiness_detail])
    @sell_contract_bussiness_details = @bussiness_detail.sell_contract.contract_sell_business_details
    @bussiness_detail.role = 'member'
    if @bussiness_detail.save
      respond_to do |format|
        flash[:success] = ["Role updated to  Member successfully"]
        # format.js {render inline: "location.reload();" }
        format.js {}

      end
    else
      respond_to do |format|
        flash.now[:errors] = @bussiness_detail.errors.full_messages

        # format.js {render inline: "location.reload();" }
      end
    end
  end

  def update_role
    @bussiness_detail = ContractSellBusinessDetail.find(params[:bussiness_detail])
    @sell_contract_bussiness_details = @bussiness_detail.sell_contract.contract_sell_business_details
    @bussiness_detail.role = 'admin'
    if @bussiness_detail.save
      respond_to do |format|
        flash[:success] = ["Role updated to  Admin successfully"]
        format.js {}
      end
    else
      flash.now[:errors] = @bussiness_detail.errors.full_messages
      respond_to do |format|
        # format.js {render inline: "location.reload();" }
        flash.now[:errors] = @bussiness_detail.errors.full_messages
      end
    end
  end

  def delete_hr_admin
    @contract = Contract.find_by(id: params[:contract_id])
    @contract_admin = @contract.contract_admins.find_by(id: params[:contract_admin_id])
    if @contract_admin.destroy
      flash.now[:success] = "Successfully Removed"
    else
      flash.now[:errors] = @contract_admin.errors.full_messages
    end
    @users = @contract.contract_admins.includes(:user)
  end

  def extend_contract
    extended_date = Date.parse(params[:contract][:end_date])
    respond_to do |format|
      if @contract.end_date < extended_date
        if ExtendContractCyclesJob.perform_later(@contract, params[:contract][:end_date])
          flash[:success] = "Request is added for processing"
        else
          flash[:errors] = ["Something wrong, job has't been added"]
        end
      else
        flash[:errors] = ["Extended date must be greater then contract end data"]
      end
      format.js {}
    end
  end

  private

  def approval_params
    params.require(:approval).permit(:id, :user_id, :approvable_type, :contractable_type, :contractable_id, :approvable_type)
  end

  def filtering_params(params)
    params.slice(:contract_id, :candidate_id, :note)
  end


  def find_contract
    @contract = Contract.includes(:sell_contract, :buy_contract).find(params[:id] || params[:contract_id]) #  , current_company).first || []
  end

  def find_attachable_doc
    @attachable_doc = @contract.attachable_docs.find_by_id(params[:attachable_doc][:id])
  end

  def find_receive_contract
    @contract = current_company.received_contracts.where(id: params[:id]).first || []
  end

  def find_job
    @job = current_company.jobs.find_by_id(params[:job_id])
  end

  def set_contracts
    @received_search = current_company.received_contracts.includes(job: [:company, :created_by]).search(params[:q]) || []
    @received_contracts = @received_search.result.paginate(page: params[:page], per_page: 30) || []
    @sent_search = current_company.sent_contracts.includes(job: [:created_by]).search(params[:q]) || []
  end


  def sell_request_params
    params.require(:document).permit(:id, :doc_file, :request, :file_name, :file_size, :file_type, :when_expire, :is_sign_required, :creatable_type,
                                     :creatable_id)
  end

  def send_document_params
    params.require(:document).permit(:id, :doc_file, :request, :file_name, :file_size, :file_type, :when_expire, :is_sign_required, :creatable_type,
                                     :creatable_id)
  end

  def buy_document_params
    params.require(:document).permit(:id, :doc_file, :request, :file_name, :file_size, :file_type, :when_expire, :is_sign_required, :creatable_type,
                                     :creatable_id)
  end

  def contract_params
    params.require(:contract).permit(
        [:job_id, :client_id, :candidate_id, :is_commission, :contract_type, :client_name, :client_name,
         :company_name, :work_location, :received_by_signature, :received_by_name, :sent_by_signature, :sent_by_name,
         :company_address, :company_website, :fed_id, :commission_type, :commission_amount, :max_commission,
         :commission_for_id, :candidate_name, :customer_rate, :time_sheet_frequency, :invoice_terms_period,
         :show_accounting_to_employee, :billing_frequency, :time_sheet_frequency, :assignee_id, :contractable_id,
         :contractable_type, :job_application_id, :parent_contract_id, :start_date, :is_client_customer,
         :payment_term, :b_time_sheet, :payrate, :contract_type, :end_date,
         :message_from_hiring, :status, :company_id, company_doc_ids: [],
         sell_contract_attributes: [
             :ts_2day_of_week, :ta_2day_of_week,
             :invoice_2day_of_week,
             :ce_2day_of_week,
             :ce_ap_2day_of_week,
             :ce_in_2day_of_week,
             :pr_2day_of_week,
             :expected_hour,
             :integration,
             :ce_ap_2day_of_week,
             :id,
             :is_performance_review, :performance_review, :pr_day_time, :pr_date_1, :pr_date_2, :pr_day_of_week, :pr_end_of_month,
             :is_client_expense, :client_expense, :ce_day_time, :ce_date_1, :ce_date_2, :ce_day_of_week, :ce_end_of_month,

             :ce_approve, :ce_ap_day_time, :ce_ap_date_1, :ce_ap_date_2, :ce_ap_day_of_week, :ce_ap_end_of_month,
             :ce_invoice, :ce_in_day_time, :ce_in_date_1, :ce_in_date_2, :ce_in_day_of_week, :ce_in_end_of_month,

             :company_id, :customer_rate, :customer_rate_type, :invoice_terms_period,
             :show_accounting_to_employee, :first_date_of_timesheet,
             :payment_term, :invoice_day_of_week, :invoice_end_of_month, :invoice_date_2, :invoice_date_1,
             :time_sheet, :ts_day_of_week, :ts_date_1, :ts_date_2, :ts_end_of_month,
             :ts_approve, :ta_day_of_week, :ta_date_1, :ta_date_2, :ta_end_of_month,
             :cr_start_date, :cr_end_date, :first_date_of_invoice,
             :ts_day_time, :ta_day_time, :invoice_day_time,
             approvals_attributes: [
                 :id, :user_id, :approvable_type
             ],
             contract_sell_business_details_attributes: [
                 :id, :company_contact_id, :_destroy
             ],
             sell_send_documents_attributes: [:id, :doc_file, :file_name, :file_size, :file_type, :when_expire, :is_sign_required, :creatable_type,
                                              :creatable_id, :_destroy,
                                              document_signs_attributes: [
                                                  :id, :signable_type, :signable_id, :_destroy
                                              ]
             ],
             sell_request_documents_attributes: [:id, :doc_file, :request, :file_name, :file_size, :file_type, :when_expire, :is_sign_required, :creatable_type,
                                                 :creatable_id, :_destroy,
                                                 document_signs_attributes: [:id, :signable_type, :signable_id, :_destroy]],
             change_rates_attributes: [:id, :from_date, :to_date, :rate_type, :rate, :rateable_type, :rateable_id, :working_hrs, :_destroy]
         ],
         buy_contract_attributes: [
             :ts_2day_of_week, :ta_2day_of_week,
             :invoice_2day_of_week,
             :ce_2day_of_week,
             :ce_ap_2day_of_week,
             :ce_in_2day_of_week,
             :pr_2day_of_week,
             :sc_2day_of_week,
             :sp_2day_of_week,
             :sclr_2day_of_week,
             :payroll_info_id,
             :id,
             :integration,
             :vendor_bill, :vb_day_time, :vb_date_1, :vb_date_2, :vb_day_of_week, :vb_end_of_month,

             :client_bill, :cb_day_time, :cb_date_1, :cb_date_2, :cb_day_of_week, :cb_end_of_month,

             :client_bill_payment, :cp_day_time, :cp_date_1, :cp_date_2, :cp_day_of_week, :cp_end_of_month, :client_bill_payment_term,

             :salary_process, :sp_day_time, :sp_date_1, :sp_date_2, :sp_day_of_week, :sp_end_of_month,

             :salary_clear, :sclr_day_time, :sclr_date_1, :sclr_date_2, :sclr_day_of_week, :sclr_end_of_month,

             :commission_calculation, :com_cal_day_time, :com_cal_date_1, :com_cal_date_2, :com_cal_day_of_week, :com_cal_end_of_month,

             :commission_process, :com_pro_day_time, :com_pro_date_1, :com_pro_date_2, :com_pro_day_of_week, :com_pro_end_of_month,

             :vendor_clear, :ven_clr_date_1, :ven_clr_date_2, :ven_clr_day_of_week, :ven_clr_end_of_month, :ven_clr_day_time, :ven_term_1, :ven_term_2, :ven_term_num_1, :ven_term_num_2,

             :candidate_id, :ssn, :contract_type, :payrate, :payrate_type,
             :payment_term, :show_accounting_to_employee, :first_date_of_timesheet,
             :time_sheet, :ts_day_of_week, :ts_date_1, :ts_date_2, :ts_end_of_month,
             :ts_approve, :ta_day_of_week, :ta_date_1, :ta_date_2, :ta_end_of_month,
             :salary_calculation, :sc_day_of_week, :sc_date_1, :sc_date_2, :sc_end_of_month,
             :commission_payment_term, :pr_start_date, :pr_end_date,
             :first_date_of_invoice, :company_id, :uscis_rate,
             :ts_day_time, :ta_day_time, :sc_day_time, :payroll_date, :term_no, :term_no_2, :payment_term_2,
             :invoice_recepit, :ir_day_time, :ir_date_1, :ir_date_2, :ir_end_of_month, :ir_day_of_week,
             approvals_attributes: [
                 :id, :user_id, :approvable_type
             ],
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
                 :creatable_id, :_destroy,
                 document_signs_attributes: [
                     :id, :signable_type, :signable_id, :_destroy
                 ]
             ],
             buy_emp_req_docs_attributes: [
                 :id, :doc_file, :file_name, :file_size, :file_type, :when_expire, :is_sign_required, :creatable_type, :creatable_id, :_destroy,
                 document_signs_attributes: [
                     :id, :signable_type, :signable_id, :_destroy
                 ]
             ],
             buy_ven_req_docs_attributes: [
                 :id, :doc_file, :file_name, :file_size, :file_type, :when_expire, :is_sign_required, :creatable_type, :creatable_id, :_destroy,
                 document_signs_attributes: [
                     :id, :signable_type, :signable_id, :_destroy
                 ]
             ],
             change_rates_attributes: [:id, :from_date, :to_date, :rate_type, :rate, :uscis, :rateable_type, :rateable_id, :working_hrs, :_destroy]
         ],
         contract_terms_attributes: [
             :id, :created_by, :contract_id, :status, :terms_condition, :rate, :note, :_destroy
         ],
         attachments_attributes: [
             :id, :file, :file_name, :file_size, :company_id, :file_type, :attachable_type, :attachable_id, :_destroy
         ]
        ])
  end

  def create_contract_params
    if @job.present? && params.has_key?(:job_id)
      contract_params.merge!(job_id: @job.id, created_by_id: current_user.id)
    else
      contract_params.merge!(respond_by_id: current_user.id, created_by_id: current_user.id)
    end
  end

  def get_buy_contract
    @buy_contract = BuyContract.find_by(id: params[:buy_contract_id])
  end

  def get_sell_contract
    @sell_contract = SellContract.find_by(id: params[:sell_contract_id])
  end

  def create_custom_activity(model, key, parameters, recipient = nil, additional_data = nil)
    model.create_activity(key: key, owner: current_user, params: parameters, recipient: recipient, additional_data: additional_data)
  end

  def update_contract_response_params
    params.require(:contract).permit(:is_commission, :response_from_vendor, :received_by_signature, :received_by_name, :commission_type, :commission_amount, :max_commission, :commission_for_id, :assignee_id)
  end

  def set_docusign_documents
    @request_documents = []
    @signature_documents = []
    @candidate_signature_documents = []
    @vendor_signature_documents = []
    @candidate_request_documents = []
    @signature_templates = []
    @documents_templates = []
    @signature_templates_candidate = []
    @signature_templates_vendor = []
    @documents_templates_candidate = []
    if @contract&.sell_contract&.persisted?
      @signature_templates = current_company.company_candidate_docs.where(is_require: "signature", document_for: "Customer")
      @documents_templates = current_company.company_candidate_docs.where(is_require: "Document", document_for: "Customer")
      @signature_documents = @contract.send("sell_contract").document_signs.where(part_of: @contract.sell_contract, documentable: @signature_templates.ids)
      @request_documents = @contract.send("sell_contract").document_signs.where(part_of: @contract.sell_contract, documentable: @documents_templates.ids)
    end
    if @contract&.buy_contract&.persisted?
      @signature_templates_candidate = current_company.company_candidate_docs.where(is_require: "signature", document_for: "Candidate", title_type: "Contract")
      @signature_templates_vendor = current_company.company_candidate_docs.where(is_require: "signature", document_for: "Vendor", title_type: "Contract")
      @documents_templates_candidate = current_company.company_candidate_docs.where(is_require: "Document", document_for: "Candidate", title_type: "Contract")
      @candidate_signature_documents = @contract.send("buy_contract").document_signs.where(part_of: @contract.buy_contract, signable: @contract.buy_contract.contract.candidate, documentable: @signature_templates_candidate.ids)
      @vendor_signature_documents = @contract.buy_contract.company.present? ? @contract.send("buy_contract").document_signs.where(part_of: @contract.buy_contract, signable: @contract.buy_contract.company.owner, documentable: @signature_templates_vendor.ids) : []
      @candidate_request_documents = @contract.send("buy_contract").document_signs.where(part_of: @contract.buy_contract, signable: @contract.buy_contract.contract.candidate, documentable: @documents_templates_candidate.ids)

    end
  end
end
