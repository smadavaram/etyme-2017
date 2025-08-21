class AddColumnInCandidate < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :candidates, :video, :string
  end
end