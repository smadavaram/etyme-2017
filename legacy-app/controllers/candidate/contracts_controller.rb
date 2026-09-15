# frozen_string_literal: true

class Candidate::ContractsController < Candidate::BaseController
  before_action :set_contract, only: [:show]
  add_breadcrumb 'DashBoard', :candidate_candidate_dashboard_path
  def index
    add_breadcrumb 'HR-Contract', candidate_contracts_path
    @contracts = Contract.where.not(status: :draft).where(candidate: current_candidate)
  end

  def show
    if @contract
      add_breadcrumb 'HR-Contract', candidate_contracts_path
      add_breadcrumb @contract.project_name, candidate_contract_path(@contract)
      @candidate_signature_documents = @contract.send('buy_contract').document_signs.where(signable: current_candidate, documentable: @contract.job.company.company_candidate_docs.where(is_require: 'signature').ids)
      @candidate_request_documents = @contract.send('buy_contract').document_signs.where(signable: current_candidate, documentable: @contract.job.company.company_candidate_docs.where(is_require: 'Document').ids)
    else
      flash[:errors] = ['Contract Does not exists or destroyed']
      redirect_to candidate_contracts_path
    end
  end

  def submit_timesheet
    @timesheet = current_candidate.timesheets.find_by(id: params[:timesheet_id])
  end

  def timeline
    add_breadcrumb 'Timeline(s)'
    @contract_cycles = params[:cycle_type]&.eql?('timesheet') ? current_candidate.contract_cycles.where(cycle_type: 'TimesheetSubmit').where.not(cycle_type: "TimesheetApprove") : current_candidate.contract_cycles.where.not(cycle_type: "TimesheetApprove")
    @contracts = Contract.where(candidate: current_candidate)
  end

  def request_document
    @docment_sign = DocumentSign.find_by(id: params[:docusign_id])
    if @docment_sign.update(is_sign_done: true, signed_file: params[:file])
      flash.now[:success] = 'successfully uploaded the document'
      render json: { status: 'successfully uploaded the document' }, status: :ok
    else
      render json: { status: @docment_sign.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def set_contract
    @contract = Contract.where.not(status: :draft).find_by_id(params[:id])
  end
end
