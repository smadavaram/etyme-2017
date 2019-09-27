class AddWorkingHrsToChangeRates < ActiveRecord::Migration[5.1]
  def change
    add_column :change_rates, :working_hrs, :float
  end
end
