class AddTypeToInvoice < ActiveRecord::Migration[5.1]
  def change
    add_column :invoices, :invoice_type, :integer
  end
end
