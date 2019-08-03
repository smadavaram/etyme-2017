class AddColumnInSellAndBuy < ActiveRecord::Migration[5.1]
  def change
    # == Buy contract attributes
    add_column :buy_contracts, :ts_2day_of_week, :string
    add_column :buy_contracts, :ta_2day_of_week, :string
    add_column :buy_contracts, :invoice_2day_of_week, :string
    add_column :buy_contracts, :ce_2day_of_week, :string
    add_column :buy_contracts, :ce_in_2day_of_week, :string
    add_column :buy_contracts, :pr_2day_of_week, :string
    add_column :buy_contracts, :sc_2day_of_week, :string
    add_column :buy_contracts, :sp_2day_of_week, :string
    add_column :buy_contracts, :sclr_2day_of_week, :string

# == Sell contract attributes
    add_column :sell_contracts, :ts_2day_of_week, :string
    add_column :sell_contracts, :ta_2day_of_week, :string
    add_column :sell_contracts, :invoice_2day_of_week, :string
    add_column :sell_contracts, :ce_2day_of_week, :string
    add_column :sell_contracts, :ce_in_2day_of_week, :string
    add_column :sell_contracts, :pr_2day_of_week, :string
  end
end
