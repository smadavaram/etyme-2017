class AddRateToInvoices < ActiveRecord::Migration
  def change
    add_column :invoices, :rate, :decimal , default: 0.0
  end
end
