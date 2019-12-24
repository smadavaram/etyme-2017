class AddTitleToPayrollInfos < ActiveRecord::Migration[5.1]
  def change
    add_column :payroll_infos, :title, :string
  end
end
