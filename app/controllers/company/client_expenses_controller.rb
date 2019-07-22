class Company::ClientExpensesController < Company::BaseController
  include CandidateHelper

  def index
    @client_expenses = current_company.client_expenses.includes(:candidate, contract: [:buy_contract, sell_contract:[:company]]).submitted_client_expenses#.joins(contract: [:client, [buy_contracts: :candidate]]).submitted_client_expenses.select("DISTINCT(client_expenses.ce_ap_cycle_id), contracts.number, companies.name, buy_contracts.contract_type, candidates.first_name, candidates.last_name, sum(amount) as total_amount").group('client_expenses.ce_ap_cycle_id', 'contracts.number', 'companies.name', 'buy_contracts.contract_type', 'candidates.first_name', 'candidates.last_name').map(&:attributes)
  end

  def approve
    client_expense = ClientExpense.find_by(id: params[:cycle_id])
    client_expense.update(status: 2)
    ClientExpense.transfer_after_approve_on_seq(client_expense, client_expense.amount)
    flash[:success] = 'Successfully Approved !'
    redirect_to client_expenses_path
  end 

  def reject
    client_expense = ClientExpense.find_by(id: params[:cycle_id])
    client_expense.update(status: 0)
    client_expense.ce_cycle.update(status: 'pending')
    ClientExpense.retire_after_reject_on_seq(client_expense, client_expense.amount)  
    flash[:errors] = 'Expense approval rejected'
    redirect_to client_expenses_path
  end 


  private

  def timesheet_params
    params.require(:timesheet).permit(:job_id, :user_id, :company_id, :contract_id, :status, :total_time, :start_date, :end_date, :submitted_date, :next_timesheet_created_date, :invoice_id, :timesheet_attachment)
  end

end
