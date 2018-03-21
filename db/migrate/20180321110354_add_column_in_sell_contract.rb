class AddColumnInSellContract < ActiveRecord::Migration[5.1]
  def change
    add_column :sell_contracts, :invoice_date_1, :date
    add_column :sell_contracts, :invoice_date_2, :date
    add_column :sell_contracts, :invoice_end_of_month, :boolean, default: false
    add_column :sell_contracts, :invoice_day_of_week, :string, default: false
    add_column :sell_contracts, :payment_term, :decimal, default: 0.0
  end
end
