class Company::TimesheetsController < Company::BaseController

  before_action :find_timesheet , except: [:index]
  # before_action :received_timesheet , only: [:approve]
  before_action :set_timesheets , only: [:index]

  before_action :authorized_user , only: [:show,:approve]

  add_breadcrumb "TIMESHEETS", :timesheets_path, options: { title: "TIMESHEETS" }

  def index
  end

  def show
  end

  def new
    @timesheet = current_user.timesheets.new
    @contracts = current_company.contracts.pluck(:number, :id)
  end

  def submit_timesheet
    @buy_contract = BuyContract.find(params[:timesheet_id])
    if @buy_contract.contract.timesheets.present?
      last_time = @buy_contract.contract.timesheets.order("created_at DESC").first
      @start_date = last_time.end_date + 1.days
      @end_date = @start_date + 7.days
    else
      @start_date = @buy_contract.contract.start_date
      @end_date = @buy_contract.first_date_of_timesheet
    end

    @timesheet = current_user.timesheets.new
    render 'new'
  end

  def create
    @timesheet = current_company.timesheets.new(timesheet_params)
    @timesheet.user_id = current_user.id
    @timesheet.days = params[:timesheet][:days]
    @timesheet.total_time = params[:timesheet][:days].values.map(&:to_i).sum
    if @timesheet.save
      flash[:success] = "Successfully Created"
      redirect_to timesheets_path
    else
      flash[:errors] = @timesheet.errors.full_messages
      redirect_to timesheets_path
    end
  end

  def submit
      @timesheet_approver = current_user.timesheet_approvers.new(timesheet_id: @timesheet.id , status: Timesheet.statuses[:submitted].to_i)
      if @timesheet_approver.save
        flash[:success] = "Successfully Submitted"
      else
        flash[:errors] = @timesheet_approver.errors.full_messages
      end
      redirect_back fallback_location: root_path
  end

  def reject
    if current_user.timesheet_approvers.create!(timesheet_id: @timesheet.id , status: Timesheet.statuses[:rejected].to_i)
      @timesheet.rejected!
      flash[:success] = "Successfully Approved"
    else
      flash[:errors] = @timesheet.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def approve
    if current_user.timesheet_approvers.create!(timesheet_id: @timesheet.id , status: Timesheet.statuses[:approved].to_i)
      flash[:success] = "Successfully Approved"
    else
      flash[:errors] = @timesheet.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def authorized_user
    has_access?("manage_timesheets")
  end

  private

  def timesheet_params
    params.require(:timesheet).permit(:job_id, :user_id, :company_id, :contract_id, :status, :total_time, :start_date, :end_date, :submitted_date, :next_timesheet_created_date, :invoice_id, :timesheet_attachment)
  end

  def find_timesheet
    @timesheet = Timesheet.find_sent_or_received(params[:id] || params[:timesheet_id] , current_company)
  end

  def received_timesheet
    @timesheet = current_company.received_timesheets.find_by_id(params[:id] || params[:timesheet_id]) || []
  end

  def set_timesheets
    @search = current_company.timesheets.search(params[:q])
    @timesheets       = @search.result(distinct: true).paginate(page: params[:page], per_page: 10) || []
    @rec_search = current_company.received_timesheets.search(params[:q])
    @received_timesheets   = @rec_search.result(distinct: true).paginate(page: params[:page], per_page: 10) || []
  end
end
