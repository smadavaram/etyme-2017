class AddTimeSheetSettingColumn < ActiveRecord::Migration[5.1]
  def change

    add_column :sell_contracts, :first_date_of_timesheet, :date
    add_column :sell_contracts, :first_date_of_invoice, :date
    add_column :sell_contracts, :date_1, :date
    add_column :sell_contracts, :date_2, :date
    add_column :sell_contracts, :end_of_month, :boolean, default: false
    add_column :sell_contracts, :day_of_week, :string, default: false
    add_column :sell_contracts, :max_day_allow_for_timesheet, :integer
    add_column :sell_contracts, :max_day_allow_for_invoice, :integer

    add_column :buy_contracts, :first_date_of_timesheet, :date
    add_column :buy_contracts, :first_date_of_invoice, :date
    add_column :buy_contracts, :date_1, :date
    add_column :buy_contracts, :date_2, :date
    add_column :buy_contracts, :end_of_month, :boolean, default: false
    add_column :buy_contracts, :day_of_week, :string, default: false
    add_column :buy_contracts, :max_day_allow_for_timesheet, :integer
    add_column :buy_contracts, :max_day_allow_for_invoice, :integer
  end
end
