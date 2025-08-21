class CreateExpenseItems < ActiveRecord::Migration[5.1]
  def change
    create_table :expense_items do |t|
      t.references :expenseable, polymorphic: true
      t.integer :quantity
      t.string :description
      t.integer :expense_type
      t.decimal :unit_price
    end
  end
end
