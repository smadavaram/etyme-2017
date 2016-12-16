class Company::TimesheetsController < Company::BaseController
  before_action :find_timesheet , only: [:show , :approve]
  before_action :set_timesheets , only: [:index]

  def index

  end

  def show
  end

  def approve
    if @timesheet.approved!
    flash[:success] = "Successfully Approved"
  else
    flash[:errors] = @timesheet.errors.full_messages
  end
  redirect_to :back
  end

  private

  def find_timesheet
    @timesheet = current_company.timesheets.find_by_id(params[:id] || params[:timesheet_id]) || []
  end

  def set_timesheets
    @timesheets   = current_company.timesheets || []
  end
end
