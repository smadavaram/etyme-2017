class CreateEtymeTransactions < ActiveRecord::Migration[5.1]
  def change
    create_table :etyme_transactions do |t|
      t.integer :amount
      t.string :transaction_type
      t.string :salary_id
      t.string :contract_id
      t.string :contract_cycle_id
      t.string :description
      t.belongs_to :company
      t.timestamps
    end
  end
end
