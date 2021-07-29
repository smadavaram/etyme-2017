class AddColumnBranchoutname < ActiveRecord::Migration[5.2]
  def change
    add_column :groups, :branchoutname, :string
  end
end
