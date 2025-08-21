class AddSenderAndReceiverCompnayIntoInvoices < ActiveRecord::Migration[5.1]
  def change
    add_column :invoices, :sender_company_id, :bigint
    add_column :invoices, :receiver_company_id, :bigint
  end
end
