class AddVendorClearToBuyContract < ActiveRecord::Migration[5.1]
  def change
    add_column :buy_contracts, :vendor_clear, :string
    add_column :buy_contracts, :ven_clr_date_1, :date
    add_column :buy_contracts, :ven_clr_date_2, :date
    add_column :buy_contracts, :ven_clr_day_of_week, :string
    add_column :buy_contracts, :ven_clr_end_of_month, :boolean
    add_column :buy_contracts, :ven_clr_day_time, :time
    add_column :buy_contracts, :ven_term_1, :string
    add_column :buy_contracts, :ven_term_2, :string
    add_column :buy_contracts, :ven_term_num_1, :string
    add_column :buy_contracts, :ven_term_num_2, :string
  end
end
