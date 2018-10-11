class Company::ClientExpensesController < Company::BaseController
  before_action :find_timesheet , except: [:index]
  include CandidateHelper

  def index
    @client_expenses = current_company.client_expenses.submitted_client_expenses.paginate(page: params[:page], per_page: 10)
  end

  def approve
    @client_expense.update_attributes(status: "approved")
    redirect_to client_expenses_path
  end  


  private

  def timesheet_params
    params.require(:timesheet).permit(:job_id, :user_id, :company_id, :contract_id, :status, :total_time, :start_date, :end_date, :submitted_date, :next_timesheet_created_date, :invoice_id, :timesheet_attachment)
  end

  def find_timesheet
    @client_expense = ClientExpense.find_sent_or_received(params[:id] || params[:client_expense_id] , current_company)
  end 

end
