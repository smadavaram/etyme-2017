class RemoveExpenseIdFromExpenseAccount < ActiveRecord::Migration[4.2][5.1]
  def change
    remove_column :expense_accounts, :expense_id
    add_reference :expense_accounts, :expense, foreign_key: true
  end
end
