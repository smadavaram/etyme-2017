class AddColumnInCandidate < ActiveRecord::Migration
  def change
    add_column :candidates, :video, :string
  end
end