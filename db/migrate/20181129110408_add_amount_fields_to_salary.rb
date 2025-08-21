class AddAmountFieldsToSalary < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :salaries, :pending_amount, :float
    add_column :salaries, :salary_advance, :float
    add_column :salaries, :approved_amount, :float
  end
end
