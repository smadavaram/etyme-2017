class AddSkillToCandidates < ActiveRecord::Migration
  def change
    add_column :candidates, :skills, :string
  end
end
