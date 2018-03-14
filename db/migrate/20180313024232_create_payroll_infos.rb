class CreatePayrollInfos < ActiveRecord::Migration[5.1]
  def change
    create_table :payroll_infos do |t|
      t.belongs_to :company
      t.string :payroll_term
      t.string :payroll_type
      t.date :sal_cal_date
      t.date :payroll_date
      t.string :weekend_sch
      t.timestamps
    end
  end
end
