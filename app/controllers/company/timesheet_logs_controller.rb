class Company::TimesheetLogsController < Company::BaseController

  before_action :find_timesheet
  before_action :find_timesheet_log

  def index

  end

  def show
    timesheet_log_ids = @timesheet.timesheet_logs.ids
    current_index = timesheet_log_ids.index(@timesheet_log.id)
    @next = current_index + 1 == timesheet_log_ids.size ? nil : @timesheet.timesheet_logs.find_by_id(timesheet_log_ids[current_index + 1])
    @prev = current_index == 0 ? nil : @timesheet.timesheet_logs.find_by_id(timesheet_log_ids[current_index - 1])


  end

  private

  def find_timesheet
    @timesheet = current_company.timesheets.find_by_id(params[:timesheet_id]) || []
  end

  def find_timesheet_log
    @timesheet_log = @timesheet.timesheet_logs.find_by_id(params[:id]) || []
  end

end
