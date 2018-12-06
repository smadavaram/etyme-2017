class CreateContractExpenseTypes < ActiveRecord::Migration[5.1]
  def change
    create_table :contract_expense_types do |t|
      t.string :name
      t.integer :status

      t.timestamps
    end
  end
end
