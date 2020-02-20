module Cycle::CycleMaker
  extend ActiveSupport::Concern

  # Buy Contract Cycles

  def buy_contract_time_sheet_cycles(extended_date = nil)
    start_date = self.start_date
    last_end_date = self.contract_cycles.where(cycle_type: 'TimesheetSubmit').where(cycle_of_type: 'BuyContract').order('end_date DESC').pluck(:end_date)
    if last_end_date.present?
      if last_end_date.first.to_date == DateTime.now.to_date
        start_date = last_end_date.first + 1.day
      else
        return
      end
    end
    end_date = cycle_end_date(buy_contract.time_sheet, start_date.to_datetime)
    date_groups = get_date_groups(self.buy_contract, "ts", 'time_sheet', start_date.to_datetime, end_date.to_datetime)
    time_sheet = self.timesheets.build(status: :open, job: self.job, candidate: self.candidate, start_date: start_date, end_date: end_date)

    if time_sheet.save
      contract_cycles.create!(cycle_type: 'TimesheetSubmit',
                               cyclable: time_sheet,
                               candidate: self.candidate,
                               contract: self,
                               start_date: start_date.to_datetime,
                               end_date: end_date.to_datetime,
                               cycle_frequency: buy_contract.time_sheet,
                               cycle_of: buy_contract,
                               note: "Timesheet submit"
      )
      date_groups.first.each do |date|
        time_sheet.transactions.create!(status: :pending, start_time: date)
      end
    end
  end

  def buy_contract_time_sheet_aprove_cycle(extended_date = nil)
    start_date = self.start_date
    last_end_date = self.contract_cycles.where(cycle_type: 'TimesheetApprove').where(cycle_of_type: 'BuyContract').order('end_date DESC').pluck(:end_date)
    if last_end_date.present?
      if last_end_date.first.to_date == DateTime.now.to_date
        start_date = last_end_date.first.to_date + 1.day
      else
        return
      end
    end
    end_date = cycle_end_date(buy_contract.ts_approve, start_date)
    contract_cycles.create(cycle_type: 'TimesheetApprove',
                             candidate: self.candidate,
                             contract: self,
                             start_date: start_date.to_datetime,
                             end_date: end_date.to_datetime,
                             cycle_of: self.buy_contract,
                             cycle_frequency: buy_contract.ts_approve,
                             note: "Timesheet approve"
    )
  end

  def buy_contract_salary_process_cycle(extended_date = nil)
    start_date = self.start_date
    last_end_date = self.contract_cycles.where(cycle_type: 'SalaryProcess').where(cycle_of_type: 'BuyContract').order('end_date DESC').pluck(:end_date)
    if last_end_date.present?
      if last_end_date.first.to_date == DateTime.now.to_date
        start_date = last_end_date.first.to_date + 1.day
      else
        return
      end
    end
    end_date = cycle_end_date(buy_contract.salary_calculation, start_date)
      contract_cycles.create(
          cycle_type: 'SalaryProcess',
          candidate: self.candidate,
          contract: self,
          start_date: start_date.to_datetime,
          end_date: end_date.to_datetime,
          cycle_of: self.buy_contract,
          cycle_frequency: buy_contract.salary_calculation,
          note: "Salary Process"
      )
  end

  def buy_contract_salary_clear_cycle(extended_date = nil)
      start_date = self.start_date
      last_end_date = self.contract_cycles.where(cycle_type: 'SalaryClear').where(cycle_of_type: 'BuyContract').order('end_date DESC').pluck(:end_date)
      if last_end_date.present?
        if last_end_date.first.to_date == DateTime.now.to_date
          start_date = last_end_date.first.to_date + 1.day
        else
          return
        end
      end
      end_date = cycle_end_date(buy_contract.salary_calculation, start_date)
      contract_cycles.create(
          cycle_type: 'SalaryClear',
          candidate: self.candidate,
          contract: self,
          start_date: start_date.to_datetime,
          end_date: end_date.to_datetime,
          cycle_of: self.buy_contract,
          cycle_frequency: buy_contract.salary_calculation,
          note: "Salary Clear"
      )
  end

  def buy_contract_salary_calculation_cycle(extended_date = nil)
      start_date = self.start_date
      last_end_date = self.contract_cycles.where(cycle_type: 'SalaryCalculation').where(cycle_of_type: 'BuyContract').order('end_date DESC').pluck(:end_date)
      if last_end_date.present?
        if last_end_date.first.to_date == DateTime.now.to_date
          start_date = last_end_date.first.to_date + 1.day
        else
          return
        end
      end
      end_date = cycle_end_date(buy_contract.salary_calculation, start_date)
      salary = salaries.pending.build(candidate: self.candidate)
      if salary.save
        contract_cycles.create(
            cycle_type: 'SalaryCalculation',
            candidate: self.candidate,
            contract: self,
            cyclable: salary,
            start_date: start_date.to_datetime,
            end_date: end_date.to_datetime,
            cycle_of: self.buy_contract,
            cycle_frequency: buy_contract.salary_calculation,
            note: "Salary Calculation"
        )
      end
  end

  # Sell Contract Cycles

  def sell_contract_time_sheet_cycles(extended_date = nil)
      start_date = self.start_date
      last_end_date = self.contract_cycles.where(cycle_type: 'TimesheetSubmit').where(cycle_of_type: 'SellContract').order('end_date DESC').pluck(:end_date)
      if last_end_date.present?
        if last_end_date.first.to_date == DateTime.now.to_date
          start_date = last_end_date.first.to_date + 1.day
        else
          return
        end
      end
      end_date = cycle_end_date(sell_contract.time_sheet, start_date)
      date_groups = get_date_groups(self.sell_contract, "ts", 'time_sheet', start_date, end_date)
      time_sheet = self.timesheets.build(status: :open, job: self.job, user: self.admin_user, start_date: start_date, end_date: end_date)
      if time_sheet.save
        contract_cycles.create(cycle_type: 'TimesheetSubmit',
                               cyclable: time_sheet,
                               user: self.admin_user,
                               contract: self,
                               start_date: start_date.to_datetime,
                               end_date: end_date.to_datetime,
                               cycle_frequency: sell_contract.time_sheet,
                               cycle_of: sell_contract,
                               note: "Timesheet submit"
        )
        date_groups.first.each do |date|
          time_sheet.transactions.create(status: :pending, start_time: date)
        end
      end
  end

  def sell_contract_time_sheet_aprove_cycle(extended_date = nil)
      start_date = self.start_date
      last_end_date = self.contract_cycles.where(cycle_type: 'TimesheetApprove').where(cycle_of_type: 'SellContract').order('end_date DESC').pluck(:end_date)
      if last_end_date.present?
        if last_end_date.first.to_date == DateTime.now.to_date
          start_date = last_end_date.first.to_date + 1.day
        else
          return
        end
      end
      end_date = cycle_end_date(sell_contract.ts_approve, start_date)
      contract_cycles.create(cycle_type: 'TimesheetApprove',
                             user: self.admin_user,
                             contract: self,
                             start_date: start_date.to_datetime,
                             end_date: end_date.to_datetime,
                             cycle_of: sell_contract,
                             cycle_frequency: sell_contract.ts_approve,
                             note: "Timesheet approve"
      )
  end

  def sell_contract_invoice_cycle(extended_date = nil)
      start_date = self.start_date
      last_end_date = self.contract_cycles.where(cycle_type: 'InvoiceGenerate').where(cycle_of_type: 'SellContract').order('end_date DESC').pluck(:end_date)
      if last_end_date.present?
        if last_end_date.first.to_date == DateTime.now.to_date
          start_date = last_end_date.first.to_date + 1.day
        else
          return
        end
      end
      end_date = cycle_end_date(sell_contract.invoice_terms_period, start_date)
      invoice = invoices.timesheet_invoice.pending_invoice.build(sender_company_id: company.id, receiver_company_id: sell_contract.company.id, start_date: start_date, end_date: end_date)
      contract_cycles.create(cycle_type: 'InvoiceGenerate',
                             user: admin_user,
                             contract: self,
                             start_date: start_date.to_datetime,
                             end_date: end_date.to_datetime,
                             cyclable: invoice,
                             cycle_of: self.sell_contract,
                             cycle_frequency: sell_contract.invoice_terms_period,
                             note: "Invoice generate"
      )
  end

  def sell_contract_client_expense_cycle(extended_date = nil)
      start_date = self.start_date
      last_end_date = self.contract_cycles.where(cycle_type: 'ClientExpenseSubmission').where(cycle_of_type: 'SellContract').order('end_date DESC').pluck(:end_date)
      if last_end_date.present?
        if last_end_date.first.to_date == DateTime.now.to_date
          start_date = last_end_date.first.to_date + 1.day
        else
          return
        end
      end
      end_date = cycle_end_date(sell_contract.client_expense, start_date)
      client_expense = self.client_expenses.build(user: self.admin_user, company: sell_contract.company, job: job, start_date: start_date, end_date: end_date)
      if client_expense.save
        contract_cycles.create(cycle_type: 'ClientExpenseSubmission',
                               cyclable: client_expense,
                               user: self.admin_user,
                               contract: self,
                               start_date: start_date.to_datetime,
                               end_date: end_date.to_datetime,
                               cycle_of: sell_contract,
                               cycle_frequency: sell_contract.client_expense,
                               note: 'Client expense submission'
        )
      end
  end

  def sell_contract_client_expense_approve_cycle(extended_date = nil)
      start_date = self.start_date
      last_end_date = self.contract_cycles.where(cycle_type: 'ClientExpenseApprove').where(cycle_of_type: 'SellContract').order('end_date DESC').pluck(:end_date)
      if last_end_date.present?
        if last_end_date.first.to_date == DateTime.now.to_date
          start_date = last_end_date.first.to_date + 1.day
        else
          return
        end
      end
      end_date = cycle_end_date(sell_contract.ce_approve, start_date)
      contract_cycles.create(cycle_type: 'ClientExpenseApprove',
                             user: self.admin_user,
                             contract: self,
                             start_date: start_date.to_datetime,
                             end_date: end_date.to_datetime,
                             cycle_of: sell_contract,
                             cycle_frequency: sell_contract.ce_approve,
                             note: 'Client expense Approval'
      )
  end

  def sell_contract_client_expense_invoice_cycle(extended_date = nil)
      start_date = self.start_date
      last_end_date = self.contract_cycles.where(cycle_type: 'ClientExpenseInvoice').where(cycle_of_type: 'SellContract').order('end_date DESC').pluck(:end_date)
      if last_end_date.present?
        if last_end_date.first.to_date == DateTime.now.to_date
          start_date = last_end_date.first.to_date + 1.day
        else
          return
        end
      end
      end_date = cycle_end_date(sell_contract.ce_invoice, start_date)
      invoice = invoices.client_expense_invoice.pending_invoice.build(sender_company_id: company.id, receiver_company_id: sell_contract.company.id, start_date: start_date, end_date: end_date)
      contract_cycles.create(cycle_type: 'ClientExpenseInvoice',
                             user: self.admin_user,
                             cyclable: invoice,
                             contract: self,
                             start_date: start_date.to_datetime,
                             end_date: end_date.to_datetime,
                             cycle_of: sell_contract,
                             cycle_frequency: sell_contract.ce_invoice,
                             note: 'Client Expense Invoice'
      )
  end

  def cycle_end_date(frequency, date)
    case frequency
    when 'daily'
      return date + 1.day
    when 'weekly'
      return date + 1.week
    when 'biweekly'
      return date + 2.weeks
    when 'monthly'
      return date + 1.month
    when 'twice a month'
      return date + 2.months
    else
      date
    end
  end

  private

  def get_date_groups(buy_or_sell, resource_initial, cycle_frequency_field, user_start_date = nil, user_end_date = nil)
    utils = Cycle::Utils::DateUtils
      sd = user_start_date
      ed = user_end_date
    case buy_or_sell.send(cycle_frequency_field)
    when 'daily'
      utils.group_by_daily(sd, ed)
    when 'weekly'
      utils.group_by_weekly(buy_or_sell.send("#{resource_initial}_day_of_week"), sd, ed)
    when 'biweekly'
      utils.group_by_biweekly(buy_or_sell.send("#{resource_initial}_day_of_week"), buy_or_sell.send("#{resource_initial}_2day_of_week"), sd, ed)
    when 'monthly'
      utils.group_by_monthly(buy_or_sell.send("#{resource_initial}_date_1").try(:day), sd, ed)
    when 'twice a month'
      utils.group_by_twice_a_month(buy_or_sell.send("#{resource_initial}_date_1").try(:day), buy_or_sell.send("#{resource_initial}_date_2").try(:day), sd, ed)
    end
  end
end