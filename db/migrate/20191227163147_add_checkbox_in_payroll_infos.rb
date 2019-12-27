class AddCheckboxInPayrollInfos < ActiveRecord::Migration[5.1]
  def change
    add_column :payroll_infos, :weekend_sch_daily, :boolean,default: :true
    add_column :payroll_infos, :weekend_sch_weekly, :boolean,default: :true
    add_column :payroll_infos, :weekend_sch_monthly, :boolean, default: :true
    add_column :payroll_infos, :weekend_sch_twice_a_month, :boolean,default: :true
    add_column :payroll_infos, :weekend_sch_biweekly, :boolean,default: :true
  end
end
