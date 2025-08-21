class AddBranchArrayToGroups < ActiveRecord::Migration[5.2]
  def change
    add_column :groups, :branch_array, :text, array: true, default: []
  end
end
