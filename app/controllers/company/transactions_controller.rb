class Company::TransactionsController < Company::BaseController
  before_action :find_timesheet , only: [:create]
  before_action :find_timesheet_log , only: [:create]

  def create
    @transaction = @timesheet_log.transactions.new(transaction_params)

    respond_to do |format|
      if @transaction.save
        format.html { redirect_to :back, notice: 'Job was successfully created.' }
        format.json { render :show, status: :created, location: @transaction }
      else
        format.html { redirect_to :back , errors:  @transaction.errors.full_message}
        format.json { render json: @transaction.errors, status: :unprocessable_entity }
      end
    end
  end
  private

  def find_timesheet
    @timesheet = current_company.timesheets.find_by_id(params[:timesheet_id]) || []
  end

  def find_timesheet_log
    @timesheet_log   = @timesheet.timesheet_logs.find_by_id(params[:timesheet_log_id]) || []
  end

  def transaction_params
    params.require(:transaction).permit(:start_time , :end_time , :memo)
  end
end
