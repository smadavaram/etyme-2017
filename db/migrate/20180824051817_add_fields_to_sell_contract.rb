class AddFieldsToSellContract < ActiveRecord::Migration[4.2][5.1]
  def change
    # performance_review fields
    add_column :sell_contracts, :is_performance_review, :boolean, default: false
    add_column :sell_contracts, :performance_review, :string
    add_column :sell_contracts, :pr_day_time, :time
    add_column :sell_contracts, :pr_date_1, :date
    add_column :sell_contracts, :pr_date_2, :date
    add_column :sell_contracts, :pr_day_of_week, :string
    add_column :sell_contracts, :pr_end_of_month, :boolean, default: false

    # client_exepense fields
    add_column :sell_contracts, :is_client_expense, :boolean, default: false
    add_column :sell_contracts, :client_expense, :string
    add_column :sell_contracts, :ce_day_time, :time
    add_column :sell_contracts, :ce_date_1, :date
    add_column :sell_contracts, :ce_date_2, :date
    add_column :sell_contracts, :ce_day_of_week, :string
    add_column :sell_contracts, :ce_end_of_month, :boolean, default: false

  end
end
