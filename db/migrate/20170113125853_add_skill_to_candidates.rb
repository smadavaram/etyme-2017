class AddSkillToCandidates < ActiveRecord::Migration[4.2]
  def change
    add_column :candidates, :skills, :string
  end
end
