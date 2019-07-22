class Candidate::ClientExpensesController < Candidate::BaseController

  include CandidateHelper

  def index
    @dates = Time.now-1.month
    @client_expenses = current_candidate.client_expenses.includes(:candidate, contract: [:buy_contract, sell_contract:[:company]]).not_submitted_expenses.where("(start_date >= ? AND start_date <= ?) OR (end_date >= ? AND end_date <= ?) ",(@dates.beginning_of_week-1.day), (@dates.end_of_week - 1.day), (@dates.beginning_of_week-1.day), (@dates.end_of_week - 1.day)).order(id: :asc)
    @time_cycle = [((@dates.beginning_of_week-1.day).strftime("%m/%d/%Y") +" - " + (@dates.end_of_week - 1.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week ).strftime("%m/%d/%Y") +" - " + (@dates.end_of_week + 6.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 7.day).strftime("%m/%d/%Y") +" - " + (@dates.end_of_week + 13.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 14.day).strftime("%m/%d/%Y") +" - " + (@dates.end_of_week + 20.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 21.day).strftime("%m/%d/%Y") +" - " + (@dates.end_of_week + 27.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 28.day).strftime("%m/%d/%Y") +" - " + (@dates.end_of_week + 34.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 35.day).strftime("%m/%d/%Y") +" - " + (@dates.end_of_week + 41.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 42.day).strftime("%m/%d/%Y") +" - " + (@dates.end_of_week + 48.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 49.day).strftime("%m/%d/%Y") +" - " + (@dates.end_of_week + 55.day).strftime("%m/%d/%Y")),
                   ((@dates.end_of_week + 56.day).strftime("%m/%d/%Y") +" - " + (@dates.end_of_week + 62.day).strftime("%m/%d/%Y"))]

  end


  def get_client_expenses
    dates = params[:date_range].split(" - ")
    @start_date = Date.strptime(dates[0].gsub('/', '-'), '%m-%d-%Y')
    @end_date = Date.strptime(dates[1].gsub('/', '-'), '%m-%d-%Y')
    @client_expenses = current_candidate.client_expenses.includes(:candidate, contract: [:buy_contract, sell_contract:[:company]]).not_submitted_expenses.where("(start_date >= ? AND start_date <= ?) OR (end_date >= ? AND end_date <= ?) ",@start_date, @end_date, @start_date, @end_date).order(id: :asc)
  end

  def update
    @client_expense = current_candidate.client_expenses.not_submitted_expenses.find(params[:id])
    if @client_expense.present?
      if params[:client_expense][:days].present?
        @client_expense.submitted(client_expense_params, params[:client_expense][:days], params[:client_expense][:days].values.map(&:to_i).sum)
        flash[:success] = "Successfully Submitted"
      else
        flash[:errors] = ["You are able to submit timeshhet for #{@client_expense.contract.title} on #{@client_expense.start_date.strftime('%d/%m/%Y')}"]
      end
    else
      flash[:errors] = ["Timesheet Invalid"]
    end
    render 'create'
  end

  def submitted_client_expenses
    @client_expenses = current_candidate.client_expenses.includes(:candidate, contract: [:buy_contract, sell_contract:[:company]]).submitted_client_expenses
  end

  def approve_client_expenses
    @client_expenses = current_candidate.client_expenses.approved_client_expenses
  end

  private

  def client_expense_params
    params.require(:client_expense).permit(:job_id, :user_id, :company_id, :contract_id, :status, :start_date, :end_date, :submitted_date, :ce_cycle_id)
  end

  def check_valid_dates(contract, startdate, enddate)
    ts = contract.timesheets.order("created_at DESC").first
    nd = ts.present? ? ts.end_date + 1.day : contract.start_date
    if startdate.to_date <= nd && nd <= enddate.to_date
      true
    else
      flash[:errors] = ["You are able to submit timesheet, You need to send timesheet of date #{nd} first." ]
      false
    end
  end

end
