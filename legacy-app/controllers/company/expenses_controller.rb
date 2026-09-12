# frozen_string_literal: true

class Company::ExpensesController < Company::BaseController
  add_breadcrumb 'Dashboard', :dashboard_path

  def new
    add_breadcrumb 'New Expense'
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
        format.js { flash.now[:success] = 'successfully Created.' }
      else
        format.html { flash[:errors] = @expense_type.errors.full_messages; render :new }
        format.js { flash.now[:errors] = @expense_type.errors.full_messages }
      end
    end
  end

  def pay_expense
    add_breadcrumb 'Pay Expense(s)'

    @banks = BankDetail.where(company_id: current_company.id)
    @expense_accounts = ExpenseAccount.joins(:expense).where('expenses.contract_id in (?)', current_company&.in_progress_contracts&.ids)
    @client_expenses_invoice = Expense.where(bill_type: 'client_expense', status: 'invoice_generated').where(contract_id: current_company&.in_progress_contracts&.ids)
  end

  def submit_bill
    service = ExpensePaymentService.new(current_user, current_company)
    result = service.submit_bill(params[:pay_bill_id], params[:bank_id], params[:expense_account][:payment], params[:expense_account][:balance_due], params[:pay_type])
    if result[:success]
      flash[:success] = result[:message]
      redirect_to pay_expense_expenses_path
    elsif result[:redirect] == :add_bank
      flash[:alert] = result[:errors].first
      redirect_to add_bank_details_path(current_company.id)
    else
      flash[:alert] = result[:errors].first
      redirect_to pay_expense_expenses_path
    end
  end

  def client_expense_generate_invoice
    service = ExpensePaymentService.new(current_user, current_company)
    result = service.generate_client_expense_invoice(params[:ex_id])
    flash[:success] = result[:message]
    redirect_to pay_expense_expenses_path
  end

  def client_expense_invoices
    add_breadcrumb 'Client Expense(s)', client_expense_invoices_expenses_path
    @client_expenses = Expense.where(bill_type: 'client_expense', status: 'bill_generated').where(contract_id: current_company&.in_progress_contracts&.ids)
  end

  def client_expense_bill
    add_breadcrumb 'Client Expense Bill', client_expense_bill_expenses_path
    @expense = Expense.new
  end

  def filter_approved_client_expense
    service = ExpensePaymentService.new(current_user, current_company)
    @client_expenses = service.filter_approved_client_expenses(params[:contract_id])
  end

  def get_bank_balance
    bank_bal = BankDetail.find_by(id: params[:bank_id].to_i, company_id: current_company.id)
    render json: { bank_bal: bank_bal }
  end

  def invoice_payment
    service = ExpensePaymentService.new(current_user, current_company)
    result = service.record_invoice_payment(params[:ex_id], params[:expense][:attachment])
    flash[:success] = result[:message]
    redirect_to pay_expense_expenses_path
  end

  def paid_invoice_list
    @client_expense_invoices = Expense.where(status: 'paid', contract_id: current_company&.contracts&.ids)
  end

  private

  def expense_params
    params.require(:expense).permit(:contract_id, :account_id, :mailing_address, :terms, :bill_date, :due_date, :bill_no, :total_amount, :ce_ap_cycle_id, :status, :attachment, :bill_type, { salary_ids: [] }, expense_accounts_attributes: %i[id expense_type_id description status amount _destroy])
  end

  def expense_type_params
    params.require(:expense_type).permit(:name)
  end
end
