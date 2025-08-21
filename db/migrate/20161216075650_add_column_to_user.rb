class AddColumnToUser < ActiveRecord::Migration[4.2]
  def change
    add_column :users, :ssn, :string
    add_column :users, :max_working_hours, :integer , default: 0 # max_working_hours in seconds 28800 = 8.hours
  end
end
