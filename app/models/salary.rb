class Salary < ApplicationRecord
  include Rails.application.routes.url_helpers
  enum status: [:open, :processed, :cleared]
  belongs_to :company, optional: true
  belongs_to :contract, optional: true
  belongs_to :candidate, optional: true
  has_many :sc_calculateds, foreign_key: :sc_cycle_id, class_name: 'Salary'
  has_many :sp_processeds, foreign_key: :sp_cycle_id, class_name: 'Salary'
  has_many :sclr_cleareds, foreign_key: :sclr_cycle_id, class_name: 'Salary'

  scope :open_salaries, -> {where(status: :open)}
  scope :processed_salaries, -> {where(status: :processed)}
  scope :cleared_salaries, -> {where(status: [:paid])}


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
      con_cycle_start_date = con_cycle.start_date
    when 'weekly'  
      con_cycle_start_date = date_of_next(@sp_day_of_week,con_cycle)
    when 'monthly'
      if @end_of_month
        con_cycle_start_date = DateTime.now.end_of_month
      else
        con_cycle_start_date = montly_approval_date(con_cycle)
      end
    when 'twice a month'
      con_cycle_start_date = twice_a_month_approval_date(con_cycle)
    else
      con_cycle_start_date = con_cycle.start_date
    end 
    return con_cycle_start_date
  end

  def self.set_con_cycle_sclr_date(buy_contract, con_cycle)
    @sclr_type = buy_contract&.salary_process
    if buy_contract&.sclr_day_of_week.present?
      @sclr_day_of_week = Date.parse(buy_contract&.sclr_day_of_week&.titleize).try(:strftime, '%A')
    else
      @sclr_day_of_week = 'mon'
    end
    @date_1 = buy_contract&.sclr_date_1.try(:strftime, '%e')
    @date_2 = buy_contract&.sclr_date_2.try(:strftime, '%e')
    @end_of_month = buy_contract&.sclr_end_of_month
    @day_time = buy_contract&.sclr_day_time.try(:strftime, '%H:%M')
    case @sclr_type
    when 'daily'
      con_cycle_start_date = con_cycle.start_date
    when 'weekly'  
      con_cycle_start_date = date_of_next(@sclr_day_of_week,con_cycle)
    when 'monthly'
      if @end_of_month
        con_cycle_start_date = DateTime.now.end_of_month
      else
        con_cycle_start_date = montly_approval_date(con_cycle, buy_contract)
      end
    when 'twice a month'
      con_cycle_start_date = twice_a_month_approval_date(con_cycle)
    else
      con_cycle_start_date = con_cycle.start_date
    end 
    return con_cycle_start_date
  end



  def self.date_of_next(day_of_week,con_cycle)
    # binding.pry
    day_of_week = DateTime.parse(day_of_week).wday
    # sc_day_of_week = DateTime.parse(con_cycle&.contract&.buy_contracts&.first&.sc_day_of_week).wday if con_cycle.contract.buy_contracts.first.salary_calculation == 'weekly'
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
    if buy_contract.payment_term = 'end_of_mon'
      month = next_month_year&.strftime("%m").to_i+1
    elsif buy_contract.payment_term = 'end_of_pre_mon'
      month = next_month_year&.strftime("%m").to_i+2
    end
    year = next_month_year&.strftime("%Y").to_i
    con_cycle_start_date = DateTime.new(year, month, day)
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

end
