class ChangeApproveCycleIdToTextInExpense < ActiveRecord::Migration[4.2][5.1]
  def change
      change_column :expenses, :ce_ap_cycle_id, :text
  end
end
