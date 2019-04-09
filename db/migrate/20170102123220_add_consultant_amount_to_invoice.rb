class AddConsultantAmountToInvoice < ActiveRecord::Migration[4.2]
  def change
    add_column :invoices, :consultant_amount, :float , default: 0.0
  end
end
