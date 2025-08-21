class AddSalaryIdsToExpense < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :expenses, :salary_ids, :text
  end
end
