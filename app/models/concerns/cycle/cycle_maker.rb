module Cycle::CycleMaker
  extend ActiveSupport::Concern

  def buy_contract_time_sheet_cycles
    date_groups = get_date_groups(self.buy_contract, "ts", 'time_sheet')
    date_groups.each do |date_group|
      # contract_cycles.build(company)
      start_date = date_group.first
      end_date = date_group.last
      time_sheet = self.timesheets.build(status: :open, job: self.job, candidate: self.candidate, start_date: start_date, end_date: end_date)
      if time_sheet.save
        contract_cycles.create(cycle_type: 'TimesheetSubmit',
                               cyclable: time_sheet,
                               candidate: self.candidate,
                               contract: self,
                               start_date: start_date,
                               end_date: end_date,
                               cycle_frequency: buy_contract.time_sheet,
                               note: "Timesheet submit"
        )
        date_group.each do |date|
          time_sheet.transactions.create(status: :pending, start_time: date)
        end
      end
    end
  end

  def buy_contract_time_sheet_aprove_cycle
    date_groups = get_date_groups(self.buy_contract, 'ta', 'ts_approve')
    date_groups.each do |date_group|
      start_date = date_group.first
      end_date = date_group.last
      contract_cycles.create(cycle_type: 'TimesheetApprove',
                             candidate: self.candidate,
                             contract: self,
                             start_date: start_date,
                             end_date: end_date,
                             cycle_frequency: buy_contract.ts_approve,
                             note: "Timesheet approve"
      )
    end
  end

  def sell_contract_invoice_cycle
    date_groups = get_date_groups(self.sell_contract, 'invoice', 'invoice_terms_period')
    date_groups.each do |date_group|
      start_date = date_group.first
      end_date = date_group.last
      contract_cycles.create(cycle_type: 'InvoiceGenerate',
                             candidate: self.candidate,
                             contract: self,
                             start_date: start_date,
                             end_date: end_date,
                             cycle_frequency: sell_contract.invoice_terms_period,
                             note: "Invoice generate"
      )
    end
  end

  def sell_contract_client_expense_cycle
    date_groups = get_date_groups(self.sell_contract, 'ce', 'client_expense')
    date_groups.each do |date_group|
      start_date = date_group.first
      end_date = date_group.last
      client_expense = self.client_expenses.build(candidate: candidate, company: sell_contract.company, job: job)
      if client_expense.save
        contract_cycles.create(cycle_type: 'ClientExpenseSubmission',
                               cyclable: client_expense,
                               candidate: self.candidate,
                               contract: self,
                               start_date: start_date,
                               end_date: end_date,
                               cycle_frequency: sell_contract.client_expense,
                               note: 'Client expense submission'
        )
      end
    end
  end

  private

  def get_date_groups(buy_or_sell, resource_initial, cycle_frequency_field)
    utils = Cycle::Utils::DateUtils
    case buy_or_sell.send(cycle_frequency_field)
    when 'daily'
      utils.group_by_daily(start_date, end_date)
    when 'weekly'
      utils.group_by_weekly(buy_or_sell.send("#{resource_initial}_day_of_week"), start_date, end_date)
    when 'biweekly'
      utils.group_by_biweekly(buy_or_sell.send("#{resource_initial}_day_of_week"), buy_or_sell.send("#{resource_initial}_2day_of_week"), start_date, end_date)
    when 'monthly'
      utils.group_by_monthly(buy_or_sell.send("#{resource_initial}_date_1").day, start_date, end_date)
    when 'twice a month'
      utils.group_by_twice_a_month(buy_or_sell.send("#{resource_initial}_date_1").day, buy_or_sell.send("#{resource_initial}_date_2").day, start_date, end_date)
    end
  end

end