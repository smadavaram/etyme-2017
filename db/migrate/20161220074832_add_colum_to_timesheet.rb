class AddColumToTimesheet < ActiveRecord::Migration[4.2]
  def change
    add_column :timesheets, :invoice_id, :integer , index: true , foreign_key:true
    add_column :contracts, :next_invoice_date, :date
    add_column :timesheet_logs, :contract_term_id, :integer , index: true , foreign_key:true
    change_column :transactions, :total_time , :integer , default: 0.0
  end
end
