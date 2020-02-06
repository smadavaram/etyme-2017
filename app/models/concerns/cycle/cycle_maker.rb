# frozen_string_literal: true

module Cycle::CycleMaker
  extend ActiveSupport::Concern

  # Buy Contract Cycles

  def buy_contract_time_sheet_cycles(extended_date = nil)
    date_groups = get_date_groups(buy_contract, 'ts', 'time_sheet', extended_date)
    date_groups.each do |date_group|
      # contract_cycles.build(company)
      start_date = date_group.first
      end_date = date_group.last
      time_sheet = timesheets.build(status: :open, job: job, candidate: candidate, start_date: start_date, end_date: end_date)
      next unless time_sheet.save

      contract_cycles.create(cycle_type: 'TimesheetSubmit',
                             cyclable: time_sheet,
                             candidate: candidate,
                             contract: self,
                             start_date: start_date,
                             end_date: end_date,
                             cycle_frequency: buy_contract.time_sheet,
                             cycle_of: buy_contract,
                             note: 'Timesheet submit')
      date_group.each do |date|
        time_sheet.transactions.create(status: :pending, start_time: date)
      end
    end
  end

  def buy_contract_time_sheet_aprove_cycle(extended_date = nil)
    date_groups = get_date_groups(buy_contract, 'ta', 'ts_approve', extended_date)
    date_groups.each do |date_group|
      start_date = date_group.first
      end_date = date_group.last
      contract_cycles.create(cycle_type: 'TimesheetApprove',
                             candidate: candidate,
                             contract: self,
                             start_date: start_date,
                             end_date: end_date,
                             cycle_of: buy_contract,
                             cycle_frequency: buy_contract.ts_approve,
                             note: 'Timesheet approve')
    end
  end

  def buy_contract_salary_process_cycle(extended_date = nil)
    date_groups = get_date_groups(buy_contract.payroll_info, 'sp', 'payroll_type', extended_date)
    date_groups.each do |date_group|
      start_date = date_group.first
      end_date = date_group.last
      contract_cycles.create(
        cycle_type: 'SalaryProcess',
        candidate: candidate,
        contract: self,
        start_date: start_date,
        end_date: end_date,
        cycle_of: buy_contract,
        cycle_frequency: buy_contract.salary_calculation,
        note: 'Salary Process'
      )
    end
  end

  def buy_contract_salary_clear_cycle(extended_date = nil)
    date_groups = get_date_groups(buy_contract.payroll_info, 'sclr', 'payroll_type', extended_date)
    date_groups.each do |date_group|
      start_date = date_group.first
      end_date = date_group.last
      contract_cycles.create(
        cycle_type: 'SalaryClear',
        candidate: candidate,
        contract: self,
        start_date: start_date,
        end_date: end_date,
        cycle_of: buy_contract,
        cycle_frequency: buy_contract.salary_calculation,
        note: 'Salary Clear'
      )
    end
  end

  def buy_contract_salary_calculation_cycle(extended_date = nil)
    date_groups = get_date_groups(buy_contract.payroll_info, 'sc', 'payroll_type', extended_date)
    date_groups.each do |date_group|
      start_date = date_group.first
      end_date = date_group.last
      salary = salaries.pending.build(candidate: candidate)
      next unless salary.save

      contract_cycles.create(
        cycle_type: 'SalaryCalculation',
        candidate: candidate,
        contract: self,
        cyclable: salary,
        start_date: start_date,
        end_date: end_date,
        cycle_of: buy_contract,
        cycle_frequency: buy_contract.salary_calculation,
        note: 'Salary Calculation'
      )
    end
  end

  # Sell Contract Cycles

  def sell_contract_time_sheet_cycles(extended_date = nil)
    date_groups = get_date_groups(sell_contract, 'ts', 'time_sheet', extended_date)
    date_groups.each do |date_group|
      # contract_cycles.build(company)
      start_date = date_group.first
      end_date = date_group.last
      time_sheet = timesheets.build(status: :open, job: job, user: admin_user, start_date: start_date, end_date: end_date)
      next unless time_sheet.save

      contract_cycles.create(cycle_type: 'TimesheetSubmit',
                             cyclable: time_sheet,
                             user: admin_user,
                             contract: self,
                             start_date: start_date,
                             end_date: end_date,
                             cycle_frequency: sell_contract.time_sheet,
                             cycle_of: sell_contract,
                             note: 'Timesheet submit')
      date_group.each do |date|
        time_sheet.transactions.create(status: :pending, start_time: date)
      end
    end
  end

  def sell_contract_time_sheet_aprove_cycle(extended_date = nil)
    date_groups = get_date_groups(sell_contract, 'ta', 'ts_approve', extended_date)
    date_groups.each do |date_group|
      start_date = date_group.first
      end_date = date_group.last
      contract_cycles.create(cycle_type: 'TimesheetApprove',
                             user: admin_user,
                             contract: self,
                             start_date: start_date,
                             end_date: end_date,
                             cycle_of: sell_contract,
                             cycle_frequency: sell_contract.ts_approve,
                             note: 'Timesheet approve')
    end
  end

  def sell_contract_invoice_cycle(extended_date = nil)
    date_groups = get_date_groups(sell_contract, 'invoice', 'invoice_terms_period', extended_date)
    date_groups.each do |date_group|
      start_date = date_group.first
      end_date = date_group.last
      invoice = invoices.timesheet_invoice.pending_invoice.build(sender_company_id: company.id, receiver_company_id: sell_contract.company.id, start_date: start_date, end_date: end_date)
      contract_cycles.create(cycle_type: 'InvoiceGenerate',
                             user: admin_user,
                             contract: self,
                             start_date: start_date,
                             end_date: end_date,
                             cyclable: invoice,
                             cycle_of: sell_contract,
                             cycle_frequency: sell_contract.invoice_terms_period,
                             note: 'Invoice generate')
    end
  end

  def sell_contract_client_expense_cycle(extended_date = nil)
    date_groups = get_date_groups(sell_contract, 'ce', 'client_expense', extended_date)
    date_groups.each do |date_group|
      start_date = date_group.first
      end_date = date_group.last
      client_expense = client_expenses.build(user: admin_user, company: sell_contract.company, job: job, start_date: start_date, end_date: end_date)
      next unless client_expense.save

      contract_cycles.create(cycle_type: 'ClientExpenseSubmission',
                             cyclable: client_expense,
                             user: admin_user,
                             contract: self,
                             start_date: start_date,
                             end_date: end_date,
                             cycle_of: sell_contract,
                             cycle_frequency: sell_contract.client_expense,
                             note: 'Client expense submission')
    end
  end

  def sell_contract_client_expense_approve_cycle(extended_date = nil)
    date_groups = get_date_groups(sell_contract, 'ce_ap', 'ce_approve', extended_date)
    date_groups.each do |date_group|
      start_date = date_group.first
      end_date = date_group.last
      contract_cycles.create(cycle_type: 'ClientExpenseApprove',
                             user: admin_user,
                             contract: self,
                             start_date: start_date,
                             end_date: end_date,
                             cycle_of: sell_contract,
                             cycle_frequency: sell_contract.ce_approve,
                             note: 'Client expense Approval')
    end
  end

  def sell_contract_client_expense_invoice_cycle(extended_date = nil)
    date_groups = get_date_groups(sell_contract, 'ce_in', 'ce_invoice', extended_date)
    date_groups.each do |date_group|
      start_date = date_group.first
      end_date = date_group.last
      invoice = invoices.client_expense_invoice.pending_invoice.build(sender_company_id: company.id, receiver_company_id: sell_contract.company.id, start_date: start_date, end_date: end_date)
      contract_cycles.create(cycle_type: 'ClientExpenseInvoice',
                             user: admin_user,
                             cyclable: invoice,
                             contract: self,
                             start_date: start_date,
                             end_date: end_date,
                             cycle_of: sell_contract,
                             cycle_frequency: sell_contract.ce_invoice,
                             note: 'Client Expense Invoice')
    end
  end

  private

  def get_date_groups(buy_or_sell, resource_initial, cycle_frequency_field, extended_date = nil)
    utils = Cycle::Utils::DateUtils
    if extended_date.present?
      sd = end_date
      ed = extended_date
    else
      sd = start_date
      ed = end_date
    end
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
