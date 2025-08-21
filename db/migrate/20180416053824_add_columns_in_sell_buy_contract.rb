class AddColumnsInSellBuyContract < ActiveRecord::Migration[4.2][5.1]
  def change
    rename_column :sell_contracts, :date_1, :ts_date_1
    rename_column :sell_contracts, :date_2, :ts_date_2
    rename_column :sell_contracts, :end_of_month, :ts_end_of_month
    rename_column :sell_contracts, :day_of_week, :ts_day_of_week
    add_column :sell_contracts, :ts_day_time, :time
    add_column :sell_contracts, :invoice_day_time, :time
    add_column :sell_contracts, :cr_start_date, :date
    add_column :sell_contracts, :cr_end_date, :date
    add_column :sell_contracts, :ts_approve, :string
    add_column :sell_contracts, :ta_day_time, :time
    add_column :sell_contracts, :ta_date_1, :date
    add_column :sell_contracts, :ta_date_2, :date
    add_column :sell_contracts, :ta_end_of_month, :boolean, default: false
    add_column :sell_contracts, :ta_day_of_week, :string

    rename_column :buy_contracts, :date_1, :ts_date_1
    rename_column :buy_contracts, :date_2, :ts_date_2
    rename_column :buy_contracts, :end_of_month, :ts_end_of_month
    rename_column :buy_contracts, :day_of_week, :ts_day_of_week
    add_column :buy_contracts, :ts_day_time, :time
    add_column :buy_contracts, :pr_start_date, :date
    add_column :buy_contracts, :pr_end_date, :date
    add_column :buy_contracts, :ts_approve, :string
    add_column :buy_contracts, :ta_day_time, :time
    add_column :buy_contracts, :ta_date_1, :date
    add_column :buy_contracts, :ta_date_2, :date
    add_column :buy_contracts, :ta_end_of_month, :boolean, default: false
    add_column :buy_contracts, :ta_day_of_week, :string
    add_column :buy_contracts, :salary_calculation, :string
    add_column :buy_contracts, :sc_day_time, :time
    add_column :buy_contracts, :sc_date_1, :date
    add_column :buy_contracts, :sc_date_2, :date
    add_column :buy_contracts, :sc_end_of_month, :boolean, default: false
    add_column :buy_contracts, :sc_day_of_week, :string
    add_column :buy_contracts, :commission_payment_term, :integer
  end
end
