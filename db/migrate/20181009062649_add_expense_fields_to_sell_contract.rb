class AddExpenseFieldsToSellContract < ActiveRecord::Migration[4.2][5.1]
  def change
    
    #client expense approve
    add_column :sell_contracts, :ce_approve, :string
    add_column :sell_contracts, :ce_ap_day_time, :time
    add_column :sell_contracts, :ce_ap_date_1, :date
    add_column :sell_contracts, :ce_ap_date_2, :date
    add_column :sell_contracts, :ce_ap_day_of_week, :string
    add_column :sell_contracts, :ce_ap_end_of_month, :boolean, default: false

    #client expense invoice
    add_column :sell_contracts, :ce_invoice, :string
    add_column :sell_contracts, :ce_in_day_time, :time
    add_column :sell_contracts, :ce_in_date_1, :date
    add_column :sell_contracts, :ce_in_date_2, :date
    add_column :sell_contracts, :ce_in_day_of_week, :string
    add_column :sell_contracts, :ce_in_end_of_month, :boolean, default: false
  end
end