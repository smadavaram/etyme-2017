class AddSubmittedByAndSubmittedOnInvoicesModel < ActiveRecord::Migration
  def change
    add_column :invoices ,:submitted_by,  :integer
    add_column :invoices ,:submitted_on, :datetime
    add_column :invoices ,:status ,:integer, default: 0
  end
end
