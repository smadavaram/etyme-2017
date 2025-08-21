class AddFieldsToExpenseAccount < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :expense_accounts, :payment, :integer
    add_column :expense_accounts, :balance_due, :integer
    add_column :expense_accounts, :check_no, :string
  end
end
