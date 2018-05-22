module Contracts
  class Cycle < Struct.new(:contract)
    delegate :contract_cycles, :timesheets, :invoices, :sell_contracts, :buy_contracts, :contract_salary_histories, :to => :contract

    def set_timesheet_submit
      if contract_cycle_ts.present?
        next_date =  get_next_date(ts_time_sheet_frequency, ts_date_1, ts_date_2, ts_end_of_month, ts_day_of_week, contract_cycle_ts.cycle_date )
        start_date = contract_cycle_ts.end_date + 1.day
      else
        next_date =  get_next_date(ts_time_sheet_frequency, ts_date_1, ts_date_2, ts_end_of_month, ts_day_of_week, contract.start_date-1.day)
        start_date = contract.start_date
      end

      ta_next_date =  get_next_date(ta_time_sheet_frequency, ta_date_1, ta_date_2, ta_end_of_month, ta_day_of_week, Time.now-1.day)
      while next_date <= Time.now
        next_next_date =  get_next_date(ts_time_sheet_frequency, ts_date_1, ts_date_2, ts_end_of_month, ts_day_of_week, next_date)
        cycle = add_cycle("Timesheet submit", next_date, start_date, next_date, "TimesheetSubmit", buy_contract.candidate_id, next_next_date, "TimesheetApprove", ta_next_date)
        add_timesheet(start_date, next_date, buy_contract.candidate.full_name, buy_contract.candidate_id, cycle.id)

        next_date = next_next_date
        start_date = cycle.end_date + 1.day
      end
    end

    def set_timesheet_approve
    end

    def invoice_generate
      if contract_cycle_ig.present?
        next_date =  get_next_date(ig_frequency, ig_date_1, ig_date_2, ig_end_of_month, ig_day_of_week, contract_cycle_ig.cycle_date )
        start_date = contract_cycle_ig.end_date + 1.day
      else
        next_date =  get_next_date(ig_frequency, ig_date_1, ig_date_2, ig_end_of_month, ig_day_of_week, contract.start_date-1.day)
        start_date = contract.start_date
      end

      ig_next_date =  get_next_date(ig_frequency, ig_date_1, ig_date_2, ig_end_of_month, ig_day_of_week, Time.now-1.day)

      while start_date <= Time.now
        next_next_date =  get_next_date(ts_time_sheet_frequency, ts_date_1, ts_date_2, ts_end_of_month, ts_day_of_week, next_date)
        cycle = add_cycle("Invoice Generate", next_date, start_date, next_date, "InvoiceGenerate", buy_contract.candidate_id, next_next_date, "InvoicePaid", ig_next_date)
        add_invoice(start_date, next_date, cycle.id)

        next_date = next_next_date
        start_date = cycle.end_date + 1.day
      end
    end

    def find_next_date(ts_time_sheet_frequency, ts_date_1, ts_date_2, ts_end_of_month, ts_day_of_week, next_date)
      get_next_date(ts_time_sheet_frequency, ts_date_1, ts_date_2, ts_end_of_month, ts_day_of_week, next_date)
    end

    private

    def add_cycle(note, cycle_date, start_date, end_date, cycle_type, candidate_id, next_date, next_action, next_action_date)
      contract_cycles.create(note: note,
                             cycle_date: cycle_date,
                             start_date: start_date,
                             end_date: end_date,
                             cycle_type: cycle_type,
                             candidate_id: candidate_id,
                             next_date: next_date,
                             next_action: next_action,
                             next_action_date: next_action_date
      )
    end

    def add_timesheet(start_date, next_date, candidate_name, candidate_id, cycle_id)
      Timesheet.create(
          contract_id: contract_id,
          start_date: start_date,
          end_date: next_date,
          candidate_name: candidate_name,
          candidate_id: candidate_id,
          ts_cycle_id: cycle_id
      )
    end

    def add_invoice(start_date, next_date, cycle_id)
      Invoice.create(
          contract_id: contract_id,
          start_date: start_date,
          end_date: next_date,
          ig_cycle_id: cycle_id,
          rate: buy_payrate
      )
    end

    def contract_id
      contract.id
    end

    def contract_cycle_ts
      contract_cycles.where(cycle_type: "TimesheetSubmit").order("created_at DESC").first
    end

    def contract_cycle_ig
      contract_cycles.where(cycle_type: "InvoiceGenerate").order("created_at DESC").first
    end

    def buy_contract
      buy_contracts.first
    end

    def ts_time_sheet_frequency
      buy_contract.time_sheet
    end

    def ts_date_1
      buy_contract.ts_date_1
    end

    def ts_date_2
      buy_contract.ts_date_2
    end

    def ts_end_of_month
      buy_contract.ts_end_of_month
    end

    def ts_day_of_week
      buy_contract.ts_day_of_week
    end

    def ta_time_sheet_frequency
      buy_contract.ts_approve
    end

    def ta_date_1
      buy_contract.ta_date_1
    end

    def ta_date_2
      buy_contract.ta_date_2
    end

    def ta_end_of_month
      buy_contract.ta_end_of_month
    end

    def ta_day_of_week
      buy_contract.ta_day_of_week
    end

    def ig_frequency
      buy_contract.invoice_recepit
    end

    def ig_date_1
      buy_contract.ir_date_1
    end

    def ig_date_2
      buy_contract.ir_date_2
    end

    def ig_end_of_month
      buy_contract.ir_end_of_month
    end

    def ig_day_of_week
      buy_contract.ir_day_of_week
    end

    def buy_payrate
      buy_contract.payrate
    end

    def get_next_date(time_sheet_frequency, date_1, date_2, end_of_month, day_of_week, last_date = Date.today - 1.day )
      if time_sheet_frequency == "daily" || time_sheet_frequency == "immediately"
        time_sheet_date = last_date + 1.days
      elsif time_sheet_frequency == "weekly"
        time_sheet_date = date_of_next(day_of_week, last_date)
      elsif time_sheet_frequency == "biweekly"
        time_sheet_date = date_of_next(day_of_week, (date_of_next(day_of_week, last_date)))
      elsif  time_sheet_frequency == "twice a month"
        time_sheet_date = date_1.day == last_date.day ? (end_of_month ? last_date.end_of_month : (last_date.change(day: date_2.day))) : ((last_date + 1.month).change(day: date_1.day))
      elsif  time_sheet_frequency == "monthly"
        if end_of_month
          time_sheet_date = last_date.end_of_month
        else
          time_sheet_date = last_date.change(day: date_1.day)
        end
      end
      return time_sheet_date
    end

    def date_of_next(day, current_date)
      s = current_date.wday
      n = Date.parse(day).wday
      if s < n
        i =  n - s
      elsif s > n
        i =  n + ( 7 - s )
      else
        i =  7
      end
      current_date + i.days
    end
  end
end