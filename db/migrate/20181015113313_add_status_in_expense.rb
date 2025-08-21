class AddStatusInExpense < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :expenses, :status, :integer
  end
end
