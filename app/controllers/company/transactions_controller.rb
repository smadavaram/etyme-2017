class Company::TransactionsController < Company::BaseController
  before_action :find_timesheet , only: [:create , :accept , :reject]
  before_action :find_timesheet_log , only: [:create , :accept , :reject]
  before_action :find_transaction   , only: [:accept , :reject]

  def create
    @transaction = @timesheet_log.transactions.new(transaction_params)

    respond_to do |format|
      if @transaction.save
        format.html { redirect_to :back, notice: 'Entry has been successfully created.' }
        format.json { render :show, status: :created, location: @transaction }
      else
        format.html {
          flash[:errors] =  @transaction.errors.full_messages
          redirect_to :back
        }
        format.json { render json: @transaction.errors, status: :unprocessable_entity }
      end
    end
  end

  def accept
    if @transaction.accepted!
      flash[:success] = "Successfully Approved"
    else
      flash[:errors] = @transaction.errors.full_messages
    end
    redirect_to :back
  end

  def reject
    if @transaction.rejected!
      flash[:success] = "Successfully Reject"
    else
      flash[:errors] = @transaction.errors.full_messages
    end
    redirect_to :back
  end
  private

  def find_timesheet
    @timesheet = current_company.timesheets.find_by_id(params[:timesheet_id]) || []
  end

  def find_timesheet_log
    @timesheet_log   = @timesheet.timesheet_logs.find_by_id(params[:timesheet_log_id]) || []
  end

  def find_transaction
    @transaction = @timesheet_log.transactions.find_by_id(params[:transaction_id]) || []
  end

  def transaction_params
    params.require(:transaction).permit(:start_time , :end_time , :memo,:file)
  end
end
