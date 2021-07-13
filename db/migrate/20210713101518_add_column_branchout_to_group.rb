class AddColumnBranchoutToGroup < ActiveRecord::Migration[5.2]
  def change
    add_column :groups, :branchout, :string
  end
end
