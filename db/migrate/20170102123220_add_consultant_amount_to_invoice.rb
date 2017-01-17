class AddConsultantAmountToInvoice < ActiveRecord::Migration
  def change
    add_column :invoices, :consultant_amount, :float , default: 0.0
  end
end
