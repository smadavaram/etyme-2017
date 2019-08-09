class AddColumnToSellContractCe < ActiveRecord::Migration[5.1]
  def change
    add_column :sell_contracts, :ce_ap_2day_of_week, :string
  end
end
