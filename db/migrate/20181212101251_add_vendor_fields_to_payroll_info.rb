class AddVendorFieldsToPayrollInfo < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :payroll_infos, :ven_term_no_1, :string
    add_column :payroll_infos, :ven_term_no_2, :string
    add_column :payroll_infos, :ven_bill_date_1, :date
    add_column :payroll_infos, :ven_bill_date_2, :date
    add_column :payroll_infos, :ven_pay_date_1, :date
    add_column :payroll_infos, :ven_pay_date_2, :date
    add_column :payroll_infos, :ven_clr_date_1, :date
    add_column :payroll_infos, :ven_clr_date_2, :date
    add_column :payroll_infos, :ven_bill_day_time, :time
    add_column :payroll_infos, :ven_pay_day_time, :time
    add_column :payroll_infos, :ven_clr_day_time, :time
    add_column :payroll_infos, :ven_bill_end_of_month, :boolean
    add_column :payroll_infos, :ven_pay_end_of_month, :boolean
    add_column :payroll_infos, :ven_clr_end_of_month, :boolean
    add_column :payroll_infos, :ven_payroll_type, :string
    add_column :payroll_infos, :ven_term_num_1, :string
    add_column :payroll_infos, :ven_term_num_2, :string
    add_column :payroll_infos, :ven_term_1, :string
    add_column :payroll_infos, :ven_term_2, :string
    add_column :payroll_infos, :ven_bill_day_of_week, :string
    add_column :payroll_infos, :ven_pay_day_of_week, :string
    add_column :payroll_infos, :ven_clr_day_of_week, :string
  end
end 