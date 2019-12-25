class AddPayrollInfoIdIntoBuyContract < ActiveRecord::Migration[5.1]
  def change
    add_column :buy_contracts, :payroll_info_id, :bigint
  end
end
