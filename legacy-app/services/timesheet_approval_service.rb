# frozen_string_literal: true

class TimesheetApprovalService
  def initialize(current_user, company)
    @current_user = current_user
    @company = company
  end

  def filter_client_timesheets(params)
    cycle_frequency = params[:cycle_frequency].present? ? params[:cycle_frequency] : 'weekly'
    tab = params[:tab].present? ? params[:tab] : 'open_timesheets'

    timesheets = Timesheet.timesheet_by_frequency(cycle_frequency, @current_user).send(tab)

    if params[:cycle_frequency].present?
      timesheets = Timesheet.timesheet_by_frequency(params[:cycle_frequency], @current_user).send(tab)
    elsif if_all?(params[:contract_id]) && if_all?(params[:cycle_id])
      timesheets = @current_user.timesheets.send(tab)
    elsif (params[:contract_id] != 'all') && if_all?(params[:cycle_id])
      timesheets = @current_user.timesheets.send(tab).where(id: @current_user.contract_cycles.where(contract_id: params[:contract_id], cycle_type: 'TimesheetSubmit', cyclable_type: 'Timesheet').pluck(:cyclable_id))
    elsif params[:cycle_id] != 'all'
      timesheets = @current_user.timesheets.send(tab).where(id: @current_user.contract_cycles.where(id: params[:cycle_id], cyclable_type: 'Timesheet').pluck(:cyclable_id))
    end

    timesheets = timesheets.paginate(page: params[:page], per_page: 10) unless tab == 'open_timesheets'
    { success: true, timesheets: timesheets, tab: tab }
  end

  def approve(timesheet)
    if timesheet.approved!
      timesheet.contract_cycle.approved!
      timesheet.set_cost_and_time
      if (timesheet.contract_cycle.cycle_of_type == 'BuyContract') && timesheet.contract.sell_contract.present?
        Timesheet.transaction do
          dup_ts = timesheet.dup
          dup_ts.candidate = nil
          dup_ts.user = timesheet.contract.admin_user
          dup_ts.status = :submitted
          if dup_ts.save
            dup_cc = timesheet.contract_cycle.dup
            dup_cc.candidate = nil
            dup_cc.cyclable = dup_ts
            dup_cc.cycle_of = timesheet.contract.sell_contract
            dup_cc.user = timesheet.contract.admin_user
            if dup_cc.save
              timesheet.transactions.each do |tt|
                dup_tt = tt.dup
                dup_tt.timesheet = dup_ts
                dup_tt.save
              end
            end
          end
        end
      end
      { success: true, message: 'Successfully Approved The Timesheet' }
    else
      { success: false, errors: timesheet.errors.full_messages }
    end
  end

  def generate_invoice(timesheet_id)
    timesheet = @company.timesheets.approved_timesheets.where(id: timesheet_id).first
    unless timesheet.present?
      return { success: false, errors: ['Invalid Timesheet.'] }
    end

    timesheets = timesheet.contract.timesheets.approved_timesheets.where(invoice_id: nil)
    unless timesheets.present?
      return { success: false, errors: ['There is no approve timesheets.'] }
    end

    min_date = timesheets.minimum(:start_date)
    max_date = timesheets.maximum(:end_date)
    rate = timesheet.contract.sell_contract.today_rate.rate

    invoice = Invoice.new(
      contract_id: timesheet.contract_id,
      start_date: min_date,
      end_date: max_date,
      total_amount: (timesheets.pluck(:total_time).sum * rate),
      total_approve_time: timesheets.pluck(:total_time).sum,
      submitted_on: Time.now,
      rate: rate
    )

    if invoice.save
      timesheets.update_all(invoice_id: invoice.id)
      { success: true, invoice: invoice, message: 'Invoice Generated successfully.' }
    else
      { success: false, errors: invoice.errors.full_messages }
    end
  end

  private

  def if_all?(value)
    value == 'all'
  end
end
