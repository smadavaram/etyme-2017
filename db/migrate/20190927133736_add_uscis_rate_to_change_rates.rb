class AddUscisRateToChangeRates < ActiveRecord::Migration[5.1]
  def change
    add_column :change_rates, :uscis, :float
  end
end
