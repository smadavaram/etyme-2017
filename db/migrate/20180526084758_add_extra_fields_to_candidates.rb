class AddExtraFieldsToCandidates < ActiveRecord::Migration[5.1]
  def change
    add_column :candidates, :candidate_visa, :string
    add_column :candidates, :candidate_title, :string
    add_column :candidates, :candidate_roal, :string
  end
end
