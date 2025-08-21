class AddAncestryToUsers < ActiveRecord::Migration[5.1]
  def change
    add_column :users, :ancestry, :string
    add_index :users, :ancestry
  end
end
