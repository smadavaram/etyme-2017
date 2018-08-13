module Contracts
  class Cycle < Struct.new(:contract)
    delegate :contract_cycles, :timesheets, :invoices, :sell_contracts, :buy_contracts, :contract_salary_histories, :to => :contract

    def set_timesheet_submit
      # binding.pry
      if contract_cycle_ts.present?
        next_date =  get_next_date(ts_time_sheet_frequency, ts_date_1, ts_date_2, ts_end_of_month, ts_day_of_week, contract_cycle_ts.cycle_date )
        start_date = contract_cycle_ts.end_date + 1.day
      else
        # binding.pry
        next_date =  get_next_date(ts_time_sheet_frequency, ts_date_1, ts_date_2, ts_end_of_month, ts_day_of_week, contract.start_date-1.day)
        start_date = contract.start_date
      end
      # binding.pry
      ta_next_date =  get_next_date(ta_time_sheet_frequency, ta_date_1, ta_date_2, ta_end_of_month, ta_day_of_week, Time.now-1.day)
      while next_date <= Time.now+10.days && next_date <= contract.end_date
        # binding.pry
        next_next_date =  get_next_date(ts_time_sheet_frequency, ts_date_1, ts_date_2, ts_end_of_month, ts_day_of_week, next_date)
        if ts_time_sheet_frequency == 'weekly'
          end_date = ts_date_of_next(ts_day_of_week, next_date).end_of_day
        elsif ts_time_sheet_frequency == 'twice a month'
          end_date = twice_a_month_submit_date(ts_date_1, ts_date_2, start_date) 
        else
          end_date = next_date
        end
        start_date = next_date
        # binding.pry
        cycle = add_cycle("Timesheet submit", next_date, start_date, end_date, "TimesheetSubmit", buy_contract.candidate_id, next_next_date, "TimesheetApprove", ta_next_date)
        add_timesheet(start_date, next_date, buy_contract.candidate.full_name, buy_contract.candidate_id, cycle.id)
        con_cycle_ta_start_date = Timesheet.set_con_cycle_ta_date(buy_contract, cycle)
        set_timesheet_approve(cycle,con_cycle_ta_start_date)
        invoice_generate(cycle)
        next_date = next_next_date
        start_date = cycle.end_date + 1.day
      end
    end

    def set_timesheet_approve(con_cycle,con_cycle_ta_start_date)
      # binding.pry
      con_cycle_ta = ContractCycle.find_by(contract_id: con_cycle.contract_id,
                                          start_date: con_cycle_ta_start_date,
                                          end_date: con_cycle_ta_start_date&.end_of_day&.in_time_zone("Chennai"),
                                          company_id: sell_contract.company_id,
                                          note: "Timesheet Approve",
                                          cycle_type: "TimesheetApprove",
                                          next_action: "InvoiceGenerate"
      )
      # binding.pry
      unless con_cycle_ta
        con_cycle_ta = ContractCycle.create(contract_id: con_cycle.contract_id,
                                            start_date: con_cycle_ta_start_date,
                                            end_date: con_cycle_ta_start_date.end_of_day,
                                            company_id: sell_contract.company_id,
                                            note: "Timesheet Approve",
                                            cycle_date: Time.now,
                                            cycle_type: "TimesheetApprove",
                                            next_action: "InvoiceGenerate"
        )
      end
    end

    # def invoice_generate
    #   if contract_cycle_ig.present?
    #     next_date =  get_next_date(ig_frequency, ig_date_1, ig_date_2, ig_end_of_month, ig_day_of_week, contract_cycle_ig.cycle_date )
    #     start_date = contract_cycle_ig.end_date + 1.day
    #   else
    #     next_date =  get_next_date(ig_frequency, ig_date_1, ig_date_2, ig_end_of_month, ig_day_of_week, contract.start_date-1.day)
    #     start_date = contract.start_date
    #   end

    #   ig_next_date =  get_next_date(ig_frequency, ig_date_1, ig_date_2, ig_end_of_month, ig_day_of_week, Time.now-1.day)

    #   while start_date <= Time.now
    #     next_next_date =  get_next_date(ts_time_sheet_frequency, ts_date_1, ts_date_2, ts_end_of_month, ts_day_of_week, next_date)
    #     cycle = add_cycle("Invoice Generate", next_date, start_date, next_date, "InvoiceGenerate", buy_contract.candidate_id, next_next_date, "InvoicePaid", ig_next_date)
    #     add_invoice(start_date, next_date, cycle.id)

    #     next_date = next_next_date
    #     start_date = cycle.end_date + 1.day
    #   end
    # end

    def invoice_generate(con_cycle)
      end_date = Invoice.set_con_cycle_invoice_date(sell_contract, con_cycle).end_of_day
      cycle = add_invoice_cycle("Invoice Generate", end_date, con_cycle.start_date, end_date, "InvoiceGenerate", nil, end_date, "InvoicePaid", end_date, sell_contract.company_id)
      # binding.pry
      add_invoice(con_cycle.start_date, end_date, cycle.id)
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
      t = Timesheet.create(
          contract_id: contract_id,
          start_date: start_date,
          end_date: next_date,
          candidate_name: candidate_name,
          candidate_id: candidate_id,
          ts_cycle_id: cycle_id
      )
      # binding.pry
    end

    def add_invoice_cycle(note, cycle_date, start_date, end_date, cycle_type, candidate_id, next_date, next_action, next_action_date, company_id)
      contract_cycle = contract_cycles.find_by(note: note,
                        end_date: end_date.in_time_zone("Chennai"),
                        cycle_type: cycle_type,
                        candidate_id: candidate_id,
                        company_id: company_id,
                        next_action: next_action,
                        contract_id: contract_id
                        )
      # binding.pry
      unless contract_cycle
       contract_cycle = contract_cycles.create(note: note,
                         cycle_date: cycle_date,
                         start_date: start_date,
                         end_date: end_date,
                         cycle_type: cycle_type,
                         candidate_id: candidate_id,
                         next_date: next_date,
                         next_action: next_action,
                         next_action_date: next_action_date,
                         company_id: company_id
                      )
      end
      return contract_cycle
      # binding.pry
    end

    def add_invoice(start_date, end_date, cycle_id)
      invoice = Invoice.find_by(
                  contract_id: contract_id,
                  end_date: end_date.to_date,
                  ig_cycle_id: cycle_id,
                )
      unless invoice
        Invoice.create(
            contract_id: contract_id,
            start_date: start_date,
            end_date: end_date,
            ig_cycle_id: cycle_id,
            rate: sell_payrate
        )
      end
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

    def sell_contract
      sell_contracts.first
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
      sell_contract.invoice_terms_period
    end

    def ig_date_1
      sell_contract.invoice_date_1
    end

    def ig_date_2
      sell_contract.invoice_date_2
    end

    def ig_end_of_month
      sell_contract.invoice_end_of_month
    end

    def ig_day_of_week
      sell_contract.invoice_day_of_week
    end

    def buy_payrate
      buy_contract.payrate
    end

    def sell_payrate
      sell_contract.customer_rate
    end

    def get_next_date(time_sheet_frequency, date_1, date_2, end_of_month, day_of_week, last_date = Date.today - 1.day )
      # binding.pry
      # if time_sheet_frequency == "daily" || time_sheet_frequency == "immediately"
        time_sheet_date = last_date + 1.days
      # elsif time_sheet_frequency == "weekly"
      #   time_sheet_date = date_of_next(day_of_week, last_date)
      # elsif time_sheet_frequency == "biweekly"
      #   time_sheet_date = date_of_next(day_of_week, (date_of_next(day_of_week, last_date)))
      # elsif  time_sheet_frequency == "twice a month"
      #   time_sheet_date = date_1.day == last_date.day ? (end_of_month ? last_date.end_of_month : (last_date.change(day: date_2.day))) : ((last_date + 1.month).change(day: date_1.day))
      # elsif  time_sheet_frequency == "monthly"
      #   if end_of_month
      #     time_sheet_date = last_date.end_of_month
      #   else
      #     time_sheet_date = last_date.change(day: date_1.day)
      #   end
      # end
      return time_sheet_date
    end

    def ts_date_of_next(day_of_week,start_date)
      day_of_week = DateTime.parse(day_of_week).wday
      date = start_date.to_date + ((day_of_week - start_date.to_date.wday) % 7)
      if day_of_week >= start_date.wday
        (date - start_date.to_date <= 5) && start_date.wday != 0 ? date+7.days : date
      else
        date
      end
    end

    def twice_a_month_submit_date(ts_date_1, ts_date_2, start_date)
      # binding.pry
      day_1 = ts_date_1.strftime("%d").to_i
      day_2 = ts_date_2.strftime("%d").to_i.present? ? ts_date_2.strftime("%d").to_i : 0
      if start_date.strftime("%d").to_i <= day_1
        day = ts_date_1&.to_i
        next_month_year = start_date
        month = next_month_year&.strftime("%m").to_i
        year = next_month_year&.strftime("%Y").to_i
      elsif start_date.strftime("%d").to_i > day_1 && start_date.strftime("%d").to_i <= day_2
        day = ts_date_2&.to_i
        next_month_year = start_date
        month = next_month_year&.strftime("%m").to_i
        year = next_month_year&.strftime("%Y").to_i
      elsif start_date.strftime("%d").to_i > day_2 && !ts_end_of_month
        day = ts_date_1&.to_i
        next_month_year = start_date+1.month
        month = next_month_year&.strftime("%m").to_i
        year = next_month_year&.strftime("%Y").to_i
      elsif ts_end_of_month
        next_month_year = start_date.end_of_month
        day = next_month_year.strftime('%e').to_i
        month = next_month_year&.strftime("%m").to_i
        year = next_month_year&.strftime("%Y").to_i
      end
      con_cycle_ta_start_date = DateTime.new(year, month, day)
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