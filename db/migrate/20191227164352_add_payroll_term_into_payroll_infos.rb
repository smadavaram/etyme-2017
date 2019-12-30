class AddPayrollTermIntoPayrollInfos < ActiveRecord::Migration[5.1]
  def change
    add_column :payroll_infos, :payroll_term_daily,:integer
    add_column :payroll_infos, :payroll_term_weekly,:integer
    add_column :payroll_infos, :payroll_term_monthly,:integer
    add_column :payroll_infos, :payroll_term_twice_a_month,:integer
    add_column :payroll_infos, :payroll_term_biweekly,:integer
    add_column :payroll_infos, :term_no_daily,:integer
    add_column :payroll_infos, :term_no_weekly,:integer
    add_column :payroll_infos, :term_no_monthly,:integer
    add_column :payroll_infos, :term_no_twice_a_month,:integer
    add_column :payroll_infos, :term_no_biweekly,:integer
  end
end
