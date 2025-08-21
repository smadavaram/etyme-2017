class AddCycleColumnInInvoice < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :invoices, :ig_cycle_id, :integer, index: true
    add_column :invoices, :number, :string, index: true
    add_column :timesheets, :inv_numbers, :text, array: true, default: []
  end
end
