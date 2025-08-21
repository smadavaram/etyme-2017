class AddGroupTypeInGroup < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :groups, :member_type, :string
  end
end
