class AddFieldsToSalary < ActiveRecord::Migration[5.1]
  def change
    add_column :salaries, :total_amount, :decimal, default: "0.0"
    add_column :salaries, :commission_amount, :decimal, default: "0.0"
    add_column :salaries, :billing_amount, :decimal, default: "0.0"
    add_column :salaries, :total_approve_time, :integer, default: 0
    add_column :salaries, :rate, :decimal, default: "0.0"
    add_column :salaries, :balance, :decimal, default: "0.0"
  end
end
