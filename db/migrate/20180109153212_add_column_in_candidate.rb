class AddColumnInCandidate < ActiveRecord::Migration[5.1]
  def change
    add_column :candidates, :video, :string
  end
end