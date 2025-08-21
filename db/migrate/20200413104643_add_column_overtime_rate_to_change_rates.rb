class AddColumnOvertimeRateToChangeRates < ActiveRecord::Migration[5.1]
  def change
    add_column :change_rates, :overtime_rate, :float
  end
end
