class AddApproveTimeToInvoices < ActiveRecord::Migration
  def change
    add_column :invoices, :total_approve_time, :integer , default: 0
    add_column :invoices, :parent_id, :integer , index: true , foreign_key: true
  end
end
