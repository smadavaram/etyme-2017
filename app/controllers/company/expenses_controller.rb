class Company::ExpensesController < Company::BaseController

  def new
    @expense = Expense.new
  end

  def create
    @expense = Expense.new(expense_params)
    if @expense.save
      redirect_to root_path
    else
      render 'new'
    end
  end

  def edit
    @expense = Expense.find_by_id(params[:id])
  end

  private

  def expense_params
    params.require(:expense).permit( :contract_id, :account_id, :mailing_address, :terms, :bill_date, :due_date, :bill_no, :total_amount, expense_accounts_attributes: [:id, :expense_type, :description, :status, :amount])
  end

end
