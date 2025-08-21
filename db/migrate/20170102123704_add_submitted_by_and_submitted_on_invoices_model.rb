class AddSubmittedByAndSubmittedOnInvoicesModel < ActiveRecord::Migration[4.2]
  def change
    add_column :invoices ,:submitted_by,  :integer
    add_column :invoices ,:submitted_on, :datetime
    add_column :invoices ,:status ,:integer, default: 0
  end
end
