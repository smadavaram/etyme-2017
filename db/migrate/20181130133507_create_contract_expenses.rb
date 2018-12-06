class CreateContractExpenses < ActiveRecord::Migration[5.1]
  def change
    create_table :contract_expenses do |t|
      t.integer :contract_id
      t.integer :expense_type_id
      t.integer :cycle_id
      t.integer :candidate_id
      t.float :amount

      t.timestamps
    end
  end
end
