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

  def pay_expense
  end

  def submit_bill
    # binding.pry
    bd = BankDetail.find_by(id: params[:bank_id].to_i)
    if bd.balance.to_i >= params[:expense_account][:payment].to_i
      ex = ExpenseAccount.find_by(id: params[:pay_bill_id])
      ex.status = 'cleared' if ex.amount.to_i == ex.payment.to_i + params[:expense_account][:payment].to_i
      ex.status = 'cancelled' if params[:pay_type] == 'reject'
      ex.payment = ex.payment.to_i + params[:expense_account][:payment].to_i
      ex.balance_due = params[:expense_account][:balance_due]
      ex.pay_type = params[:pay_type]
      ex.save
      bd.update(balance: bd.balance.to_i - params[:expense_account][:payment].to_i)
      flash[:success] = 'Payment done successfully'
    else
      flash[:alert] = 'Insufficient balance in your account please try with another account.'
    end
    redirect_to pay_expense_expenses_path
  end

  def get_bank_balance
    bank_bal = BankDetail.find_by(id: params[:bank_id].to_i, company_id: current_company.id)
    render json: { bank_bal: bank_bal }
  end

  private

  def expense_params
    params.require(:expense).permit( :contract_id, :account_id, :mailing_address, :terms, :bill_date, :due_date, :bill_no, :total_amount, :bill_type, expense_accounts_attributes: [:id, :expense_type_id, :description, :status, :amount, :_destroy])
  end

  def expense_type_params
    params.require(:expense_type).permit(:name)
  end

end
