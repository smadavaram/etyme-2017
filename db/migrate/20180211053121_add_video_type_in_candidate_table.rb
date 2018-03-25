class AddVideoTypeInCandidateTable < ActiveRecord::Migration[5.1]
  def change
    add_column :candidates, :video_type, :string
  end
end
