class Candidate::TimesheetsController < Candidate::BaseController

  include CandidateHelper

  def index
    @timesheets = current_candidate.timesheets
  end

  def new
    @contracts = Contract.joins(:buy_contracts).where(buy_contracts: {candidate_id: current_candidate.id})
    dates = Time.now-1.month
    @time_cycle = [((dates.beginning_of_week-2.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week - 2.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week - 1.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 5.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 6.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 12.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 13.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 19.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 20.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 26.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 27.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 33.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 34.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 40.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 41.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 47.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 48.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 54.day).strftime("%m/%d/%Y")),
                   ((dates.end_of_week + 55.day).strftime("%m/%d/%Y") +" - " + (dates.end_of_week + 61.day).strftime("%m/%d/%Y"))]

    @timesheet = Timesheet.new
  end

  def create
    contract = Contract.where(id: params[:timesheet][:contract_id]).first
    if contract.present? && contract.buy_contracts.first.candidate_id == current_candidate.id
      buy_contract = contract.buy_contracts.first
      if buy_contract.first_date_of_timesheet <= Time.now
        @timesheet = current_candidate.timesheets.new(timesheet_params)
        @timesheet.days = params[:timesheet][:days]
        @timesheet.total_time = params[:timesheet][:days].values.map(&:to_i).sum
        if @timesheet.save
          next_date = get_next_date(buy_contract.first_date_of_timesheet, buy_contract.time_sheet, buy_contract.date_1, buy_contract.date_2, buy_contract.end_of_month, buy_contract.ts_day_of_week, @timesheet.end_date)
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

  private

  def timesheet_params
    params.require(:timesheet).permit(:job_id, :user_id, :company_id, :contract_id, :status, :total_time, :start_date, :end_date, :submitted_date, :next_timesheet_created_date, :invoice_id, :timesheet_attachment, :candidate_name)
  end

end
