class AddRateToInvoices < ActiveRecord::Migration[4.2]
  def change
    add_column :invoices, :rate, :decimal , default: 0.0
  end
end
