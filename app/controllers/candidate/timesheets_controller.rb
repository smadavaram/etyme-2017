class Candidate::TimesheetsController < Candidate::BaseController

  def new
    @contracts = Contract.joins(:buy_contracts).where(buy_contracts: {candidate_id: current_candidate.id})

    @time_cycle = [(Time.now.beginning_of_week.strftime("%m/%d/%Y") +" - " + Time.now.end_of_week.strftime("%m/%d/%Y")),
                   ((Time.now.end_of_week + 7.day).strftime("%m/%d/%Y") +" - " + (Time.now.end_of_week + 14.day).strftime("%m/%d/%Y")),
                   ((Time.now.end_of_week + 21.day).strftime("%m/%d/%Y") +" - " + (Time.now.end_of_week + 28.day).strftime("%m/%d/%Y")),
                   ((Time.now.end_of_week + 35.day).strftime("%m/%d/%Y") +" - " + (Time.now.end_of_week + 42.day).strftime("%m/%d/%Y")),
                   ((Time.now.end_of_week + 49.day).strftime("%m/%d/%Y") +" - " + (Time.now.end_of_week + 56.day).strftime("%m/%d/%Y"))]

    # @buy_contract = BuyContract.find(params[:timesheet_id])
    # if @buy_contract.contract.timesheets.present?
    #   last_time = @buy_contract.contract.timesheets.order("created_at DESC").first
    #   @start_date = last_time.end_date + 1.days
    #   @end_date = @start_date + 7.days
    # else
    #   @start_date = @buy_contract.contract.start_date
    #   @end_date = @buy_contract.first_date_of_timesheet
    # end
    #
    # @timesheet = current_user.timesheets.new
  end

end
