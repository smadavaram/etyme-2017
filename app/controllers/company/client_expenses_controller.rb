class Company::ClientExpensesController < Company::BaseController
  include CandidateHelper

  def index
    @client_expenses = current_company.client_expenses.joins(contract: [:client, [buy_contracts: :candidate]]).submitted_client_expenses.select("DISTINCT(client_expenses.ce_ap_cycle_id), contracts.number, companies.name, buy_contracts.contract_type, candidates.first_name, candidates.last_name, sum(amount) as total_amount").group('client_expenses.ce_ap_cycle_id', 'contracts.number', 'companies.name', 'buy_contracts.contract_type', 'candidates.first_name', 'candidates.last_name').map(&:attributes)
  end

  def approve
    client_expenses = ClientExpense.where(ce_ap_cycle_id: params[:approve_cycle_id])
    client_expenses.update_all(status: 2)
    redirect_to client_expenses_path
  end  


  private

  def timesheet_params
    params.require(:timesheet).permit(:job_id, :user_id, :company_id, :contract_id, :status, :total_time, :start_date, :end_date, :submitted_date, :next_timesheet_created_date, :invoice_id, :timesheet_attachment)
  end

end
