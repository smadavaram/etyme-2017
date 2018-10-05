class AddRemoveColumnFromExpense < ActiveRecord::Migration[5.1]
  def change
    remove_column :expense_accounts, :expense_type
    add_column :expense_accounts, :expense_type_id, :integer
  end
end
