class AddSalaryFieldsToBuyContract < ActiveRecord::Migration[5.1]
  def change
    # salary_process fields
    add_column :buy_contracts, :salary_process, :string
    add_column :buy_contracts, :sp_day_time, :time
    add_column :buy_contracts, :sp_date_1, :date
    add_column :buy_contracts, :sp_date_2, :date
    add_column :buy_contracts, :sp_day_of_week, :string
    add_column :buy_contracts, :sp_end_of_month, :boolean, default: false

    # salary_clear fields
    add_column :buy_contracts, :salary_clear, :string
    add_column :buy_contracts, :sclr_day_time, :time
    add_column :buy_contracts, :sclr_date_1, :date
    add_column :buy_contracts, :sclr_date_2, :date
    add_column :buy_contracts, :sclr_day_of_week, :string
    add_column :buy_contracts, :sclr_end_of_month, :boolean, default: false
  end
end