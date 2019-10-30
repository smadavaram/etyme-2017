class Company::ExpensesController < Company::BaseController

  def new
    @expense = Expense.new
    @expense_type = ExpenseType.new
    @salary_cycles = []
  end

  def create
    @expense = Expense.new(expense_params)
    @expense.ce_ap_cycle_id = params[:ce_ap_ids][0].split(',').map(&:to_i) if params[:expense][:bill_type] == 'client_expense'
    @expense.status = 'bill_generated'
    if @expense.save
      if params[:expense][:bill_type] == 'client_expense'
        params[:ce_ap_ids][0].split(',').map(&:to_i)
        ClientExpense.where(ce_ap_cycle_id: params[:ce_ap_ids][0].split(',').map(&:to_i)).update_all(status: 'bill_generated')
      end
      redirect_to pay_expense_expenses_path
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
    @banks = BankDetail.where(company_id: current_company.id)
    @expense_accounts = ExpenseAccount.joins(:expense).where("expenses.contract_id in (?)", current_company&.in_progress_contracts&.ids)
    @client_expenses_invoice = Expense.where(bill_type: 'client_expense', status: 'invoice_generated').where(contract_id: current_company&.in_progress_contracts&.ids)
  end

  def submit_bill
    ActiveRecord::Base.transaction do
      bd = BankDetail.find_by(id: params[:bank_id].to_i)
      if bd.present?
        if bd.balance.to_i >= params[:expense_account][:payment].to_i
          ex = ExpenseAccount.find_by(id: params[:pay_bill_id])
          ex.status = 'cleared' if ex.amount.to_i == (ex.payment.to_i + params[:expense_account][:payment].to_i)
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
      else
        flash[:alert] = 'please Add Bank to Pay Bill'
      end
      redirect_to pay_expense_expenses_path

    end
  end

  def client_expense_generate_invoice
    expense = Expense.find_by(id: params[:ex_id])
    expense.set_ce_invoice_on_seq(expense)
    expense.update(status: 'invoice_generated')
    ClientExpense.where(ce_ap_cycle_id: expense.ce_ap_cycle_id, status: 'bill_generated').update_all(status: 4)
    flash[:success] = 'Invoice generated successfully'
    redirect_to pay_expense_expenses_path
  end

  def client_expense_invoices
    @client_expenses = Expense.where(bill_type: 'client_expense', status: 'bill_generated').where(contract_id: current_company&.in_progress_contracts&.ids)
  end

  def client_expense_bill
    @expense = Expense.new
  end

  def filter_approved_client_expense
    @client_expenses = current_company.client_expenses.joins(contract: [:client, [buy_contract: :candidate]])
                           .approved_client_expenses.where(contract_id: params[:contract_id])
                           .select("DISTINCT(client_expenses.ce_ap_cycle_id), contracts.number, companies.name, buy_contracts.contract_type, candidates.first_name, candidates.last_name, sum(amount) as total_amount")
                           .group('client_expenses.ce_ap_cycle_id', 'contracts.number', 'companies.name', 'buy_contracts.contract_type', 'candidates.first_name', 'candidates.last_name')
                           .map(&:attributes)
  end

  def get_bank_balance
    bank_bal = BankDetail.find_by(id: params[:bank_id].to_i, company_id: current_company.id)
    render json: { bank_bal: bank_bal }
  end

  def invoice_payment
    expense = Expense.find_by(id: params[:ex_id])
    expense.update(status: 'paid', attachment: params[:expense][:attachment] )
    ClientExpense.where(ce_ap_cycle_id: expense.ce_ap_cycle_id, status: 'invoice_generated').update_all(status: 'paid')
    expense.set_ce_invoice_payment_on_seq(expense)
    flash[:success] = 'Payment done successfully'
    redirect_to pay_expense_expenses_path
  end

  def paid_invoice_list
    @client_expense_invoices = Expense.where(status: 'paid', contract_id: current_company&.contracts&.ids)
  end

  private

  def expense_params
    params.require(:expense).permit( :contract_id, :account_id, :mailing_address, :terms, :bill_date, :due_date, :bill_no, :total_amount, :ce_ap_cycle_id, :status, :attachment, :bill_type, {:salary_ids => []}, expense_accounts_attributes: [:id, :expense_type_id, :description, :status, :amount, :_destroy])
  end

  def expense_type_params
    params.require(:expense_type).permit(:name)
  end

end
