class ChangeApproveCycleIdToTextInExpense < ActiveRecord::Migration[5.1]
  def change
      change_column :expenses, :ce_ap_cycle_id, :text
  end
end
