class Company::ExpensesController < Company::BaseController

  def new
    @expense = Expense.new
    @expense_type = ExpenseType.new
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
    @expense_type = ExpenseType.new
  end

  def create_expense_type
    @expense_type = ExpenseType.new(expense_type_params)
    respond_to do |format|
      if @expense_type.save
        format.html { redirect_to @expense_type, success: 'Expense type was successfully created.' }
        format.js{ flash.now[:success] = "successfully Created." }
      else
        format.html { flash[:errors] = @expense_type.errors.full_messages; render :new}
        format.js{ flash.now[:errors] =  @expense_type.errors.full_messages }
      end
    end
  end

  private

  def expense_params
    params.require(:expense).permit( :contract_id, :account_id, :mailing_address, :terms, :bill_date, :due_date, :bill_no, :total_amount, expense_accounts_attributes: [:id, :expense_type, :description, :status, :amount])
  end

  def expense_type_params
    params.require(:expense_type).permit(:name)
  end

end
