class AddContractExpenseToSalaries < ActiveRecord::Migration[5.1]
  def change
    add_column :salaries, :contract_expenses, :decimal, default: 0.0
  end
end
