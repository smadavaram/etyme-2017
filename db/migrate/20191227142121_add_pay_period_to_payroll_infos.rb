class AddPayPeriodToPayrollInfos < ActiveRecord::Migration[5.1]
  def change
    add_column :payroll_infos, :pay_period_daily, :Date
    add_column :payroll_infos, :pay_period_weekly, :Date
    add_column :payroll_infos, :pay_period_monthly, :Date
    add_column :payroll_infos, :pay_period_twice_a_monthly, :Date
    add_column :payroll_infos, :pay_period_biweekly, :Date
  end
end
