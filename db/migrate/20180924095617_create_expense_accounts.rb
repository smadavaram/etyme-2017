class CreateExpenseAccounts < ActiveRecord::Migration[5.1]
  def change
    create_table :expense_accounts do |t|
      t.string :expense_id
      t.string :expense_type
      t.text :description
      t.integer :status
      t.string :amount

      t.timestamps
    end
  end
end
