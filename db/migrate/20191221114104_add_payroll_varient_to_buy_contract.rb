class AddPayrollVarientToBuyContract < ActiveRecord::Migration[5.1]
  def change
    add_reference :buy_contracts, :payroll_info, foreign_key: true
  end
end
