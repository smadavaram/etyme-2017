class AddResumeToCandidate < ActiveRecord::Migration[4.2]
  def change
    add_column :candidates, :resume, :string
  end
end
