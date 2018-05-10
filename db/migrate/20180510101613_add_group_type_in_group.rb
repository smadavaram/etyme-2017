class AddGroupTypeInGroup < ActiveRecord::Migration[5.1]
  def change
    add_column :groups, :member_type, :string
  end
end
