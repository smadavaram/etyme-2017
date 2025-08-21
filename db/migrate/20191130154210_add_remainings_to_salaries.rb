class AddRemainingsToSalaries < ActiveRecord::Migration[5.1]
  def change
    add_column :salaries, :previous_balance, :decimal, default: 0.0
  end
end
