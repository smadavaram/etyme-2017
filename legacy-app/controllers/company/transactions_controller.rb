# frozen_string_literal: true

class Company::TransactionsController < Company::BaseController
  before_action :find_timesheet, only: %i[create accept reject]
  before_action :find_timesheet_log, only: %i[create accept reject]
  before_action :find_transaction, only: %i[accept reject]

  def create
    @transaction = @timesheet_log.transactions.new(transaction_params)

    respond_to do |format|
      if @transaction.save
        format.html { redirect_back fallback_location: root_path, notice: 'Time has been successfully logged.' }
        format.json { render :show, status: :created, location: @transaction }
      else
        format.html do
          flash[:errors] = @transaction.errors.full_messages
          redirect_back fallback_location: root_path
        end
        format.json { render json: @transaction.errors, status: :unprocessable_entity }
      end
    end
  end

  def accept
    if @transaction.accepted!
      flash[:success] = 'Successfully Approved'
    else
      flash[:errors] = @transaction.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def reject
    if @transaction.rejected!
      flash[:success] = 'Successfully Reject'
    else
      flash[:errors] = @transaction.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  private

  def find_timesheet
    @timesheet = current_company.timesheets.find_by_id(params[:timesheet_id]) || []
  end

  def find_timesheet_log
    @timesheet_log = @timesheet.timesheet_logs.find_by_id(params[:timesheet_log_id]) || []
  end

  def find_transaction
    @transaction = @timesheet_log.transactions.find_by_id(params[:transaction_id]) || []
  end

  def transaction_params
    params.require(:transaction).permit(:start_time, :end_time, :memo, :file)
  end
end
