class Candidate::TimesheetsController < Candidate::BaseController

  include CandidateHelper
  before_action :set_time_sheet, only: [:update, :submit_timesheet, :add_hrs]
  add_breadcrumb 'Dashboard', :candidate_candidate_dashboard_path


  def index
    add_breadcrumb 'timesheet(s)', :candidate_timesheets_path

    @cycles = current_candidate.contract_cycles.where(cycle_type: 'TimesheetSubmit')
    @contracts = Contract.where(candidate: current_candidate)
    respond_to do |format|
      @timesheets = Timesheet.timesheet_by_frequency(
          params[:cycle_frequency].present? ? params[:cycle_frequency] : "weekly",
          current_candidate).send(params[:tab].present? ? params[:tab] : "open_timesheets"
      )
      format.html {
        @tab = params[:tab].present? ? params[:tab] : "open_timesheets"
      }
      format.js {
        @cycle_id = params[:cycle_id]
        @contract_id = params[:contract_id]
        @tab = params[:tab]
        if params[:cycle_frequency].present?
          @cycle_frequency = params[:cycle_frequency]
          @timesheets = Timesheet.timesheet_by_frequency(params[:cycle_frequency], current_candidate).send(@tab)
        elsif if_all?(params[:contract_id]) and if_all?(params[:cycle_id])
          @timesheets = current_candidate.timesheets.send(@tab)
        elsif params[:contract_id] != "all" and if_all?(params[:cycle_id])
          @timesheets = current_candidate.timesheets.send(@tab).where(id: current_candidate.contract_cycles.where(contract_id: params[:contract_id], cycle_type: 'TimesheetSubmit', cyclable_type: "Timesheet").pluck(:cyclable_id))
        elsif params[:cycle_id] != "all"
          @timesheets = current_candidate.timesheets.send(@tab).where(id: current_candidate.contract_cycles.where(id: params[:cycle_id]).pluck(:cyclable_id))
        end
        @timesheets = @timesheets.paginate(page: params[:page], per_page: 10) unless @tab == "open_timesheets"
        @cycle_frequency = @timesheets&.first.contract_cycle.cycle_frequency if @timesheets.present?
      }
    end
  end

  def get_timesheets
    dates = params[:date_range].split(" - ")
    @start_date = Date.strptime(dates[0].gsub('/', '-'), '%m-%d-%Y')
    @end_date = Date.strptime(dates[1].gsub('/', '-'), '%m-%d-%Y')
    @timesheets = current_candidate.timesheets.includes(:contract).open_timesheets.where("(start_date >= ? AND start_date <= ?) OR (end_date >= ? AND end_date <= ?) ", @start_date, @end_date, @start_date, @end_date)
  end

  def add_hrs
    @transaction = @timesheet.transactions.find_by(id: params[:transaction_id])
    if @transaction.update(total_time: params[:total_hrs])
      render json: {status: "Hours added successfully"}, status: :ok
    else
      render json: {status: @transaction.errors.full_messages}, status: :unprocessable_entity
    end
  end

  def new
    # @contracts = Contract.joins(:buy_contracts).where(buy_contracts: {candidate_id: current_candidate.id})
    @ts_cycle = current_candidate.contract_cycles.where(cycle_type: "TimesheetSubmit").order("created_at DESC")
    dates = Time.now - 1.month
    @time_cycle = [((dates.beginning_of_week - 1.day).strftime("%m/%d/%Y") + " - " + (dates.end_of_week - 1.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week).strftime("%m/%d/%Y") + " - " + (dates.end_of_week + 6.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 7.day).strftime("%m/%d/%Y") + " - " + (dates.end_of_week + 13.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 14.day).strftime("%m/%d/%Y") + " - " + (dates.end_of_week + 20.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 21.day).strftime("%m/%d/%Y") + " - " + (dates.end_of_week + 27.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 28.day).strftime("%m/%d/%Y") + " - " + (dates.end_of_week + 34.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 35.day).strftime("%m/%d/%Y") + " - " + (dates.end_of_week + 41.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 42.day).strftime("%m/%d/%Y") + " - " + (dates.end_of_week + 48.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 49.day).strftime("%m/%d/%Y") + " - " + (dates.end_of_week + 55.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 56.day).strftime("%m/%d/%Y") + " - " + (dates.end_of_week + 62.day).strftime("%m/%d/%Y"))]

    @timesheet = Timesheet.new
  end

  def create
    contract = Contract.where(id: params[:timesheet][:contract_id]).first
    if contract.present?
      if check_valid_dates(contract, params[:timesheet][:start_date], params[:timesheet][:end_date])
        if contract.buy_contract.candidate_id == current_candidate.id
          buy_contract = contract.buy_contract
          if buy_contract.first_date_of_timesheet <= Time.now
            @timesheet = current_candidate.timesheets.new(timesheet_params)
            @timesheet.days = params[:timesheet][:days]
            @timesheet.total_time = params[:timesheet][:days].values.map(&:to_i).sum
            if @timesheet.save
              next_date = get_next_date(buy_contract.first_date_of_timesheet, buy_contract.time_sheet, buy_contract.ts_date_1, buy_contract.ts_date_2, buy_contract.ts_end_of_month, buy_contract.ts_day_of_week, @timesheet.end_date)
              buy_contract.update(first_date_of_timesheet: next_date)

              flash[:success] = "Successfully Created" if params[:is_all].blank?
              # redirect_to candidate_contracts_path
            else
              flash[:errors] = @timesheet.errors.full_messages if params[:is_all].blank?
              # redirect_to candidate_contracts_path
            end
          else
            flash[:errors] = ["You are able to submit timeshhet for #{contract.title} on #{buy_contract.first_date_of_timesheet.strftime('%d/%m/%Y')}"]
          end
        else
          flash[:errors] = ["Contract Invalid"]
        end
      end
    else
      flash[:errors] = ["Contract Invalid"]
    end
  end

  def submit_timesheet
    if @timesheet.end_date <= DateTime.now
      if @timesheet.submitted
        flash[:status] = "Timesheet submitted successfully"
        params[:redirect_url].present? ? redirect_to(params[:redirect_url]) : redirect_back(fallback_location: root_path)
      else
        flash[:errors] = @timesheet.errors.full_messages
        redirect_back(fallback_location: root_path)
      end
    else
      flash[:errors] = ["You cannot submit the before time."]
      redirect_back(fallback_location: root_path)
    end
  end

  def update
    if @timesheet.update(timesheet_params)
      flash[:success] = "Timesheet is updated"
    else
      flash[:errors] = @timesheet.errors.full_messages
    end
    redirect_back(fallback_location: root_path)
  end

  def submitted_timesheets
    @timesheets = current_candidate.timesheets.submitted_timesheets
  end

  def set_time_sheet
    @timesheet = current_candidate.timesheets.open_timesheets.find(params[:id] || params[:timesheet_id])
  end

  def approve_timesheets
    @timesheets = current_candidate.timesheets.approved_timesheets
  end

  private

  def timesheet_params
    params.require(:timesheet).permit(:job_id, :user_id, :company_id, :contract_id, :status, :total_time, :start_date, :end_date, :submitted_date, :next_timesheet_created_date, :invoice_id, :timesheet_attachment, :candidate_name, :ts_cycle_id, transactions_attributes: [:id, :total_time, :memo, :file])
  end

  def check_valid_dates(contract, startdate, enddate)
    ts = contract.timesheets.order("created_at DESC").first
    nd = ts.present? ? ts.end_date + 1.day : contract.start_date
    if startdate.to_date <= nd && nd <= enddate.to_date
      true
    else
      flash[:errors] = ["You are able to submit timesheet, You need to send timesheet of date #{nd} first."]
      false
    end
  end

  def if_all?(value)
    value == "all"
  end

end
