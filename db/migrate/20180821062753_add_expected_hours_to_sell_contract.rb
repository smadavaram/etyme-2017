class AddExpectedHoursToSellContract < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :sell_contracts, :expected_hour, :float, default: 0
  end
end
