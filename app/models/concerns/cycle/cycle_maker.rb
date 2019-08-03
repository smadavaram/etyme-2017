module Cycle::CycleMaker
  extend ActiveSupport::Concern

  def buy_contract_time_sheet_cycles
    date_groups = get_date_groups(self.buy_contract)
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
                               end_date: end_date
                               )
        date_group.each do |date|
          time_sheet.transactions.create(status: :pending,start_time: date)
        end
      end
    end
  end

  private

  def get_date_groups(buy_or_sell)
    utils = Cycle::Utils::DateUtils
    case buy_or_sell.time_sheet
    when 'daily'
      utils.group_by_daily(start_date, end_date)
    when 'weekly'
      utils.group_by_weekly(buy_or_sell.ts_day_of_week, start_date, end_date)
    when 'biweekly'
      utils.group_by_biweekly(buy_or_sell.ts_day_of_week, buy_or_sell.ts_day_of_week, start_date, end_date)
    when 'monthly'
      utils.group_by_monthly(buy_or_sell.ts_date_1.day, start_date, end_date)
    when 'twice a month'
      utils.group_by_twice_a_month(buy_or_sell.ts_date_1.day, buy_or_sell.ts_date_2.day, start_date, end_date)
    end
  end

end