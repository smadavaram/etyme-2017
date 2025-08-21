class AddFieldsToExpense < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :expenses, :ce_ap_cycle_id, :integer
    add_column :expenses, :ce_in_cycle_id, :integer
    add_column :client_expenses, :ce_in_cycle_id, :integer
  end
end
