class AddFieldsToBuyContract < ActiveRecord::Migration[5.1]
  def change
    # vendor_bill fields
    add_column :buy_contracts, :vendor_bill, :string
    add_column :buy_contracts, :vb_day_time, :time
    add_column :buy_contracts, :vb_date_1, :date
    add_column :buy_contracts, :vb_date_2, :date
    add_column :buy_contracts, :vb_day_of_week, :string
    add_column :buy_contracts, :vb_end_of_month, :boolean, default: false

    # client_bill fields
    add_column :buy_contracts, :client_bill, :string
    add_column :buy_contracts, :cb_day_time, :time
    add_column :buy_contracts, :cb_date_1, :date
    add_column :buy_contracts, :cb_date_2, :date
    add_column :buy_contracts, :cb_day_of_week, :string
    add_column :buy_contracts, :cb_end_of_month, :boolean, default: false

    # client_bill_payment fields
    add_column :buy_contracts, :client_bill_payment, :string
    add_column :buy_contracts, :cp_day_time, :time
    add_column :buy_contracts, :cp_date_1, :date
    add_column :buy_contracts, :cp_date_2, :date
    add_column :buy_contracts, :cp_day_of_week, :string
    add_column :buy_contracts, :cp_end_of_month, :boolean, default: false
    add_column :buy_contracts, :client_bill_payment_term, :integer
  end
end
