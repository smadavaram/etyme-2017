class AddDescriptionToCandidates < ActiveRecord::Migration[4.2]
  def change
    add_column :candidates, :description, :string
  end
end
