class AddContractExpenseTypeNameToContractExpense < ActiveRecord::Migration[5.1]
  def change
    add_column :contract_expenses, :con_ex_type, :string
  end
end
