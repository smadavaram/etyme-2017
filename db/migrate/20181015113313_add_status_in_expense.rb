class AddStatusInExpense < ActiveRecord::Migration[5.1]
  def change
    add_column :expenses, :status, :integer
  end
end
