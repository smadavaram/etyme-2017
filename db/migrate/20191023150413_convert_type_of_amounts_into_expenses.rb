class ConvertTypeOfAmountsIntoExpenses < ActiveRecord::Migration[5.1]
  def change
    change_column :expenses, :total_amount, :float, using: 'total_amount::float'
    change_column :expense_accounts, :amount, :float, using: 'amount::float'
  end
end
