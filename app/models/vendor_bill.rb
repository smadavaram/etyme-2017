class VendorBill < ApplicationRecord
  
  def self.set_con_cycle_vp_pro_date(buy_contract, con_cycle)
    @vp_type = buy_contract&.invoice_recepit
    if buy_contract&.ir_day_of_week.present?
      @vp_day_of_week = Date.parse(buy_contract&.ir_day_of_week&.titleize).try(:strftime, '%A')
    else
      @vp_day_of_week = 'mon'
    end
    @date_1 = buy_contract&.ir_date_1.try(:strftime, '%e')
    @date_2 = buy_contract&.ir_date_2.try(:strftime, '%e')
    @end_of_month = buy_contract&.ir_end_of_month
    @day_time = buy_contract&.ir_day_time.try(:strftime, '%H:%M')
    case @vp_type
    when 'daily'
      con_cycle_vp_start_date = con_cycle.start_date
    when 'weekly'  
      con_cycle_vp_start_date = date_of_next(@vp_day_of_week,con_cycle)
    when 'monthly'
      if @end_of_month
        con_cycle_vp_start_date = DateTime.now.end_of_month
      else
        con_cycle_vp_start_date = montly_approval_date(con_cycle)
      end
    when 'twice a month'
      con_cycle_vp_start_date = twice_a_month_approval_date(con_cycle)
    else
      con_cycle_vp_start_date = con_cycle.start_date
    end 
    return con_cycle_vp_start_date
  end

  def self.date_of_next(day_of_week,con_cycle)
    # binding.pry
    day_of_week = DateTime.parse(day_of_week).wday
    vb_day_of_week = DateTime.parse(con_cycle&.contract&.buy_contract&.vb_day_of_week).wday if con_cycle.contract.buy_contract.vendor_bill == 'weekly'
    date = con_cycle.start_date.to_date + ((day_of_week - con_cycle.start_date.to_date.wday) % 7)
    if day_of_week <= con_cycle.start_date.wday
      date = (date - con_cycle.start_date.to_date <= 5) && con_cycle.start_date.wday != 0 ? date+7.days : date
    else
      date
    end
  end

  def self.montly_approval_date(con_cycle)
    day = @date_1&.to_i.present? ? @date_1&.to_i : 0
    next_month_year = con_cycle.start_date.strftime("%d").to_i <= day ? con_cycle.start_date : (con_cycle.start_date+1.month)
    month = next_month_year&.strftime("%m").to_i
    year = next_month_year&.strftime("%Y").to_i
    con_cycle_com_pro_start_date = DateTime.new(year, month, day)
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
    con_cycle_com_pro_start_date = DateTime.new(year, month, day)
  end

  def self.set_vendor_bill_clear
    con_cycles = ContractCycle.where(note: 'VendorPayment process')
    con_cycles.each do |con_cycle|
      con_cycle_vp_pro = ContractCycle.find_by(contract_id: con_cycle.contract_id,
                                          start_date: con_cycle.start_date+3.days,
                                          end_date: con_cycle&.end_date+3.days,
                                          company_id: con_cycle.company_id,
                                          note: "VendorBill clear",
                                          cycle_type: "VendorBillClear"
      )

      unless con_cycle_vp_pro
        con_cycle_vp_pro = ContractCycle.create(contract_id: con_cycle.contract_id,
                                            start_date: con_cycle.start_date+3.days,
                                            end_date: con_cycle.end_date+3.days,
                                            company_id: con_cycle.company_id,
                                            note: "VendorBill clear",
                                            cycle_date: Time.now,
                                            cycle_type: "VendorBillClear"
        )
      end
    end
  end
end
