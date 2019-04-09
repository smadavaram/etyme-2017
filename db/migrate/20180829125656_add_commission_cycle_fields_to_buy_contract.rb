class AddCommissionCycleFieldsToBuyContract < ActiveRecord::Migration[4.2][5.1]
  def change
    # commission_calculation fields
    add_column :buy_contracts, :commission_calculation, :string
    add_column :buy_contracts, :com_cal_day_time, :time
    add_column :buy_contracts, :com_cal_date_1, :date
    add_column :buy_contracts, :com_cal_date_2, :date
    add_column :buy_contracts, :com_cal_day_of_week, :string
    add_column :buy_contracts, :com_cal_end_of_month, :boolean, default: false

    # commission_process fields
    add_column :buy_contracts, :commission_process, :string
    add_column :buy_contracts, :com_pro_day_time, :time
    add_column :buy_contracts, :com_pro_date_1, :date
    add_column :buy_contracts, :com_pro_date_2, :date
    add_column :buy_contracts, :com_pro_day_of_week, :string
    add_column :buy_contracts, :com_pro_end_of_month, :boolean, default: false
  end
end