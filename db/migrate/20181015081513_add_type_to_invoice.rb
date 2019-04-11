class AddTypeToInvoice < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :invoices, :invoice_type, :integer
  end
end
