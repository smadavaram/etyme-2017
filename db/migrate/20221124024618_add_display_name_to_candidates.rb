class AddDisplayNameToCandidates < ActiveRecord::Migration[5.2]
  def change
    add_column :candidates, :display_name, :text
  end
end
