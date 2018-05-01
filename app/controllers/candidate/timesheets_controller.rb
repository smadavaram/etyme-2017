class Candidate::TimesheetsController < Candidate::BaseController

  include CandidateHelper

  def index
    @timesheets = current_candidate.timesheets.submitted_timesheets
  end

  def new
    @contracts = Contract.joins(:buy_contracts).where(buy_contracts: {candidate_id: current_candidate.id})
    dates = Time.now-1.month
    @time_cycle = [((dates.beginning_of_week-1.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week - 1.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week ).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 6.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 7.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 13.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 14.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 20.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 21.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 27.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 28.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 34.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 35.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 41.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 42.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 48.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 49.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 55.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 56.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 62.day).strftime("%m/%d/%Y"))]

    @timesheet = Timesheet.new
  end

  def create
    contract = Contract.where(id: params[:timesheet][:contract_id]).first
    if contract.present?
      if check_valid_dates(contract, params[:timesheet][:start_date], params[:timesheet][:end_date])
        if contract.buy_contracts.first.candidate_id == current_candidate.id
          buy_contract = contract.buy_contracts.first
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

  def approve_timesheets
    @timesheets = current_candidate.timesheets.approved_timesheets
  end

  private

  def timesheet_params
    params.require(:timesheet).permit(:job_id, :user_id, :company_id, :contract_id, :status, :total_time, :start_date, :end_date, :submitted_date, :next_timesheet_created_date, :invoice_id, :timesheet_attachment, :candidate_name)
  end

  def check_valid_dates(contract, startdate, enddate)
    ts = contract.timesheets.order("created_at DESC").first
    nd = ts.present? ? ts.end_date + 1.day : contract.start_date
    if startdate.to_date <= nd && nd <= enddate.to_date
      true
    else
      flash[:errors] = ["You are able to submit timeshhet, You need to send timesheet of date #{nd} first." ]
      false
    end
  end

end
