class Company::ClientExpensesController < Company::BaseController
  include CandidateHelper
  before_action :set_client_expense, only: [:edit, :update]
  add_breadcrumb 'home', '/'
  def index
    add_breadcrumb 'Client Expenses', client_expenses_path
    @client_expenses = current_company.client_expenses.includes(:candidate, contract: [:buy_contract, sell_contract: [:company]]).submitted_client_expenses #.joins(contract: [:client, [buy_contracts: :candidate]]).submitted_client_expenses.select("DISTINCT(client_expenses.ce_ap_cycle_id), contracts.number, companies.name, buy_contracts.contract_type, candidates.first_name, candidates.last_name, sum(amount) as total_amount").group('client_expenses.ce_ap_cycle_id', 'contracts.number', 'companies.name', 'buy_contracts.contract_type', 'candidates.first_name', 'candidates.last_name').map(&:attributes)
  end
  
  def edit
  
  end
  
  def update
    if @client_expense.update(client_expenses_params)
      flash[:success] = 'Client Expense has be generated'
    else
      flash[:errors] = @client_expense.errors.full_messages
    end
    redirect_to client_expenses_path
  end
  
  def show
  
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
    
    def client_expenses_params
      params.require(:client_expense).permit(expense_items_attributes: [:id, :quantity, :unit_price, :expense_type, :description])
    end
    
    def set_client_expense
      @client_expense = ClientExpense.find_by(id: params[:id])
    end
    
    def timesheet_params
      params.require(:timesheet).permit(:job_id, :user_id, :company_id, :contract_id, :status, :total_time, :start_date, :end_date, :submitted_date, :next_timesheet_created_date, :invoice_id, :timesheet_attachment)
    end

end
