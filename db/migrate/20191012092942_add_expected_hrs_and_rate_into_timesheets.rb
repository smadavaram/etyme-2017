class AddExpectedHrsAndRateIntoTimesheets < ActiveRecord::Migration[5.1]
  def change
    add_column :timesheets, :expected_hrs, :float
    add_column :timesheets, :rate, :float
  end
end
