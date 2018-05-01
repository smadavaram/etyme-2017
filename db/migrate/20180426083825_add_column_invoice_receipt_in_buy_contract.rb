class AddColumnInvoiceReceiptInBuyContract < ActiveRecord::Migration[5.1]
  def change
    add_column :buy_contracts, :invoice_recepit, :string
    add_column :buy_contracts, :ir_day_time, :time
    add_column :buy_contracts, :ir_date_1, :date
    add_column :buy_contracts, :ir_date_2, :date
    add_column :buy_contracts, :ir_end_of_month, :boolean, default: false
    add_column :buy_contracts, :ir_day_of_week, :string
    add_column :buy_contracts, :payroll_date, :date
  end
end