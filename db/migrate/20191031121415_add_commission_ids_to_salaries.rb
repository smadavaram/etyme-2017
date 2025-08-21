class AddCommissionIdsToSalaries < ActiveRecord::Migration[5.1]
  def change
    add_column :salaries, :commission_ids, :text, array:true, default: []
  end
end
