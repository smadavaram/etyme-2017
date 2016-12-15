class Company::TimesheetsController < Company::BaseController
  before_action :find_timesheet , only: [:show]
  before_action :set_timesheets , only: [:index]

  def index

  end
  def show
  end

  private

  def find_timesheet
    @timesheet = current_company.timesheets.find_by_id(params[:id]) || []
  end

  def set_timesheets
    @timesheets   = current_company.timesheets || []
  end
end
