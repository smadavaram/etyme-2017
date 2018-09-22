class Salary < ApplicationRecord
  include Rails.application.routes.url_helpers
  enum status: [:open, :processed, :approved, :cleared]
  belongs_to :company, optional: true
  belongs_to :contract, optional: true
  belongs_to :candidate, optional: true
  has_many :sc_calculateds, foreign_key: :sc_cycle_id, class_name: 'Salary'
  has_many :sp_processeds, foreign_key: :sp_cycle_id, class_name: 'Salary'
  has_many :sclr_cleareds, foreign_key: :sclr_cycle_id, class_name: 'Salary'


  def self.set_con_cycle_sp_date(buy_contract, con_cycle)
    @sp_type = buy_contract&.salary_process
    if buy_contract&.sp_day_of_week.present?
      @sp_day_of_week = Date.parse(buy_contract&.sp_day_of_week&.titleize).try(:strftime, '%A')
    else
      @sp_day_of_week = 'mon'
    end
    @date_1 = buy_contract&.sp_date_1.try(:strftime, '%e')
    @date_2 = buy_contract&.sp_date_2.try(:strftime, '%e')
    @end_of_month = buy_contract&.sp_end_of_month
    @day_time = buy_contract&.sp_day_time.try(:strftime, '%H:%M')
    case @sp_type
    when 'daily'
      con_cycle_sp_start_date = con_cycle.start_date
    when 'weekly'  
      con_cycle_sp_start_date = date_of_next(@sp_day_of_week,con_cycle)
    when 'monthly'
      if @end_of_month
        con_cycle_sp_start_date = DateTime.now.end_of_month
      else
        con_cycle_sp_start_date = montly_approval_date(con_cycle)
      end
    when 'twice a month'
      con_cycle_sp_start_date = twice_a_month_approval_date(con_cycle)
    else
      con_cycle_sp_start_date = con_cycle.start_date
    end 
    return con_cycle_sp_start_date
  end

  def self.date_of_next(day_of_week,con_cycle)
    # binding.pry
    day_of_week = DateTime.parse(day_of_week).wday
    sc_day_of_week = DateTime.parse(con_cycle&.contract&.buy_contracts&.first&.sc_day_of_week).wday if con_cycle.contract.buy_contracts.first.salary_calculation == 'weekly'
    date = con_cycle.start_date.to_date + ((day_of_week - con_cycle.start_date.to_date.wday) % 7)
    if day_of_week <= con_cycle.start_date.wday
      date = (date - con_cycle.start_date.to_date <= 5) && con_cycle.start_date.wday != 0 ? date+7.days : date
    else
      date
    end
    # if sc_day_of_week > day_of_week
    #   date = date+7.days
    # else
    #   date
    # end 
  end

  def self.montly_approval_date(con_cycle)
    day = @date_1&.to_i.present? ? @date_1&.to_i : 0
    next_month_year = con_cycle.start_date.strftime("%d").to_i <= day ? con_cycle.start_date : (con_cycle.start_date+1.month)
    month = next_month_year&.strftime("%m").to_i
    year = next_month_year&.strftime("%Y").to_i
    # binding.pry
    con_cycle_sp_start_date = DateTime.new(year, month, day)
  end

  def self.twice_a_month_approval_date(con_cycle)
    day_1 = @date_1&.to_i
    day_2 = @date_2&.to_i.present? ? @date_2&.to_i : 0
    if con_cycle.start_date.strftime("%d").to_i <= day_1
      day = @date_1&.to_i
      next_month_year = con_cycle.start_date
      month = next_month_year&.strftime("%m").to_i
      year = next_month_year&.strftime("%Y").to_i
    elsif con_cycle.start_date.strftime("%d").to_i > day_1 && con_cycle.start_date.strftime("%d").to_i <= day_2
      day = @date_2&.to_i
      next_month_year = con_cycle.start_date
      month = next_month_year&.strftime("%m").to_i
      year = next_month_year&.strftime("%Y").to_i
    elsif con_cycle.start_date.strftime("%d").to_i > day_2 && !@end_of_month
      day = @date_1&.to_i
      next_month_year = con_cycle.start_date+1.month
      month = next_month_year&.strftime("%m").to_i
      year = next_month_year&.strftime("%Y").to_i
    elsif @end_of_month
      next_month_year = con_cycle.start_date.end_of_month
      day = next_month_year.strftime('%e').to_i
      month = next_month_year&.strftime("%m").to_i
      year = next_month_year&.strftime("%Y").to_i
    end
    # binding.pry
    con_cycle_sp_start_date = DateTime.new(year, month, day)
  end

  def self.set_salary_clear
      con_cycles = ContractCycle.where(note: 'Salary process')
      con_cycles.each do |con_cycle|
        con_cycle_sp = ContractCycle.find_by(contract_id: con_cycle.contract_id,
                                            start_date: con_cycle.start_date+3.days,
                                            end_date: con_cycle&.end_date+3.days,
                                            company_id: con_cycle.company_id,
                                            note: "Salary clear",
                                            cycle_type: "SalaryClear"
        )

        unless con_cycle_sp
          con_cycle_sp = ContractCycle.create(contract_id: con_cycle.contract_id,
                                              start_date: con_cycle.start_date+3.days,
                                              end_date: con_cycle.end_date+3.days,
                                              company_id: con_cycle.company_id,
                                              note: "Salary clear",
                                              cycle_date: Time.now,
                                              cycle_type: "SalaryClear"
          )
        end
      end
  end

end
