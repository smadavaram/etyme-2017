class Company::ClientExpensesController < Company::BaseController
  include CandidateHelper
  before_action :set_client_expense, only: [:edit, :update, :submit, :reject, :approve]
  add_breadcrumb "Dashboard", :dashboard_path
  
  def index
    @tab = params[:tab]
    add_breadcrumb "#{@tab} Client Expenses", client_expenses_path
    @start_date = params[:start_date]
    @end_date = params[:end_date]
    @cycle_type = params[:ts_type]
    @ts_for = params[:ts_for].present? ? params[:ts_for] : "sent_client_expenses"
    @client_expenses = @ts_for == "sent_client_expenses" ?
                           ClientExpense.where.not(status: [:pending_expense]).joins(:contract_cycle)
                               .where("contract_cycles.contract_id": current_company.contracts.ids, "contract_cycles.cycle_of_type": "SellContract")
                               .includes(contract: [sell_contract: [:company]]).send("#{@tab&.downcase || 'all'}_client_expenses")
                               .joins(:contract_cycle).where('contract_cycles.cycle_frequency IN (?)', @cycle_type.present? ? ContractCycle.cycle_frequencies[@cycle_type.to_sym] : ContractCycle.cycle_frequencies.values)
                               .between_date(@start_date, @end_date)
                               .paginate(page: params[:page], per_page: 10).order(start_date: :asc) :
                           ClientExpense.where.not(status: [:pending_expense, :not_submitted]).joins(contract_cycle: [contract: :sell_contract])
                               .where("contract_cycles.contract_id": SellContract.all.select(:contract_id), "contract_cycles.cycle_of_type": "SellContract", "sell_contracts.company_id": current_company.id)
                               .includes(contract: [sell_contract: [:company]]).send("#{@tab&.downcase || 'all'}_client_expenses")
                               .joins(:contract_cycle).where('contract_cycles.cycle_frequency IN (?)', @cycle_type.present? ? ContractCycle.cycle_frequencies[@cycle_type.to_sym] : ContractCycle.cycle_frequencies.values)
                               .between_date(@start_date, @end_date)
                               .paginate(page: params[:page], per_page: 10).order(start_date: :asc)
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
  
  def submit
    if @client_expense.submitted!
      flash[:success] = "Exense Submitted for approval Successfully"
    else
      flash[:errors] = @client_expense.errors.full_messages
    end
    redirect_back(fallback_location: client_expenses_path)
  end
  
  def approve
    if @client_expense.approved!
      flash[:success] = "Expense accepted Successfully"
      @client_expenses.contract_cycle.completed!
    else
      flash[:errors] = @client_expense.errors.full_messages
    end
    redirect_back(fallback_location: client_expenses_path)
  end
  
  def reject
    if @client_expense.not_submitted!
      flash[:success] = "Expense has been rejected and opend for resubmission successfully"
    else
      flash[:errors] = @client_expense.errors.full_messages
    end
    redirect_back(fallback_location: client_expenses_path(ts_for: "received_client_expenses"))
  end
  
  
  private
    
    def client_expenses_params
      params.require(:client_expense).permit(expense_items_attributes: [:id, :quantity, :unit_price, :expense_type, :description])
    end
    
    def set_client_expense
      @client_expense = ClientExpense.find_by(id: params[:id] || params[:client_expense_id])
    end
    
    def timesheet_params
      params.require(:timesheet).permit(:job_id, :user_id, :company_id, :contract_id, :status, :total_time, :start_date, :end_date, :submitted_date, :next_timesheet_created_date, :invoice_id, :timesheet_attachment)
    end

end
