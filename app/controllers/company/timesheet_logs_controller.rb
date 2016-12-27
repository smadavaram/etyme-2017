class Company::TimesheetLogsController < Company::BaseController

  before_action :find_timesheet
  before_action :find_timesheet_log

  add_breadcrumb "TIMESHEET LOGS", '#', options: { title: "TIMESHEET LOGS" }

  def index

  end

  def show
    timesheet_log_ids = @timesheet.timesheet_logs.ids
    timesheet_log_ids.sort!
    current_index = timesheet_log_ids.index(@timesheet_log.id)
    @next = current_index + 1 == timesheet_log_ids.size ? nil : @timesheet.timesheet_logs.find_by_id(timesheet_log_ids[current_index + 1])
    @prev = current_index == 0 ? nil : @timesheet.timesheet_logs.find_by_id(timesheet_log_ids[current_index - 1])
  end

  def approve
    if @timesheet_log.approved!
      flash[:success] = "Successfully Approved"
    else
      flash[:errors] = @timesheet_log.errors.full_messages
    end
    redirect_to :back

  end

  private

  def find_timesheet
    @timesheet = current_company.timesheets.find_by_id(params[:timesheet_id]) || []
  end

  def find_timesheet_log
    @timesheet_log = @timesheet.timesheet_logs.find_by_id(params[:id] || params[:timesheet_log_id]) || []
  end

end
