class AddBillTypeToExpense < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :expenses, :bill_type, :integer
  end
end
