class Add2ndDayOfWeekInPayrollInfos < ActiveRecord::Migration[5.1]
  def change
    rename_column :payroll_infos, :scal_day_of_week, :sc_day_of_week
    add_column :payroll_infos, :sc_2day_of_week, :string
    add_column :payroll_infos, :sp_2day_of_week, :string
    add_column :payroll_infos, :sclr_2day_of_week, :string
    add_column :payroll_infos, :ven_bill_2day_of_week, :string
    add_column :payroll_infos, :ven_pay_2day_of_week, :string
    add_column :payroll_infos, :ven_clr_2day_of_week, :string
    rename_column :payroll_infos, :scal_day_time, :sc_day_time
    rename_column :payroll_infos, :scal_date_1, :sc_date_1
    rename_column :payroll_infos, :scal_date_2, :sc_date_2
    rename_column :payroll_infos, :scal_end_of_month, :sc_end_of_month
  end
end
