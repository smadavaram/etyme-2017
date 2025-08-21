class CreateExpenseTypes < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :expense_types do |t|
      t.string :name

      t.timestamps
    end
  end
end
