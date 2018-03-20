class Candidate::TimesheetsController < Candidate::BaseController

  def index
    @timesheets = current_candidate.timesheets
  end

  def new
    @contracts = Contract.joins(:buy_contracts).where(buy_contracts: {candidate_id: current_candidate.id})
    @time_cycle = [((Time.now.beginning_of_week-2.day).strftime("%m/%d/%Y") +" - " + (Time.now.end_of_week - 2.day).strftime("%m/%d/%Y")),
                   ((Time.now.end_of_week - 1.day).strftime("%m/%d/%Y") +" - " + (Time.now.end_of_week + 5.day).strftime("%m/%d/%Y")),
                   ((Time.now.end_of_week + 6.day).strftime("%m/%d/%Y") +" - " + (Time.now.end_of_week + 12.day).strftime("%m/%d/%Y")),
                   ((Time.now.end_of_week + 13.day).strftime("%m/%d/%Y") +" - " + (Time.now.end_of_week + 19.day).strftime("%m/%d/%Y")),
                   ((Time.now.end_of_week + 20.day).strftime("%m/%d/%Y") +" - " + (Time.now.end_of_week + 26.day).strftime("%m/%d/%Y"))]

    @timesheet = Timesheet.new
  end

  def create
    @timesheet = current_candidate.timesheets.new(timesheet_params)
    @timesheet.days = params[:timesheet][:days]
    @timesheet.total_time = params[:timesheet][:days].values.map(&:to_i).sum
    if @timesheet.save
      flash[:success] = "Successfully Created" if params[:is_all].blank?
      # redirect_to candidate_contracts_path
    else
      flash[:errors] = @timesheet.errors.full_messages if params[:is_all].blank?
      # redirect_to candidate_contracts_path
    end
  end

  private

  def timesheet_params
    params.require(:timesheet).permit(:job_id, :user_id, :company_id, :contract_id, :status, :total_time, :start_date, :end_date, :submitted_date, :next_timesheet_created_date, :invoice_id, :timesheet_attachment, :candidate_name)
  end

end
