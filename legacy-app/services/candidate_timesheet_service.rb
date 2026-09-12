# frozen_string_literal: true

class CandidateTimesheetService
  include CandidateHelper

  def initialize(candidate)
    @candidate = candidate
  end

  def filter_timesheets(params)
    cycle_frequency = params[:cycle_frequency].present? ? params[:cycle_frequency] : 'weekly'
    tab = params[:tab].present? ? params[:tab] : 'open_timesheets'

    timesheets = Timesheet.timesheet_by_frequency(cycle_frequency, @candidate).send(tab)

    if params[:cycle_frequency].present?
      timesheets = Timesheet.timesheet_by_frequency(params[:cycle_frequency], @candidate).send(tab)
    elsif if_all?(params[:contract_id]) && if_all?(params[:cycle_id])
      timesheets = @candidate.timesheets.send(tab)
    elsif (params[:contract_id] != 'all') && if_all?(params[:cycle_id])
      timesheets = @candidate.timesheets.send(tab).where(id: @candidate.contract_cycles.where(contract_id: params[:contract_id], cycle_type: 'TimesheetSubmit', cyclable_type: 'Timesheet').pluck(:cyclable_id))
    elsif params[:cycle_id] != 'all'
      timesheets = @candidate.timesheets.send(tab).where(id: @candidate.contract_cycles.where(id: params[:cycle_id], cyclable_type: 'Timesheet').pluck(:cyclable_id))
    end

    timesheets = timesheets.paginate(page: params[:page], per_page: 10) unless tab == 'open_timesheets'
    { success: true, timesheets: timesheets, tab: tab }
  end

  def get_timesheets_by_date_range(date_range)
    dates = date_range.split(' - ')
    start_date = Date.strptime(dates[0].tr('/', '-'), '%m-%d-%Y')
    end_date = Date.strptime(dates[1].tr('/', '-'), '%m-%d-%Y')
    @candidate.timesheets.includes(:contract).open_timesheets.where(
      '(start_date >= ? AND start_date <= ?) OR (end_date >= ? AND end_date <= ?)',
      start_date, end_date, start_date, end_date
    )
  end

  def create_timesheet(timesheet_params, days)
    contract = Contract.where(id: timesheet_params[:contract_id]).first
    unless contract.present?
      return { success: false, errors: ['Contract Invalid'] }
    end

    unless check_valid_dates(contract, timesheet_params[:start_date], timesheet_params[:end_date])
      return { success: false, errors: @date_errors }
    end

    unless contract.buy_contract.candidate_id == @candidate.id
      return { success: false, errors: ['Contract Invalid'] }
    end

    buy_contract = contract.buy_contract
    unless buy_contract.first_date_of_timesheet <= Time.now
      return { success: false, errors: ["You are able to submit timesheet for #{contract.title} on #{buy_contract.first_date_of_timesheet.strftime('%d/%m/%Y')}"] }
    end

    timesheet = @candidate.timesheets.new(timesheet_params)
    timesheet.days = days
    timesheet.total_time = days.values.map(&:to_i).sum

    if timesheet.save
      next_date = get_next_date(
        buy_contract.first_date_of_timesheet,
        buy_contract.time_sheet,
        buy_contract.ts_date_1,
        buy_contract.ts_date_2,
        buy_contract.ts_end_of_month,
        buy_contract.ts_day_of_week,
        timesheet.end_date
      )
      buy_contract.update(first_date_of_timesheet: next_date)
      { success: true, timesheet: timesheet, message: 'Successfully Created' }
    else
      { success: false, errors: timesheet.errors.full_messages }
    end
  end

  def submit_timesheet(timesheet)
    if timesheet.end_date <= DateTime.now
      if timesheet.submitted
        { success: true, message: 'Timesheet submitted successfully' }
      else
        { success: false, errors: timesheet.errors.full_messages }
      end
    else
      { success: false, errors: ['You cannot submit the before time.'] }
    end
  end

  private

  def check_valid_dates(contract, startdate, enddate)
    ts = contract.timesheets.order('created_at DESC').first
    nd = ts.present? ? ts.end_date + 1.day : contract.start_date
    if startdate.to_date <= nd && nd <= enddate.to_date
      true
    else
      @date_errors = ["You are able to submit timesheet, You need to send timesheet of date #{nd} first."]
      false
    end
  end

  def if_all?(value)
    value == 'all'
  end
end
