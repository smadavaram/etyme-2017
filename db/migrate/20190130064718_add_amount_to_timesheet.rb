class AddAmountToTimesheet < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :timesheets, :amount, :float
  end
end
