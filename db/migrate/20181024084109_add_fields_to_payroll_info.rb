class AddFieldsToPayrollInfo < ActiveRecord::Migration[5.1]
  def change

    # salary_process fields
    add_column :payroll_infos, :scal_day_time, :time
    add_column :payroll_infos, :scal_date_1, :date
    add_column :payroll_infos, :scal_date_2, :date
    add_column :payroll_infos, :scal_day_of_week, :string
    add_column :payroll_infos, :scal_end_of_month, :boolean, default: false    


    # salary_process fields
    add_column :payroll_infos, :sp_day_time, :time
    add_column :payroll_infos, :sp_date_1, :date
    add_column :payroll_infos, :sp_date_2, :date
    add_column :payroll_infos, :sp_day_of_week, :string
    add_column :payroll_infos, :sp_end_of_month, :boolean, default: false

    # salary_clear fields
    add_column :payroll_infos, :sclr_day_time, :time
    add_column :payroll_infos, :sclr_date_1, :date
    add_column :payroll_infos, :sclr_date_2, :date
    add_column :payroll_infos, :sclr_day_of_week, :string
    add_column :payroll_infos, :sclr_end_of_month, :boolean, default: false
  end
end
