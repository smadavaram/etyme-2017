class AddColumnsToEtymeTransactions < ActiveRecord::Migration[5.1]
  def change
    add_column :etyme_transactions, :is_processed, :boolean
    add_column :etyme_transactions, :transaction_user_type, :string
    add_column :etyme_transactions, :transaction_user_id, :string
  end
end
