# frozen_string_literal: true

# == Schema Information
#
# Table name: payroll_infos
#
#  id                         :bigint           not null, primary key
#  company_id                 :bigint
#  payroll_term               :string
#  payroll_type               :string
#  sal_cal_date               :date
#  payroll_date               :date
#  weekend_sch                :string
#  created_at                 :datetime         not null
#  updated_at                 :datetime         not null
#  sc_day_time                :time
#  sc_date_1                  :date
#  sc_date_2                  :date
#  sc_day_of_week             :string
#  sc_end_of_month            :boolean          default(FALSE)
#  sp_day_time                :time
#  sp_date_1                  :date
#  sp_date_2                  :date
#  sp_day_of_week             :string
#  sp_end_of_month            :boolean          default(FALSE)
#  sclr_day_time              :time
#  sclr_date_1                :date
#  sclr_date_2                :date
#  sclr_day_of_week           :string
#  sclr_end_of_month          :boolean          default(FALSE)
#  term_no                    :string
#  term_no_2                  :string
#  payroll_term_2             :string
#  ven_term_no_1              :string
#  ven_term_no_2              :string
#  ven_bill_date_1            :date
#  ven_bill_date_2            :date
#  ven_pay_date_1             :date
#  ven_pay_date_2             :date
#  ven_clr_date_1             :date
#  ven_clr_date_2             :date
#  ven_bill_day_time          :time
#  ven_pay_day_time           :time
#  ven_clr_day_time           :time
#  ven_bill_end_of_month      :boolean
#  ven_pay_end_of_month       :boolean
#  ven_clr_end_of_month       :boolean
#  ven_payroll_type           :string
#  ven_term_num_1             :string
#  ven_term_num_2             :string
#  ven_term_1                 :string
#  ven_term_2                 :string
#  ven_bill_day_of_week       :string
#  ven_pay_day_of_week        :string
#  ven_clr_day_of_week        :string
#  sc_2day_of_week            :string
#  sp_2day_of_week            :string
#  sclr_2day_of_week          :string
#  ven_bill_2day_of_week      :string
#  ven_pay_2day_of_week       :string
#  ven_clr_2day_of_week       :string
#  title                      :string
#  pay_period_daily           :date
#  pay_period_weekly          :date
#  pay_period_monthly         :date
#  pay_period_twice_a_monthly :date
#  pay_period_biweekly        :date
#  weekend_sch_daily          :boolean          default(TRUE)
#  weekend_sch_weekly         :boolean          default(TRUE)
#  weekend_sch_monthly        :boolean          default(TRUE)
#  weekend_sch_twice_a_month  :boolean          default(TRUE)
#  weekend_sch_biweekly       :boolean          default(TRUE)
#  payroll_term_daily         :integer
#  payroll_term_weekly        :integer
#  payroll_term_monthly       :integer
#  payroll_term_twice_a_month :integer
#  payroll_term_biweekly      :integer
#  term_no_daily              :integer
#  term_no_weekly             :integer
#  term_no_monthly            :integer
#  term_no_twice_a_month      :integer
#  term_no_biweekly           :integer
#
class PayrollInfo < ApplicationRecord
  enum week_payroll_term: { '1 Day' => 1, '1 Days' => 2, '3 Days' => 3, '4 Days' => 4, '5 Days' => 5, '6 Days' => 6, '7 Days' => 7, '14 Days' => 14 }
  enum month_payroll_term: { 'End of current month' => 0, 'End of 1 previous month' => 1, 'End of 2 previous month' => 2 }

  validates_presence_of :title

  belongs_to :company
  has_many :contract_cycles, as: :cycle_of
  has_many :tax_infos
  has_many :buy_contracts

  accepts_nested_attributes_for :tax_infos, allow_destroy: true, reject_if: :all_blank

  def destroy
    super if contract_cycles&.destroy_all
  end
end
