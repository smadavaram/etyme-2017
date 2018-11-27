module Contracts
  class Cycle < Struct.new(:contract)
    delegate :contract_cycles, :timesheets, :invoices, :sell_contracts, :buy_contracts, :contract_salary_histories, :to => :contract

    def set_timesheet_submit(count)

      @count = count
      if contract_cycle_ts.present?
        next_date =  get_next_date(ts_time_sheet_frequency, ts_date_1, ts_date_2, ts_end_of_month, ts_day_of_week, contract_cycle_ts.cycle_date )
        start_date = contract.start_date+ @count
      else
  
        next_date =  get_next_date(ts_time_sheet_frequency, ts_date_1, ts_date_2, ts_end_of_month, ts_day_of_week, contract.start_date-1.day)
        start_date = contract.start_date
      end

      ta_next_date =  get_next_date(ta_time_sheet_frequency, ta_date_1, ta_date_2, ta_end_of_month, ta_day_of_week, Time.now-1.day)
      while  next_date <= contract.end_date
  
        next_next_date =  get_next_date(ts_time_sheet_frequency, ts_date_1, ts_date_2, ts_end_of_month, ts_day_of_week, next_date)
        if ts_time_sheet_frequency == 'weekly'
          end_date = ts_date_of_next(ts_day_of_week, next_date, ts_time_sheet_frequency).end_of_day
        elsif ts_time_sheet_frequency == 'twice a month'
          end_date = twice_a_month_submit_date(ts_date_1, ts_date_2, start_date) 
        elsif ts_time_sheet_frequency == 'monthly'
          end_date = monthly_submit_date(ts_date_1, contract.start_date+ @count, ts_end_of_month)  
        else
          end_date = next_date
        end
        start_date = next_date
  
        cycle = add_cycle("Timesheet submit", next_date, start_date, end_date, "TimesheetSubmit", buy_contract.candidate_id, next_next_date, "TimesheetApprove", ta_next_date)
        add_timesheet(start_date, next_date, buy_contract.candidate.full_name, buy_contract.candidate_id, cycle.id)
        con_cycle_ta_start_date = Timesheet.set_con_cycle_ta_date(buy_contract, cycle)

        set_timesheet_approve(cycle,con_cycle_ta_start_date)
        # invoice_generate(cycle)
        
        #salary cycles
        # binding.pry
        salary_cycle = add_salary_cycle
        add_salary(salary_cycle)
        # con_cycle_sp_start_date = Salary.set_con_cycle_sp_date(buy_contract, salary_cycle)
        # set_salary_process(salary_cycle,con_cycle_sp_start_date)

        #commission cycles
        # commission_cycle = add_commission_cycle
        # con_cycle_com_pro_start_date = ContractSaleCommision.set_con_cycle_com_pro_date(buy_contract, commission_cycle)
        # set_commission_process(commission_cycle, con_cycle_com_pro_start_date)

        # # #vendor bill cyles
        # vendor_bill_cycle = add_vendor_bill_cycle
        # con_cycle_vp_pro_start_date = VendorBill.set_con_cycle_vp_pro_date(buy_contract, vendor_bill_cycle)
        # set_vendor_payment_process(vendor_bill_cycle, con_cycle_vp_pro_start_date )

        # # #client bill cycles
        # client_bill_cycle = add_client_bill_cycle
        # con_cycle_cp_pro_start_date = ClientBill.set_con_cycle_cp_pro_date(buy_contract, client_bill_cycle)
        # set_client_payment_process(client_bill_cycle, con_cycle_cp_pro_start_date )

        # # #client expense cycles
        # client_expense_cycle  = add_client_expense_cycle  
        # add_client_expense(start_date, next_date, buy_contract.candidate_id, client_expense_cycle.id)     
        # con_cycle_ce_ap_start_date = ClientExpense.set_con_cycle_ce_ap_date(sell_contract, client_expense_cycle)
        # set_client_expense_approve(cycle,con_cycle_ce_ap_start_date)
        # client_expense_invoice_generate(client_expense_cycle)


        next_date = next_next_date
        start_date = cycle.end_date + 1.day
        @count += 1
      end
    end

    def set_salary_clear_date
      if contract_cycle_sclr.present?
        if sclr_frequency == 'daily'
          start_date = contract_cycle_sclr.start_date +  1.day
        elsif sclr_frequency == 'weekly'
          start_date = ts_date_of_next(sclr_day_of_week, contract.start_date+@count, sclr_frequency)
        elsif sclr_frequency == 'biweekly'
          start_date = date_of_next_two_week(sclr_day_of_week, contract.start_date+@count, sclr_frequency)
        elsif sclr_frequency == 'monthly'
          start_date = monthly_submit_date(sclr_date_1, contract.start_date+@count, sclr_end_of_month)
        elsif sclr_frequency == 'twice a month'
          start_date = twice_a_month_submit_date(sclr_date_1, sclr_date_2, contract.start_date+@count)
        else
          start_date = contract_cycle_sclr.start_date +  1.day
        end
      else
        if sclr_frequency == 'daily'
          start_date = contract.start_date
        elsif sclr_frequency == 'weekly'
          start_date = ts_date_of_next(sclr_day_of_week,contract.start_date, sclr_frequency)
        elsif sclr_frequency == 'biweekly'
          start_date = date_of_next_two_week(sclr_day_of_week, contract.start_date, sclr_frequency)
        elsif sclr_frequency == 'monthly'
          start_date = monthly_submit_date(sclr_date_1, contract.start_date, sclr_end_of_month)
        elsif sclr_frequency == 'twice a month'
          start_date = twice_a_month_submit_date(sclr_date_1, sclr_date_2, contract.start_date)
        else
          start_date = contract.start_date
        end  
      end
      # binding.pry
      return start_date
    end

    def set_commission_calculation_date
      if contract_cycle_com_cal.present?
        if com_cal_frequency == 'daily'
          start_date = contract_cycle_com_cal.start_date +  1.day
        elsif com_cal_frequency == 'weekly'
    
          start_date = ts_date_of_next(com_cal_day_of_week, contract.start_date+@count, com_cal_frequency)
        elsif com_cal_frequency == 'monthly'
          start_date = monthly_submit_date(com_cal_date_1, contract.start_date+@count, com_cal_end_of_month)
        elsif com_cal_frequency == 'twice a month'
          start_date = twice_a_month_submit_date(com_cal_date_1, com_cal_date_2, contract.start_date+@count)
        else
          start_date = contract_cycle_com_cal.start_date +  1.day
        end
      else
        if com_cal_frequency == 'daily'
          start_date = contract.start_date
        elsif com_cal_frequency == 'weekly'
          start_date = ts_date_of_next(com_cal_day_of_week,contract.start_date, com_cal_frequency)
        elsif com_cal_frequency == 'monthly'
          start_date = monthly_submit_date(com_cal_date_1, contract.start_date,com_cal_end_of_month)
        elsif com_cal_frequency == 'twice a month'
          start_date = twice_a_month_submit_date(com_cal_date_1, com_cal_date_2, contract.start_date)
        else
          start_date = contract.start_date
        end  
      end
      return start_date
    end

    def set_vendor_bill_calculation_date
      if contract_cycle_vendor_bill_cal.present?
        if vendor_bill_frequency == 'daily'
          start_date = contract_cycle_vendor_bill_cal.start_date +  1.day
        elsif vendor_bill_frequency == 'weekly'
          # binding.pry
          start_date = ts_date_of_next(vb_day_of_week, contract.start_date+@count, vendor_bill_frequency)
        elsif vendor_bill_frequency == 'monthly'
          start_date = monthly_submit_date(vb_date_1, contract.start_date+@count, vb_end_of_month)
        elsif vendor_bill_frequency == 'twice a month'
          start_date = twice_a_month_submit_date(vb_date_1, vb_date_2, contract.start_date+@count)
        else
          start_date = contract_cycle_vendor_bill_cal.start_date +  1.day
        end
      else
        if vendor_bill_frequency == 'daily'
          start_date = contract.start_date
        elsif vendor_bill_frequency == 'weekly'
          start_date = ts_date_of_next(vb_day_of_week,contract.start_date, vendor_bill_frequency)
        elsif vendor_bill_frequency == 'monthly'
          start_date = monthly_submit_date(vb_date_1, contract.start_date, vb_end_of_month)
        elsif vendor_bill_frequency == 'twice a month'
          start_date = twice_a_month_submit_date(vb_date_1, vb_date_2, contract.start_date)
        else
          start_date = contract.start_date
        end  
      end
      return start_date
    end

    def set_client_bill_calculation_date
      if contract_cycle_client_bill_cal.present?
        if client_bill_frequency == 'daily'
          start_date = contract_cycle_client_bill_cal.start_date +  1.day
        elsif client_bill_frequency == 'weekly'
          start_date = ts_date_of_next(cb_day_of_week, contract.start_date+@count, client_bill_frequency)
        elsif client_bill_frequency == 'monthly'
          start_date = monthly_submit_date(cb_date_1, contract.start_date+@count, cb_end_of_month)
        elsif client_bill_frequency == 'twice a month'
          start_date = twice_a_month_submit_date(cb_date_1, cb_date_2, contract.start_date+@count)
        else
          start_date = contract_cycle_client_bill_cal.start_date +  1.day
        end
      else
        if client_bill_frequency == 'daily'
          start_date = contract.start_date
        elsif client_bill_frequency == 'weekly'
          start_date = ts_date_of_next(cb_day_of_week,contract.start_date, client_bill_frequency)
        elsif client_bill_frequency == 'monthly'
          start_date = monthly_submit_date(cb_date_1, contract.start_date, cb_end_of_month)
        elsif client_bill_frequency == 'twice a month'
          start_date = twice_a_month_submit_date(cb_date_1, cb_date_2, contract.start_date)
        else
          start_date = contract.start_date
        end  
      end
      return start_date
    end

    def set_client_expense_calculation_date
      if contract_cycle_client_expense_cal.present?
        if client_expense_frequency == 'daily'
          start_date = contract_cycle_client_expense_cal.start_date +  1.day
        elsif client_expense_frequency == 'weekly'
          # binding.pry
          start_date = ts_date_of_next(ce_day_of_week, contract.start_date+@count, client_expense_frequency)
        elsif client_expense_frequency == 'monthly'
          start_date = monthly_submit_date(ce_date_1, contract.start_date+@count, ce_end_of_month)
        elsif client_expense_frequency == 'twice a month'
          start_date = twice_a_month_submit_date(ce_date_1, ce_date_2, contract.start_date+@count)
        else
          start_date = contract_cycle_client_expense_cal.start_date +  1.day
        end
      else
        if client_expense_frequency == 'daily'
          start_date = contract.start_date
        elsif client_expense_frequency == 'weekly'
          start_date = ts_date_of_next(ce_day_of_week,contract.start_date, client_expense_frequency)
        elsif client_expense_frequency == 'monthly'
          start_date = monthly_submit_date(ce_date_1, contract.start_date, ce_end_of_month)
        elsif client_expense_frequency == 'twice a month'
          start_date = twice_a_month_submit_date(ce_date_1, ce_date_2, contract.start_date)
        else
          start_date = contract.start_date
        end  
      end
      return start_date
    end

    def set_timesheet_approve(con_cycle,con_cycle_ta_start_date)
      con_cycle_ta_start_date = contract.end_date if con_cycle_ta_start_date > contract.end_date
      con_cycle_ta = ContractCycle.find_by(contract_id: con_cycle.contract_id,
                                          start_date: con_cycle_ta_start_date,
                                          end_date: con_cycle_ta_start_date&.end_of_day&.in_time_zone("Chennai"),
                                          company_id: sell_contract.company_id,
                                          note: "Timesheet Approve",
                                          cycle_type: "TimesheetApprove",
                                          next_action: "InvoiceGenerate"
      )

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

    def set_salary_process(con_cycle,con_cycle_sp_start_date)

      con_cycle_sp_start_date = contract.end_date if con_cycle_sp_start_date > contract.end_date
      con_cycle_sp = ContractCycle.find_by(contract_id: con_cycle.contract_id,
                                          start_date: con_cycle_sp_start_date,
                                          end_date: con_cycle_sp_start_date&.end_of_day&.in_time_zone("Chennai"),
                                          company_id: sell_contract.company_id,
                                          note: "Salary process",
                                          cycle_type: "SalaryProcess",
                                          next_action: "SalaryClear"
      )

      unless con_cycle_sp
        con_cycle_sp = ContractCycle.create(contract_id: con_cycle.contract_id,
                                            start_date: con_cycle_sp_start_date,
                                            end_date: con_cycle_sp_start_date.end_of_day,
                                            company_id: sell_contract.company_id,
                                            note: "Salary process",
                                            cycle_date: Time.now,
                                            cycle_type: "SalaryProcess",
                                            next_action: "SalaryClear"
        )
      end
    end

    def set_commission_process(con_cycle,con_cycle_com_pro_start_date)

      con_cycle_com_pro_start_date = contract.end_date if con_cycle_com_pro_start_date > contract.end_date
      con_cycle_com_pro = ContractCycle.find_by(contract_id: con_cycle.contract_id,
                                          start_date: con_cycle_com_pro_start_date,
                                          end_date: con_cycle_com_pro_start_date&.end_of_day&.in_time_zone("Chennai"),
                                          company_id: sell_contract.company_id,
                                          note: "Commission process",
                                          cycle_type: "CommissionProcess",
                                          next_action: "CommissionClear"
      )

      unless con_cycle_com_pro
        con_cycle_com_pro = ContractCycle.create(contract_id: con_cycle.contract_id,
                                            start_date: con_cycle_com_pro_start_date,
                                            end_date: con_cycle_com_pro_start_date.end_of_day,
                                            company_id: sell_contract.company_id,
                                            note: "Commission process",
                                            cycle_date: Time.now,
                                            cycle_type: "CommissionProcess",
                                            next_action: "CommissionClear"
        )
      end
    end

    def set_vendor_payment_process(con_cycle,con_cycle_vp_pro_start_date)

      con_cycle_vp_pro_start_date = contract.end_date if con_cycle_vp_pro_start_date > contract.end_date
      con_cycle_vp_pro = ContractCycle.find_by(contract_id: con_cycle.contract_id,
                                          start_date: con_cycle_vp_pro_start_date,
                                          end_date: con_cycle_vp_pro_start_date&.end_of_day&.in_time_zone("Chennai"),
                                          company_id: sell_contract.company_id,
                                          note: "VendorPayment process",
                                          cycle_type: "VendorPaymentProcess",
                                          next_action: "VendorPaymentClear"
      )

      unless con_cycle_vp_pro
        con_cycle_vp_pro = ContractCycle.create(contract_id: con_cycle.contract_id,
                                            start_date: con_cycle_vp_pro_start_date,
                                            end_date: con_cycle_vp_pro_start_date.end_of_day,
                                            company_id: sell_contract.company_id,
                                            note: "VendorPayment process",
                                            cycle_date: Time.now,
                                            cycle_type: "VendorPaymentProcess",
                                            next_action: "VendorPaymentClear"
        )
      end
    end


    def set_client_payment_process(con_cycle,con_cycle_cp_pro_start_date)

      con_cycle_cp_pro_start_date = contract.end_date if con_cycle_cp_pro_start_date > contract.end_date
      con_cycle_cp_pro = ContractCycle.find_by(contract_id: con_cycle.contract_id,
                                          start_date: con_cycle_cp_pro_start_date,
                                          end_date: con_cycle_cp_pro_start_date&.end_of_day&.in_time_zone("Chennai"),
                                          company_id: sell_contract.company_id,
                                          note: "ClientPayment process",
                                          cycle_type: "ClientPaymentProcess",
                                          next_action: "ClientPaymentClear"
      )

      unless con_cycle_cp_pro
        con_cycle_cp_pro = ContractCycle.create(contract_id: con_cycle.contract_id,
                                            start_date: con_cycle_cp_pro_start_date,
                                            end_date: con_cycle_cp_pro_start_date.end_of_day,
                                            company_id: sell_contract.company_id,
                                            note: "ClientPayment process",
                                            cycle_date: Time.now,
                                            cycle_type: "ClientPaymentProcess",
                                            next_action: "ClientPaymentClear"
        )
      end
    end

    def set_client_expense_approve(con_cycle,con_cycle_ce_ap_start_date)
      con_cycle_ce_ap_start_date = contract.end_date if con_cycle_ce_ap_start_date > contract.end_date
      con_cycle_ce_ap = ContractCycle.find_by(contract_id: con_cycle.contract_id,
                                          start_date: con_cycle_ce_ap_start_date,
                                          end_date: con_cycle_ce_ap_start_date&.end_of_day&.in_time_zone("Chennai"),
                                          company_id: sell_contract.company_id,
                                          note: "ClientExpense Approve",
                                          cycle_type: "ClientExpenseApprove",
                                          next_action: "CleintExpenseInvoice"
      )
      unless con_cycle_ce_ap
        con_cycle_ce_ap = ContractCycle.create(contract_id: con_cycle.contract_id,
                                            start_date: con_cycle_ce_ap_start_date,
                                            end_date: con_cycle_ce_ap_start_date.end_of_day,
                                            company_id: sell_contract.company_id,
                                            note: "ClientExpense Approve",
                                            cycle_date: Time.now,
                                            cycle_type: "ClientExpenseApprove",
                                            next_action: "CleintExpenseInvoice"
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

      add_invoice(con_cycle.start_date, end_date, cycle.id, 0)
    end

    def client_expense_invoice_generate(con_cycle)
      end_date = ClientExpense.set_con_cycle_ce_in_date(sell_contract, con_cycle).end_of_day
      cycle = add_invoice_cycle("ClientExpense Invoice", end_date, con_cycle.start_date, end_date, "ClientExpenseInvoice", nil, end_date, "ClientExpense Paid", end_date, sell_contract.company_id)

      add_invoice(con_cycle.start_date, end_date, cycle.id, 1)
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
    end

    def add_client_expense(start_date, next_date, candidate_id, cycle_id)
      t = ClientExpense.create(
          contract_id: contract_id,
          start_date: start_date,
          end_date: next_date,
          candidate_id: candidate_id,
          ce_cycle_id: cycle_id,
          company_id: contract.company_id
      )

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
      # binding.pry
      return contract_cycle

    end

    def add_invoice(start_date, end_date, cycle_id, type)
      invoice = Invoice.find_by(
                  contract_id: contract_id,
                  end_date: end_date.to_date,
                  ig_cycle_id: cycle_id,
                  invoice_type: type
                )
      unless invoice
        Invoice.create(
            contract_id: contract_id,
            start_date: start_date,
            end_date: end_date,
            ig_cycle_id: cycle_id,
            rate: sell_payrate,
            invoice_type: type
        )
      end
    end

    def add_salary_cycle
      # binding.pry
      if ['weekly', 'biweekly'].include? sclr_frequency
        doc_date =  set_salary_clear_date
        end_date = doc_date - buy_contract.payment_term.to_i
        start_date = end_date - (sclr_frequency == 'weekly' ? 6.days : 13.days)
      elsif  sclr_frequency == 'monthly'
        date = set_salary_clear_date
        doc_date = date + buy_contract.payment_term.to_i.months

        end_date = Date.new( (doc_date-buy_contract.payment_term.to_i.months).year, (doc_date-buy_contract.payment_term.to_i.months).month, buy_contract.term_no.to_i )

        start_date = end_date - 1.month+1
      elsif sclr_frequency == 'twice a month'
        date = set_salary_clear_date
        if date.day == sclr_date_1.day
          # binding.pry
          doc_date = date + buy_contract.payment_term.to_i.months
          end_date = Date.new((doc_date-buy_contract.payment_term.to_i.months).year, (doc_date-buy_contract.payment_term.to_i.months).month, buy_contract.term_no.to_i )

          start_date = Date.new((end_date.year > contract.start_date.year && end_date.month == 1) ? end_date.year-1 : end_date.year, end_date.month == 1 ? 12 : end_date.month-1, buy_contract.term_no_2.to_i+1)
        elsif date.day == sclr_date_2.day
          # binding.pry
          doc_date = date + buy_contract.payment_term.to_i.months
          end_date = Date.new((doc_date-buy_contract.payment_term.to_i.months).year, (doc_date-buy_contract.payment_term.to_i.months).month, buy_contract.term_no_2.to_i )
          start_date = Date.new(end_date.year, end_date.month, buy_contract.term_no.to_i+1)
        end
        # doc_date = date + 1.months


        # start_date = end_date - 1.month+1
      end

      salary_clear = ContractCycle.find_by(
                    contract_id: contract_id,
                    candidate_id: buy_contract.candidate_id,
                    company_id: sell_contract.company_id,
                    cycle_type: 'SalaryClear',
                    note: 'Salary clear',
                    doc_date: doc_date

                  )
      unless salary_clear
        salary_clear = ContractCycle.create(
                    contract_id: contract_id,
                    start_date: start_date.to_date,
                    end_date: end_date.to_date,
                    candidate_id: buy_contract.candidate_id,
                    company_id: sell_contract.company_id,
                    status: 'pending',
                    cycle_type: 'SalaryClear',
                    next_action: '',
                    note: 'Salary clear',
                    doc_date: doc_date,
                    post_date: doc_date

                  )
        
      end
      # binding.pry
      return salary_clear
    end

    def add_commission_cycle
      start_date =  set_commission_calculation_date

      commission_cal = ContractCycle.find_by(
                    contract_id: contract_id,
                    end_date: start_date.to_date,
                    candidate_id: buy_contract.candidate_id,
                    company_id: sell_contract.company_id,
                    cycle_type: 'CommissionCalculation',
                    note: 'Commission calculation'

                  )
      unless commission_cal
        commission_cal =ContractCycle.create(
                    contract_id: contract_id,
                    start_date: start_date.to_date,
                    end_date: start_date.to_date,
                    candidate_id: buy_contract.candidate_id,
                    company_id: sell_contract.company_id,
                    status: 'pending',
                    cycle_type: 'CommissionCalculation',
                    next_action: 'CommissionProcessing',
                    note: 'Commission calculation'

                  )
        
      end
      buy_contract.contract_sale_commisions.update(com_cal_cycle_id: commission_cal.id)
      return commission_cal
    end

    def add_vendor_bill_cycle
      start_date =  set_vendor_bill_calculation_date

      vendor_bill_cal = ContractCycle.find_by(
                    contract_id: contract_id,
                    end_date: start_date.to_date,
                    candidate_id: buy_contract.candidate_id,
                    company_id: sell_contract.company_id,
                    cycle_type: 'VendorBillCalculation',
                    note: 'VendorBill calculation'

                  )
      unless vendor_bill_cal
        vendor_bill_cal =ContractCycle.create(
                    contract_id: contract_id,
                    start_date: start_date.to_date,
                    end_date: start_date.to_date,
                    candidate_id: buy_contract.candidate_id,
                    company_id: sell_contract.company_id,
                    status: 'pending',
                    cycle_type: 'VendorBillCalculation',
                    next_action: 'VendorBillProcessing',
                    note: 'VendorBill calculation'

                  )
        
      end
      return vendor_bill_cal
    end

    def add_client_bill_cycle
      start_date =  set_client_bill_calculation_date

      client_bill_cal = ContractCycle.find_by(
                    contract_id: contract_id,
                    end_date: start_date.to_date,
                    candidate_id: buy_contract.candidate_id,
                    company_id: sell_contract.company_id,
                    cycle_type: 'ClientBillCalculation',
                    note: 'ClientBill calculation'

                  )
      unless client_bill_cal
        client_bill_cal =ContractCycle.create(
                    contract_id: contract_id,
                    start_date: start_date.to_date,
                    end_date: start_date.to_date,
                    candidate_id: buy_contract.candidate_id,
                    company_id: sell_contract.company_id,
                    status: 'pending',
                    cycle_type: 'ClientBillCalculation',
                    next_action: 'ClientBillProcessing',
                    note: 'ClientBill calculation'

                  )
        
      end
      return client_bill_cal
    end

    def add_client_expense_cycle
      start_date =  set_client_expense_calculation_date

      client_expense_cal = ContractCycle.find_by(
                    contract_id: contract_id,
                    end_date: start_date.to_date,
                    candidate_id: buy_contract.candidate_id,
                    company_id: sell_contract.company_id,
                    cycle_type: 'ClientExpenseCalculation',
                    note: 'ClientExpense calculation'
                  )

      unless client_expense_cal
        client_expense_cal = ContractCycle.create(
                    contract_id: contract_id,
                    start_date: start_date.to_date,
                    end_date: start_date.to_date,
                    candidate_id: buy_contract.candidate_id,
                    company_id: sell_contract.company_id,
                    status: 'pending',
                    cycle_type: 'ClientExpenseCalculation',
                    next_action: 'ClientExpenseProcessing',
                    note: 'ClientExpense calculation'
                  )
        
      end
      return client_expense_cal
    end

    def add_salary(cycle)

      salary = Salary.find_by(
                contract_id: contract_id,
                end_date: cycle.end_date,
                candidate_id: buy_contract.candidate_id,
                company_id: sell_contract.company_id,
                status: 'open',
                sc_cycle_id: cycle.id,
                rate: buy_contract.payrate
              )
      unless salary
        Salary.create(
                contract_id: contract_id,
                start_date: cycle.start_date,
                end_date: cycle.end_date,
                candidate_id: buy_contract.candidate_id,
                company_id: sell_contract.company_id,
                status: 'open',
                sc_cycle_id: cycle.id,
                rate: buy_contract.payrate
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

    def contract_cycle_sclr
      contract_cycles.where(cycle_type: "SalaryClear").order("created_at DESC").first
    end

    def contract_cycle_com_cal
      contract_cycles.where(cycle_type: "CommissionCalculation").order("created_at DESC").first
    end

    def contract_cycle_vendor_bill_cal
      contract_cycles.where(cycle_type: "VendorBillCalculation").order("created_at DESC").first
    end

    def contract_cycle_client_bill_cal
      contract_cycles.where(cycle_type: "ClientBillCalculation").order("created_at DESC").first
    end

    def contract_cycle_client_expense_cal
      contract_cycles.where(cycle_type: "ClientExpenseCalculation").order("created_at DESC").first
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

    def sc_frequency
      buy_contract.salary_calculation
    end

    def sc_day_of_week
      buy_contract.sc_day_of_week
    end

    def sc_date_1
      buy_contract.sc_date_1
    end

    def sc_date_2
      buy_contract.sc_date_2
    end

    def sc_end_of_month
      buy_contract.sc_end_of_month
    end

    def sclr_date_1
      buy_contract.sclr_date_1
    end

    def sclr_date_2
      buy_contract.sclr_date_2
    end

    def sclr_frequency
      buy_contract.salary_clear
    end

    def sclr_day_of_week
      buy_contract.sclr_day_of_week
    end

    def sclr_end_of_month
      buy_contract.sclr_end_of_month
    end

    def com_cal_frequency
      buy_contract.commission_calculation
    end

    def com_cal_day_of_week
      buy_contract.com_cal_day_of_week
    end

    def com_cal_date_1
      buy_contract.com_cal_date_1
    end

    def com_cal_date_2
      buy_contract.com_cal_date_2
    end

    def com_cal_end_of_month
      buy_contract.com_cal_end_of_month
    end

    def vendor_bill_frequency
      buy_contract.vendor_bill
    end

    def vb_day_time
      buy_contract.vb_day_time
    end

    def vb_date_1
      buy_contract.vb_date_1
    end

    def vb_date_2
      buy_contract.vb_date_2
    end

    def vb_day_of_week
      buy_contract.vb_day_of_week
    end

    def vb_end_of_month
      buy_contract.vb_end_of_month
    end

    def client_bill_frequency
      buy_contract.client_bill
    end

    def cb_day_time
      buy_contract.cb_day_time
    end

    def cb_date_1
      buy_contract.cb_date_1
    end

    def cb_date_2
      buy_contract.cb_date_2
    end

    def cb_day_of_week
      buy_contract.cb_day_of_week
    end

    def cb_end_of_month
      buy_contract.cb_end_of_month
    end

    def client_expense_frequency
      sell_contract.client_expense
    end

    def ce_day_of_week
      sell_contract.ce_day_of_week
    end

    def ce_day_time
      sell_contract.ce_day_time
    end

    def ce_date_1
      sell_contract.ce_date_1
    end

    def ce_date_2
      sell_contract.ce_date_2
    end

    def ce_end_of_month
      sell_contract.ce_end_of_month
    end

    def buy_payrate
      buy_contract.payrate
    end

    def sell_payrate
      sell_contract.customer_rate
    end

    def get_next_date(time_sheet_frequency, date_1, date_2, end_of_month, day_of_week, last_date = Date.today - 1.day )

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

    def ts_date_of_next(day_of_week,start_date, frequency)
      day_of_week = DateTime.parse(day_of_week).wday
      date = start_date.to_date + ((day_of_week - start_date.to_date.wday) % 7 )
      return date
      # if day_of_week >= start_date.wday
      #   (date - start_date.to_date <= 5) && start_date.wday != 0 ? date+7.days : date
      # else
      #   date
      # end
    end

    def date_of_next_two_week(day_of_week,start_date, frequency)
      # binding.pry
      day_of_week = DateTime.parse(day_of_week).wday
      date = ContractCycle.where(note: 'Salary clear').last&.doc_date
      if @count % 13 == 0
        date = date.present? ? date + 14 : start_date.to_date + ((day_of_week - start_date.to_date.wday) % 14 )
      else
        date = date + 14 if start_date == contract.end_date
        date
      end
      # binding.pry
      return date      
    end

    def twice_a_month_submit_date(ts_date_1, ts_date_2, start_date)
      # binding.pry
      day_1 = ts_date_1.strftime("%d").to_i
      day_2 = ts_date_2.strftime("%d").to_i.present? ? ts_date_2.strftime("%d").to_i : 0
      if start_date.strftime("%d").to_i <= day_1
        # binding.pry
        day = day_1&.to_i
        next_month_year = start_date
        month = next_month_year&.strftime("%m").to_i
        year = next_month_year&.strftime("%Y").to_i
      elsif start_date.strftime("%d").to_i > day_1 && start_date.strftime("%d").to_i <= day_2
        # binding.pry
        day = day_2&.to_i
        next_month_year = start_date
        month = next_month_year&.strftime("%m").to_i
        year = next_month_year&.strftime("%Y").to_i
      elsif start_date.strftime("%d").to_i > day_2 && !ts_end_of_month
        # binding.pry
        day = day_1&.to_i
        next_month_year = start_date+1.month
        month = next_month_year&.strftime("%m").to_i
        year = next_month_year&.strftime("%Y").to_i
      elsif ts_end_of_month
        # binding.pry
        next_month_year = start_date.end_of_month
        day = next_month_year.strftime('%e').to_i
        month = next_month_year&.strftime("%m").to_i
        year = next_month_year&.strftime("%Y").to_i
      end
      date = DateTime.new(year, month, day)
      return date
    end

    def monthly_submit_date(date_1, start_date,end_of_month)
      day_1 = date_1&.strftime("%d").to_i
      if day_1.present? && start_date.strftime("%d").to_i <= day_1
        day = day_1&.to_i
        next_month_year = start_date
        month = next_month_year&.strftime("%m").to_i
        year = next_month_year&.strftime("%Y").to_i
        start_date = DateTime.new(year, month, day)
        end_date = (start_date+1.month) -1
      elsif day_1.present? && start_date.strftime("%d").to_i > day_1 && !end_of_month
        day = day_1&.to_i
        next_month_year = start_date+1.month
        month = next_month_year&.strftime("%m").to_i
        year = next_month_year&.strftime("%Y").to_i
        start_date = DateTime.new(year, month, day)
        end_date = (start_date+1.month) -1
      elsif end_of_month
        next_month_year = start_date.beginning_of_month
        day = next_month_year.strftime('%e').to_i
        month = next_month_year&.strftime("%m").to_i
        year = next_month_year&.strftime("%Y").to_i
        start_date = DateTime.new(year, month, day)
        end_date = start_date.end_of_month
      end
      return start_date
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