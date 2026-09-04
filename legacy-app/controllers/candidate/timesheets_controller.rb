# frozen_string_literal: true

class Candidate::TimesheetsController < Candidate::BaseController
  include CandidateHelper
  before_action :set_time_sheet, only: %i[update submit_timesheet add_hrs]
  add_breadcrumb 'Dashboard', :candidate_candidate_dashboard_path

  def index
    add_breadcrumb 'timesheet(s)', candidate_timesheets_path

    @cycles = current_candidate.contract_cycles.where(cycle_type: 'TimesheetSubmit')
    @contracts = Contract.where(candidate: current_candidate)
    respond_to do |format|
      @timesheets = Timesheet.timesheet_by_frequency(
        params[:cycle_frequency].present? ? params[:cycle_frequency] : 'weekly',
        current_candidate
      ).send(params[:tab].present? ? params[:tab] : 'open_timesheets')
      format.html do
        @tab = params[:tab].present? ? params[:tab] : 'open_timesheets'
      end
      format.js do
        @cycle_id = params[:cycle_id]
        @contract_id = params[:contract_id]
        @tab = params[:tab]
        if params[:cycle_frequency].present?
          @cycle_frequency = params[:cycle_frequency]
          @timesheets = Timesheet.timesheet_by_frequency(params[:cycle_frequency], current_candidate).send(@tab)
        elsif if_all?(params[:contract_id]) && if_all?(params[:cycle_id])
          @timesheets = current_candidate.timesheets.send(@tab)
        elsif (params[:contract_id] != 'all') && if_all?(params[:cycle_id])
          @timesheets = current_candidate.timesheets.send(@tab).where(id: current_candidate.contract_cycles.where(contract_id: params[:contract_id], cycle_type: 'TimesheetSubmit', cyclable_type: 'Timesheet').pluck(:cyclable_id))
        elsif params[:cycle_id] != 'all'
          @timesheets = current_candidate.timesheets.send(@tab).where(id: current_candidate.contract_cycles.where(id: params[:cycle_id]).pluck(:cyclable_id))
        end
        @timesheets = @timesheets.paginate(page: params[:page], per_page: 10) unless @tab == 'open_timesheets'
        @cycle_frequency = @timesheets&.first.contract_cycle.cycle_frequency if @timesheets.present?
      end
    end
  end

  def get_timesheets
    service = CandidateTimesheetService.new(current_candidate)
    timesheets = service.get_timesheets_by_date_range(params[:date_range])
    @start_date = timesheets.first&.start_date
    @end_date = timesheets.last&.end_date
    @timesheets = timesheets
  end

  def add_hrs
    @transaction = @timesheet.transactions.find_by(id: params[:transaction_id])
    if @transaction.update(total_time: params[:total_hrs], memo: params[:memo] || "", file: params[:file])
      render json: {status: "Hours added successfully"}, status: :ok
    else
      render json: { status: @transaction.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def new
    # @contracts = Contract.joins(:buy_contracts).where(buy_contracts: {candidate_id: current_candidate.id})
    @ts_cycle = current_candidate.contract_cycles.where(cycle_type: 'TimesheetSubmit').order('created_at DESC')
    dates = Time.now - 1.month
    @time_cycle = [((dates.beginning_of_week - 1.day).strftime('%m/%d/%Y') + ' - ' + (dates.end_of_week - 1.day).strftime('%m/%d/%Y')),
                   (dates.end_of_week.strftime('%m/%d/%Y') + ' - ' + (dates.end_of_week + 6.day).strftime('%m/%d/%Y')),
                   ((dates.end_of_week + 7.day).strftime('%m/%d/%Y') + ' - ' + (dates.end_of_week + 13.day).strftime('%m/%d/%Y')),
                   ((dates.end_of_week + 14.day).strftime('%m/%d/%Y') + ' - ' + (dates.end_of_week + 20.day).strftime('%m/%d/%Y')),
                   ((dates.end_of_week + 21.day).strftime('%m/%d/%Y') + ' - ' + (dates.end_of_week + 27.day).strftime('%m/%d/%Y')),
                   ((dates.end_of_week + 28.day).strftime('%m/%d/%Y') + ' - ' + (dates.end_of_week + 34.day).strftime('%m/%d/%Y')),
                   ((dates.end_of_week + 35.day).strftime('%m/%d/%Y') + ' - ' + (dates.end_of_week + 41.day).strftime('%m/%d/%Y')),
                   ((dates.end_of_week + 42.day).strftime('%m/%d/%Y') + ' - ' + (dates.end_of_week + 48.day).strftime('%m/%d/%Y')),
                   ((dates.end_of_week + 49.day).strftime('%m/%d/%Y') + ' - ' + (dates.end_of_week + 55.day).strftime('%m/%d/%Y')),
                   ((dates.end_of_week + 56.day).strftime('%m/%d/%Y') + ' - ' + (dates.end_of_week + 62.day).strftime('%m/%d/%Y'))]

    @timesheet = Timesheet.new
  end

  def create
    service = CandidateTimesheetService.new(current_candidate)
    result = service.create_timesheet(timesheet_params, params[:timesheet][:days])
    if result[:success]
      flash[:success] = result[:message] if params[:is_all].blank?
    else
      flash[:errors] = result[:errors] if params[:is_all].blank?
    end
  end

  def submit_timesheet
    service = CandidateTimesheetService.new(current_candidate)
    result = service.submit_timesheet(@timesheet)
    if result[:success]
      flash[:status] = result[:message]
      params[:redirect_url].present? ? redirect_to(params[:redirect_url]) : redirect_back(fallback_location: root_path)
    else
      flash[:errors] = result[:errors]
      redirect_back(fallback_location: root_path)
    end
  end

  def update

    if @timesheet.update(timesheet_params)
      submit_timesheet
      flash[:success] = 'Timesheet is updated'
    else
      flash[:errors] = @timesheet.errors.full_messages
    end
    # redirect_back(fallback_location: root_path)
  end

  def submitted_timesheets
    @timesheets = current_candidate.timesheets.submitted_timesheets
  end

  def set_time_sheet
    @timesheet = current_candidate.timesheets.find(params[:id] || params[:timesheet_id])
  end

  def approve_timesheets
    @timesheets = current_candidate.timesheets.approved_timesheets
  end

  private

  def timesheet_params
    params.require(:timesheet).permit(:job_id, :user_id, :company_id, :contract_id, :status, :total_time, :start_date, :end_date, :submitted_date, :next_timesheet_created_date, :invoice_id, :timesheet_attachment, :candidate_name, :ts_cycle_id, transactions_attributes: %i[id total_time memo file])
  end

  def check_valid_dates(contract, startdate, enddate)
    service = CandidateTimesheetService.new(current_candidate)
    service.send(:check_valid_dates, contract, startdate, enddate)
  end

  def if_all?(value)
    value == 'all'
  end
end
