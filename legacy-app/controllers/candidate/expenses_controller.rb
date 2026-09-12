# frozen_string_literal: true

class Candidate::ExpensesController < Candidate::BaseController
  add_breadcrumb 'Dashboard', :candidate_candidate_dashboard_path

  def new
    add_breadcrumb 'Request Expense'

    @expense = Expense.new
    @expense_type = ExpenseType.new
    @salary_cycles = []
  end

  def create
    @expense = Expense.new(expense_params)
    @expense.ce_ap_cycle_id = params[:ce_ap_ids][0].split(',').map(&:to_i) if params[:expense][:bill_type] == 'client_expense'
    @expense.salary_ids = expense_params[:salary_ids].join(",")
    @expense.status = 'bill_generated'
    if @expense.save
      if params[:expense][:bill_type] == 'client_expense'
        params[:ce_ap_ids][0].split(',').map(&:to_i)
        ClientExpense.where(ce_ap_cycle_id: params[:ce_ap_ids][0].split(',').map(&:to_i)).update_all(status: 'bill_generated')
      end
      flash[:success] = 'Expense request is submitted'
      redirect_to '/candidate'
    else
      render 'new'
    end
  end

  private

  def expense_params
    params.require(:expense).permit(:contract_id, :account_id, :mailing_address, :terms, :bill_date, :due_date, :bill_no, :total_amount, :ce_ap_cycle_id, :status, :attachment, :bill_type, { salary_ids: [] }, expense_accounts_attributes: %i[id expense_type_id description status amount _destroy])
  end

  def expense_type_params
    params.require(:expense_type).permit(:name)
  end
end
