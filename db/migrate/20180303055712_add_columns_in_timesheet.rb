class AddColumnsInTimesheet < ActiveRecord::Migration[4.2][5.1]
  def change
    enable_extension 'hstore'
    add_column :timesheets, :days, :hstore
  end
end
