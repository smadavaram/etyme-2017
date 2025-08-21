class AddSkillsToUser < ActiveRecord::Migration[4.2]
  def change
    add_column :users, :skills, :string
  end
end
